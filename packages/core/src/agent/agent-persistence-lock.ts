import { Context, Effect, Layer, RcMap, Scope, Semaphore } from "effect"
import { Chat } from "effect/unstable/ai"

/** @experimental Shared resources owned by persisted agent runs. */
export interface RuntimeInterface {
  readonly persistenceSemaphore: (
    persistence: Chat.Persistence.Service,
    chatId: string,
  ) => Effect.Effect<Semaphore.Semaphore, never, Scope.Scope>
}

/** @experimental Application-scoped owner for resources shared across agent runs. */
export class Runtime extends Context.Service<Runtime, RuntimeInterface>()(
  "@batonfx/core/agent/agent-persistence-lock/Runtime",
) {}

/** @experimental Build one application-scoped agent runtime. */
export const makeRuntime: Effect.Effect<RuntimeInterface, never, Scope.Scope> = Effect.gen(function* () {
  const persistenceLocks = yield* RcMap.make({
    lookup: (_persistence: Chat.Persistence.Service) =>
      RcMap.make({
        lookup: (_chatId: string) => Semaphore.make(1),
      }),
  })

  return Runtime.of({
    persistenceSemaphore: (persistence, chatId) =>
      RcMap.get(persistenceLocks, persistence).pipe(Effect.flatMap((chatLocks) => RcMap.get(chatLocks, chatId))),
  })
})

/** @experimental Application-scoped owner for resources shared across agent runs. */
export const layerRuntime: Layer.Layer<Runtime> = Layer.effect(Runtime, makeRuntime)
