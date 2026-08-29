import { DateTime, Effect, Layer, Schema, Scope } from "effect"
import { AgentProgram, ProgramCapabilities, ProgramHost } from "../../core/index.js"
import type { ProgramResolution } from "../executable/resolver.js"
import type { ExecutionClaim, ExecutionRecord, Interface as RunStore } from "../run/store.js"
import { AgentExecutionFailure, RunTerminal, failureMessage } from "../errors.js"
import { make as makeProgramHost } from "../program/host.js"
import { programWait } from "../program/approval.js"

export const executeProgram = (input: {
  readonly claim: ExecutionClaim
  readonly claimed: ExecutionRecord
  readonly store: RunStore
  readonly resolution: ProgramResolution
}): Effect.Effect<void, never, Scope.Scope> => {
  const { claim, claimed, resolution, store } = input
  const programHost = makeProgramHost({
    claim,
    claimed,
    store,
    sandbox: resolution.sandbox,
    bindings: resolution.bindings,
  })
  const execution = AgentProgram.run(resolution.program, claimed.message.prompt).pipe(
    Effect.provideService(ProgramHost.ProgramHost, programHost),
  )
  const services = resolution.services
  const scopedExecution = Effect.scoped(
    services === undefined
      ? execution
      : Effect.scopedWith((scope) =>
          Effect.flatMap(Layer.buildWithScope(Layer.fresh(services), scope), (context) =>
            execution.pipe(Effect.provideContext(context)),
          ),
        ),
  )
  return scopedExecution.pipe(
    Effect.flatMap((value) =>
      (value === undefined
        ? Effect.succeed("undefined")
        : Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(value)
      ).pipe(
        Effect.map((encoded) => new TextEncoder().encode(encoded).byteLength),
        Effect.mapError((error) => AgentExecutionFailure.make({ message: failureMessage(error.message) })),
        Effect.flatMap((outputBytes) =>
          store.completeProgram({
            ...claim,
            output: value,
            outputBytes,
            outputLimit: resolution.program.pinned.manifest.budget.outputBytes,
          }),
        ),
      ),
    ),
    Effect.catch((error) =>
      store.inspect(claim.runId).pipe(
        Effect.flatMap((inspection) => {
          if (inspection.status === "needs-resolution") return Effect.void
          if (!Schema.is(ProgramCapabilities.ProgramSuspended)(error)) {
            return store.fail({
              ...claim,
              error: Schema.is(ProgramHost.ExecutionFailure)(error)
                ? error
                : AgentExecutionFailure.make({ message: failureMessage(String(error)) }),
            })
          }
          return Effect.gen(function* () {
            if ((yield* store.inspect(claim.runId)).status === "waiting") return
            const openedAt = yield* DateTime.now.pipe(Effect.map(DateTime.formatIso))
            const waitInput = {
              runId: claim.runId,
              operation: error.operation,
              capability: "program",
              request: null,
              reason: error.reason,
            }
            const wait =
              error.token === undefined ? programWait(waitInput) : programWait({ ...waitInput, token: error.token })
            yield* store.suspend({
              ...claim,
              suspension: error,
              checkpoint: { _tag: "Program", version: "1" },
              waits: [{ ...wait, status: "open", openedAt }],
            })
          })
        }),
        Effect.catch((failure) => (Schema.is(RunTerminal)(failure) ? Effect.void : Effect.fail(failure))),
      ),
    ),
    Effect.asVoid,
    Effect.orDie,
  )
}
