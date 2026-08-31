import { Clock, Context, Deferred, Duration, Effect, Fiber, FiberMap, Layer, Option } from "effect"

const localExitObservationGrace = Duration.seconds(5)

const observeCancellation = (runId: string, target: Fiber.Fiber<void, unknown>) =>
  Effect.gen(function* () {
    const span = yield* Effect.option(Effect.currentSpan)
    if (Option.isSome(span)) span.value.event("generalist.runtime.cancel.interrupt_sent", yield* Clock.currentTimeNanos)
    const exit = yield* Fiber.await(target).pipe(Effect.timeoutOption(localExitObservationGrace))
    if (Option.isNone(exit)) {
      if (Option.isSome(span)) {
        span.value.event("generalist.runtime.cancel.grace_exceeded", yield* Clock.currentTimeNanos, {
          "generalist.runtime.cancel.pending": "local-fiber",
        })
      }
      yield* Fiber.await(target)
    }
    if (Option.isSome(span))
      span.value.event("generalist.runtime.cancel.local_exit_acknowledged", yield* Clock.currentTimeNanos)
  }).pipe(
    Effect.withSpan("Generalist.Runtime.cancel.localExit", {
      attributes: { "generalist.runtime.run_id": runId },
    }),
  )

export interface Service {
  readonly run: <E, R, R2 = never>(
    runId: string,
    execution: Effect.Effect<void, E, R>,
    afterExit?: Effect.Effect<void, never, R2>,
  ) => Effect.Effect<void, never, R | R2>
  readonly interrupt: (runId: string) => Effect.Effect<void>
  /** Run IDs this process is executing right now. A scheduler must not re-admit them. */
  readonly active: Effect.Effect<ReadonlySet<string>>
}

export class ActiveExecutions extends Context.Service<ActiveExecutions, Service>()(
  "generalist/runtime/execution/active-executions/ActiveExecutions",
) {}

export const layer: Layer.Layer<ActiveExecutions> = Layer.effect(
  ActiveExecutions,
  Effect.gen(function* () {
    const cancellationObservers = yield* FiberMap.make<string, void, never>()
    const active = yield* FiberMap.make<string, void, unknown>()
    return ActiveExecutions.of({
      run: (runId, execution, afterExit = Effect.void) =>
        Effect.uninterruptibleMask((restore) =>
          Effect.gen(function* () {
            const start = yield* Deferred.make<void>()
            const fiber = yield* FiberMap.run(active, runId, Deferred.await(start).pipe(Effect.andThen(execution)), {
              onlyIfMissing: true,
              startImmediately: true,
            })
            const admitted = Option.exists(FiberMap.getUnsafe(active, runId), (current) => current === fiber)
            yield* Deferred.succeed(start, undefined)
            if (!admitted) return
            const complete = Effect.gen(function* () {
              const observer = FiberMap.getUnsafe(cancellationObservers, runId)
              if (Option.isSome(observer)) yield* Fiber.await(observer.value)
              yield* afterExit
            })
            yield* restore(Fiber.await(fiber)).pipe(
              Effect.onInterrupt(() =>
                Effect.sync(() => fiber.interruptUnsafe()).pipe(
                  Effect.andThen(Fiber.await(fiber)),
                  Effect.andThen(complete),
                  Effect.asVoid,
                ),
              ),
            )
            yield* complete
          }),
        ),
      interrupt: (runId) =>
        Effect.gen(function* () {
          const fiber = FiberMap.getUnsafe(active, runId)
          if (Option.isNone(fiber)) return
          fiber.value.interruptUnsafe()
          yield* FiberMap.run(cancellationObservers, runId, observeCancellation(runId, fiber.value), {
            onlyIfMissing: true,
            startImmediately: true,
          })
        }),
      active: Effect.sync(() => new Set(Array.from(active, ([runId]) => runId))),
    })
  }),
)
