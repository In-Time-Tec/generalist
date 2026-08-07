import { DateTime, Effect, Layer, Schema, Scope } from "effect"
import { AgentProgram, ProgramCapabilities, ProgramHost } from "@batonfx/core"
import type { ProgramResolution } from "./executable-resolver.js"
import type { ExecutionClaim, ExecutionRecord, Interface as RunStore } from "./run-store.js"
import { AgentExecutionFailure, RunTerminal, failureMessage } from "./errors.js"
import { make as makeProgramHost } from "./program-host.js"
import { programWait } from "./program-approval.js"

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
  const execution = AgentProgram.run(resolution.program, claimed.message.prompt as never).pipe(
    Effect.provideService(ProgramHost.ProgramHost, programHost),
  )
  const scopedExecution = Effect.scoped(
    resolution.services === undefined
      ? execution
      : Effect.scopedWith((scope) => {
          const servicesLayer = resolution.services as Layer.Layer<never, never, never>
          return Effect.flatMap(Layer.buildWithScope(Layer.fresh(servicesLayer), scope), (services) =>
            execution.pipe(Effect.provideContext(services)),
          )
        }),
  )
  return scopedExecution.pipe(
    Effect.flatMap((value) =>
<<<<<<< HEAD
      Effect.try({
        try: () => new TextEncoder().encode(JSON.stringify(value)).byteLength,
        catch: (error) => AgentExecutionFailure.make({ message: failureMessage(String(error)) }),
      }).pipe(
=======
      (value === undefined
        ? Effect.succeed("undefined")
        : Schema.encodeEffect(Schema.UnknownFromJsonString)(value)
      ).pipe(
        Effect.map((encoded) => new TextEncoder().encode(encoded).byteLength),
        Effect.mapError((error) => AgentExecutionFailure.make({ message: error.message })),
>>>>>>> origin/main
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
        Effect.flatMap((inspection) =>
          inspection.status === "needs-resolution"
            ? Effect.void
            : Schema.is(ProgramCapabilities.ProgramSuspended)(error)
              ? Effect.gen(function* () {
                  if ((yield* store.inspect(claim.runId)).status === "waiting") return
                  const openedAt = yield* DateTime.now.pipe(Effect.map(DateTime.formatIso))
                  yield* store.suspend({
                    ...claim,
                    suspension: error,
                    checkpoint: { _tag: "Program", version: "1" },
                    wait: {
                      ...programWait({
                        runId: claim.runId,
                        operation: error.operation,
                        capability: "program",
                        request: null,
                        reason: error.reason,
                        ...(error.token === undefined ? {} : { token: error.token }),
                      }),
                      status: "open",
                      openedAt,
                    },
                  })
                })
              : store.fail({
                  ...claim,
                  error: Schema.is(ProgramHost.ExecutionFailure)(error)
                    ? error
                    : AgentExecutionFailure.make({ message: failureMessage(String(error)) }),
                }),
        ),
        Effect.catch((failure) => (Schema.is(RunTerminal)(failure) ? Effect.void : Effect.fail(failure))),
      ),
    ),
    Effect.asVoid,
    Effect.orDie,
  )
}
