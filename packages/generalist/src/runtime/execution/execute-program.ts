import { DateTime, Effect, Layer, Schema, Scope } from "effect"
import { run } from "../../core/program/agent-program.js"
import { ProgramSuspended } from "../../core/program/capabilities.js"
import { ExecutionFailure, ProgramRunner } from "../../core/program/runner.js"
import type { ProgramResolution } from "../executable/resolver.js"
import type { ExecutionClaim, ExecutionRecord, Service as RunStore } from "../run/store.js"
import { failureMessage } from "../errors-internal.js"
import { AgentExecutionFailure, RunTerminal } from "../errors.js"
import { make as makeProgramRunner } from "../program/runner.js"
import { programWait } from "../program/approval.js"

export const executeProgram = (input: {
  readonly claim: ExecutionClaim
  readonly claimed: ExecutionRecord
  readonly store: RunStore
  readonly resolution: ProgramResolution
}): Effect.Effect<void, never, Scope.Scope> => {
  const { claim, claimed, resolution, store } = input
  const programRunner = makeProgramRunner({
    claim,
    claimed,
    store,
    executor: resolution.executor,
    handlers: resolution.handlers,
  })
  const execution = run(resolution.program, claimed.message.prompt).pipe(
    Effect.provideService(ProgramRunner, programRunner),
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
          if (!Schema.is(ProgramSuspended)(error)) {
            return store.fail({
              ...claim,
              error: Schema.is(ExecutionFailure)(error)
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
