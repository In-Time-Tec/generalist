import type { Vitest } from "@effect/vitest"
import type { Effect, Layer, Scope } from "effect"

export const ItLayer = {
  make: <R, R2, R3, E, A, E2>(
    methods: Vitest.MethodsNonLive<R>,
    name: string,
    make: () => readonly [Layer.Layer<R2, E, R3>, Effect.Effect<A, E2, R | R2 | R3>],
  ): void => {
    const [services, test] = make()
    methods.layer(services as Layer.Layer<R2, E, never>)(name, (layerMethods) => {
      layerMethods.effect(name, () => test as Effect.Effect<A, E2, R | R2 | Scope.Scope>)
    })
  },
}
