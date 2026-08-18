import type { Vitest } from "@effect/vitest"
import type { Effect, Layer } from "effect"

export const ItLayer = {
  make: <R, R2, E, A, E2>(
    methods: Vitest.MethodsNonLive<R>,
    name: string,
    make: () => readonly [Layer.Layer<R2, E, R>, Effect.Effect<A, E2, R | R2>],
  ): void => {
    const [services, test] = make()
    methods.layer(services)(name, (layerMethods) => {
      layerMethods.effect(name, () => test)
    })
  },
}
