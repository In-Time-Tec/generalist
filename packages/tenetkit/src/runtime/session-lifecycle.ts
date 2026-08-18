import { Effect, Pull, Stream } from "effect"
import { RuntimeUnavailable } from "./errors.js"
import { isTerminal } from "./run.js"
import type { Interface as RunStore } from "./run-store.js"

export const awaitSessionTerminal = (input: {
  readonly store: RunStore
  readonly sessionId: string
}): Effect.Effect<void, RuntimeUnavailable> =>
  Effect.gen(function* () {
    const roots = yield* input.store.sessionRoots(input.sessionId)
    yield* Effect.forEach(
      roots,
      (rootRunId) =>
        Effect.scoped(
          Effect.gen(function* () {
            const pull = yield* Stream.toPull(input.store.treeChanges(rootRunId))
            const awaitTerminal: Effect.Effect<void, RuntimeUnavailable> = Effect.suspend(() =>
              input.store.inspectTree(rootRunId).pipe(
                Effect.flatMap((inspection) =>
                  inspection.runs.every((entry) => isTerminal(entry.run.status))
                    ? Effect.void
                    : Effect.raceFirst(pull.pipe(Pull.catchDone(() => Effect.void)), Effect.sleep("1 second")).pipe(
                        Effect.andThen(awaitTerminal),
                      ),
                ),
                Effect.mapError((error) =>
                  error._tag === "tenetkit/runtime/RuntimeUnavailable"
                    ? error
                    : RuntimeUnavailable.make({ message: `session tree ${rootRunId} unavailable` }),
                ),
              ),
            )
            yield* awaitTerminal
          }),
        ),
      { concurrency: "unbounded", discard: true },
    )
  })
