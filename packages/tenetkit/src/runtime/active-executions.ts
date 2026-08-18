import { Context, Effect, Fiber, Layer, SynchronizedRef } from "effect"

export interface Interface {
  readonly run: <E, R>(runId: string, execution: Effect.Effect<void, E, R>) => Effect.Effect<void, never, R>
  readonly interrupt: (runId: string) => Effect.Effect<void>
  readonly cancellationRequested: (runId: string) => Effect.Effect<boolean>
  /** Run IDs this process is executing right now. A scheduler must not re-admit them. */
  readonly active: Effect.Effect<ReadonlySet<string>>
}

interface ActiveExecution {
  fiber: Fiber.Fiber<void, unknown> | undefined
  cancellationRequested: boolean
}

export class ActiveExecutions extends Context.Service<ActiveExecutions, Interface>()(
  "tenetkit/runtime/active-executions/ActiveExecutions",
) {}

export const layer: Layer.Layer<ActiveExecutions> = Layer.effect(
  ActiveExecutions,
  Effect.gen(function* () {
    const active = yield* SynchronizedRef.make<ReadonlyMap<string, ActiveExecution>>(new Map())
    return ActiveExecutions.of({
      run: (runId, execution) =>
        Effect.uninterruptibleMask((restore) => {
          const entry: ActiveExecution = { fiber: undefined, cancellationRequested: false }
          return Effect.gen(function* () {
            yield* SynchronizedRef.update(active, (current) => new Map(current).set(runId, entry))
            const fiber = yield* execution.pipe(Effect.forkChild({ startImmediately: false }))
            entry.fiber = fiber
            if (entry.cancellationRequested) fiber.interruptUnsafe()
            yield* restore(Fiber.await(fiber))
          }).pipe(
            Effect.ensuring(
              SynchronizedRef.update(active, (current) => {
                if (current.get(runId) !== entry) return current
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
            const entry = current.get(runId)
            if (entry === undefined) return Effect.void
            return Effect.sync(() => {
              entry.cancellationRequested = true
              entry.fiber?.interruptUnsafe()
            })
          }),
        ),
      cancellationRequested: (runId) =>
        SynchronizedRef.get(active).pipe(Effect.map((current) => current.get(runId)?.cancellationRequested === true)),
      active: SynchronizedRef.get(active).pipe(Effect.map((current) => new Set(current.keys()))),
    })
  }),
)
