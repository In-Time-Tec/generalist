import { Context, Deferred, Effect, Fiber, Layer, Scope } from "effect"
import { LanguageModel } from "effect/unstable/ai"

/** @experimental */
export const make = (model: Layer.Layer<LanguageModel.LanguageModel>) => {
  const fibers = new WeakMap<
    Scope.Scope,
    Deferred.Deferred<Fiber.Fiber<Context.Context<LanguageModel.LanguageModel>>>
  >()
  return <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    Effect.contextWith((context: Context.Context<never>) => {
      const memoMap = Context.getOrUndefined(context, Layer.CurrentMemoMap)
      const scope = Context.getOrUndefined(context, Scope.Scope)
      if (memoMap === undefined || scope === undefined) {
        return Effect.scoped(
          Layer.build(model).pipe(Effect.flatMap((modelContext) => effect.pipe(Effect.provide(modelContext)))),
        )
      }
      const sharedFiber = Effect.uninterruptible(
        Effect.sync(() => {
          const existing = fibers.get(scope)
          if (existing !== undefined) return [existing, false] as const
          const created = Deferred.makeUnsafe<Fiber.Fiber<Context.Context<LanguageModel.LanguageModel>>>()
          fibers.set(scope, created)
          return [created, true] as const
        }).pipe(
          Effect.flatMap(([deferred, start]) =>
            start
              ? Effect.forkIn(Layer.buildWithMemoMap(model, memoMap, scope), scope, {
                  startImmediately: true,
                }).pipe(
                  Effect.tap((fiber) => Deferred.succeed(deferred, fiber)),
                  Effect.as(deferred),
                )
              : Effect.succeed(deferred),
          ),
        ),
      )
      return sharedFiber.pipe(
        Effect.flatMap(Deferred.await),
        Effect.flatMap(Fiber.join),
        Effect.flatMap((modelContext) => effect.pipe(Effect.provide(modelContext))),
      )
    })
}
