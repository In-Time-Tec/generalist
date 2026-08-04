import { Context, Effect, Fiber, Layer, SynchronizedRef } from "effect"

export interface Interface {
  readonly begin: (runId: string, fiber: Fiber.Fiber<void, unknown>) => Effect.Effect<void>
  readonly end: (runId: string) => Effect.Effect<void>
  readonly interrupt: (runId: string) => Effect.Effect<void>
}

export class ActiveExecutions extends Context.Service<ActiveExecutions, Interface>()(
  "@batonfx/runtime/ActiveExecutions",
) {}

export const layer: Layer.Layer<ActiveExecutions> = Layer.effect(
  ActiveExecutions,
  Effect.gen(function* () {
    const active = yield* SynchronizedRef.make<ReadonlyMap<string, Fiber.Fiber<void, unknown>>>(new Map())
    return ActiveExecutions.of({
      begin: (runId, fiber) => SynchronizedRef.update(active, (current) => new Map(current).set(runId, fiber)),
      end: (runId) =>
        SynchronizedRef.update(active, (current) => {
          const next = new Map(current)
          next.delete(runId)
          return next
        }),
      interrupt: (runId) =>
        SynchronizedRef.get(active).pipe(
          Effect.flatMap((current) => {
            const fiber = current.get(runId)
            return fiber === undefined ? Effect.void : Effect.sync(() => fiber.interruptUnsafe())
          }),
        ),
    })
  }),
)
