import { Effect, Function, Layer, Scope } from "effect"

/**
 * Builds `layer` in a fresh scope and provides its services to `effect`,
 * closing the layer when the effect completes.
 */
export const provideScoped = Function.dual<
  <A2, E2, R2>(
    layer: Layer.Layer<A2, E2, R2>,
  ) => <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E | E2, Scope.Scope | R2 | Exclude<R, A2>>,
  <A, E, R, A2, E2, R2>(
    layer: Layer.Layer<A2, E2, R2>,
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | E2, Scope.Scope | R2 | Exclude<R, A2>>
>(
  2,
  <A, E, R, A2, E2, R2>(
    layer: Layer.Layer<A2, E2, R2>,
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E | E2, Scope.Scope | R2 | Exclude<R, A2>> =>
    Effect.scoped(Effect.flatMap(Layer.build(layer), (context) => effect.pipe(Effect.provideContext(context)))),
)
