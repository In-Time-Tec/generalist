import { Context, Effect, Fiber, Layer, SynchronizedRef } from "effect"

export interface Interface {
  readonly run: <E, R>(runId: string, execution: Effect.Effect<void, E, R>) => Effect.Effect<void, never, R>
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
      run: (runId, execution) =>
        Effect.gen(function* () {
          const fiber = yield* execution.pipe(Effect.forkChild({ startImmediately: false }))
          yield* SynchronizedRef.update(active, (current) => new Map(current).set(runId, fiber))
          yield* Fiber.await(fiber).pipe(
            Effect.ensuring(
              SynchronizedRef.update(active, (current) => {
                const next = new Map(current)
                next.delete(runId)
                return next
              }),
            ),
          )
        }),
      interrupt: (runId) =>
        SynchronizedRef.get(active).pipe(
          Effect.flatMap((current) => {
            const fiber = current.get(runId)
            return fiber === undefined ? Effect.void : Fiber.interrupt(fiber).pipe(Effect.asVoid)
          }),
        ),
    })
  }),
)
