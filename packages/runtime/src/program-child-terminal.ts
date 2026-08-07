import { Effect, Function, Ref } from "effect"
import type { ExecutionResult } from "./execution-state.js"
import type { RunFailure } from "./run-event.js"
import type { ExecutionClaim, Interface as RunStore } from "./run-store.js"

export type DeferredProgramChildTerminal =
  | { readonly _tag: "Complete"; readonly result: ExecutionResult }
  | { readonly _tag: "Fail"; readonly error: RunFailure }

export const makeDeferredProgramChildTerminal = Ref.make<DeferredProgramChildTerminal | undefined>(undefined)

export const commitDeferredProgramChildTerminal: {
  (
    claim: ExecutionClaim,
    deferred: Ref.Ref<DeferredProgramChildTerminal | undefined>,
  ): (store: RunStore) => Effect.Effect<void, import("./run-store.js").WorkerMutationError, never>
  (
    store: RunStore,
    claim: ExecutionClaim,
    deferred: Ref.Ref<DeferredProgramChildTerminal | undefined>,
  ): Effect.Effect<void, import("./run-store.js").WorkerMutationError, never>
} = Function.dual(
  3,
  (store: RunStore, claim: ExecutionClaim, deferred: Ref.Ref<DeferredProgramChildTerminal | undefined>) =>
    Ref.get(deferred).pipe(
      Effect.flatMap((terminal) =>
        terminal === undefined
          ? Effect.void
          : terminal._tag === "Complete"
            ? store.complete({ ...claim, result: terminal.result }).pipe(Effect.asVoid)
            : store.fail({ ...claim, error: terminal.error }),
      ),
    ),
)
