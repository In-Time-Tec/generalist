import {
  Cause,
  Clock,
  Context,
  Crypto,
  Deferred,
  Effect,
  Exit,
  Fiber,
  Function,
  Layer,
  Predicate,
  Scope,
  Semaphore,
} from "effect"
import type { ActivationFailure, Options as DurabilityOptions } from "../../../durability/internal/runtime.js"
import { activate } from "../../../durability/activation.js"
import { layerRunStore as layerRunStoreDurability } from "../../../runtime/state/store.js"
import { layer as layerDurability, type RuntimeServices } from "../../../runtime/state/layer.js"
import { layer as r2Layer, type Bucket } from "../../../durability/r2.js"
import { LocalScheduler, type DrainResult, type SchedulerError } from "../../../runtime/execution/local-scheduler.js"
import { RuntimeUnavailable } from "../../../runtime/errors.js"
import { ExecutableResolver } from "../../../runtime/executable/resolver.js"

/** @experimental A partition's canonical R2 binding and explicit namespace. */
export interface Options extends DurabilityOptions {
  readonly bucket: Bucket
}

/** @experimental The one native alarm slot is a wake hint, never canonical Runtime state. */
export interface AlarmStorage {
  readonly getAlarm: () => Promise<number | null>
  readonly setAlarm: (time: number) => Promise<void>
}

/** @experimental Configuration for an application-owned Durable Object host. */
export interface HostOptions extends Omit<Options, "schedulerMode"> {
  readonly storage: AlarmStorage
  /** Bounds candidates examined by an alarm, not the duration of admitted execution. */
  readonly fuel?: number
}

/** @experimental Concurrent commands and alarms share authority until their last call completes. */
export interface Host {
  /** Supplies Runtime services and a command scope, preserving other requirements and each receipt. */
  readonly run: <A, E, R>(
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | ActivationFailure, Exclude<R, RuntimeServices | Scope.Scope>>
  /** Install as the application's native alarm handler; duplicate delivery is safe. */
  readonly alarm: Effect.Effect<DrainResult, ActivationFailure>
}

/**
 * @experimental Construct once in the application's scope; no Runtime work starts in construction.
 * Calls initialize single-flight, observe ownership failure, and release idle execution scopes.
 * The application supplies Crypto and its exact persisted executable resolver.
 */
export const make = ({
  storage,
  fuel = 64,
  bucket,
  ...options
}: HostOptions): Effect.Effect<Host, RuntimeUnavailable, Scope.Scope | Crypto.Crypto | ExecutableResolver> =>
  Effect.gen(function* () {
    if (!Number.isSafeInteger(fuel) || fuel <= 0) {
      return yield* RuntimeUnavailable.make({ message: "scheduler fuel must be a positive safe integer" })
    }
    const dependencies = Context.make(Crypto.Crypto, yield* Crypto.Crypto).pipe(
      Context.add(ExecutableResolver, yield* ExecutableResolver),
    )
    const lifecycle = yield* Semaphore.make(1)
    const alarms = yield* Semaphore.make(1)
    const shutdown = yield* Deferred.make<void>()
    let closed = false
    let current:
      | {
          readonly scope: Scope.Closeable
          readonly services: Context.Context<RuntimeServices>
          readonly ownership: Fiber.Fiber<never, ActivationFailure>
          readonly idle: Deferred.Deferred<void>
          users: number
        }
      | undefined

    const alarmFailure = () => RuntimeUnavailable.make({ message: "Durable Object Runtime alarm could not be armed" })
    const arm = (dueAt: number) =>
      alarms
        .withPermit(
          Effect.gen(function* () {
            const previous = yield* Effect.tryPromise({ try: () => storage.getAlarm(), catch: alarmFailure })
            const next = Math.max(1, dueAt)
            if (previous === null || next < previous) {
              yield* Effect.tryPromise({ try: () => storage.setAlarm(next), catch: alarmFailure })
            }
          }),
        )
        .pipe(
          Effect.catchTag("generalist/runtime/RuntimeUnavailable", () =>
            Effect.logWarning(
              "Durable Object Runtime alarm could not be armed; independent reconciliation is required",
            ),
          ),
        )
    const notify = Clock.currentTimeMillis.pipe(Effect.flatMap(arm))
    const acquire = lifecycle.withPermit(
      Effect.gen(function* () {
        if (closed) return yield* RuntimeUnavailable.make({ message: "Durable Object Runtime host is closed" })
        if (current === undefined) {
          const scope = yield* Scope.make()
          const initialized = yield* Effect.gen(function* () {
            const services = yield* Layer.build(
              layerDurability({ ...options, schedulerMode: "external" }).pipe(Layer.provide(r2Layer(bucket))),
            )
            const ownership = yield* activate.pipe(Effect.provideContext(services))
            const idle = yield* Deferred.make<void>()
            return { scope, services, ownership, idle, users: 0 }
          }).pipe(
            Scope.provide(scope),
            Effect.provideContext(dependencies),
            Effect.onExit((exit) => (Exit.isFailure(exit) ? Scope.close(scope, exit) : Effect.void)),
          )
          current = initialized
        }
        current.users += 1
        return current
      }),
    )
    const use = <A, E, R>(
      effect: Effect.Effect<A, E, R>,
      after: Effect.Effect<void> = Effect.void,
    ): Effect.Effect<A, E | ActivationFailure, Exclude<R, RuntimeServices | Scope.Scope>> =>
      Effect.acquireUseRelease(
        acquire,
        (active) =>
          Effect.acquireUseRelease(
            Scope.make(),
            (scope) =>
              Effect.raceFirst(
                effect.pipe(Effect.provideContext(Context.add(active.services, Scope.Scope, scope))),
                Effect.raceFirst(
                  Fiber.join(active.ownership).pipe(
                    Effect.onError((cause) =>
                      Cause.hasInterruptsOnly(cause)
                        ? Effect.void
                        : Effect.logError("Durable Object Runtime ownership failed", cause),
                    ),
                  ),
                  Deferred.await(shutdown).pipe(Effect.andThen(Effect.interrupt)),
                ),
              ),
            Scope.close,
          ).pipe(Effect.onExit(() => after)),
        (active, exit) =>
          lifecycle.withPermit(
            Effect.gen(function* () {
              active.users -= 1
              if (active.users !== 0) return
              yield* Scope.close(active.scope, exit)
              current = undefined
              yield* Deferred.succeed(active.idle, undefined)
            }),
          ),
      )
    yield* Effect.addFinalizer(() =>
      Effect.gen(function* () {
        const idle = yield* lifecycle.withPermit(
          Effect.sync(() => {
            closed = true
            return current?.idle
          }),
        )
        yield* Deferred.succeed(shutdown, undefined)
        if (idle !== undefined) yield* Deferred.await(idle)
      }),
    )
    return {
      run: (effect) => use(effect, notify),
      alarm: use(
        Effect.gen(function* () {
          const scheduler = yield* LocalScheduler
          const result = yield* scheduler.drain({ fuel })
          if (result.hasMore) yield* notify
          else if (result.nextDueAt !== undefined) yield* arm(result.nextDueAt)
          return result
        }),
      ),
    }
  })

/** @experimental Native R2 persistence; Durable Object storage is never runtime authority. */
export const layerRunStore = ({ bucket, ...options }: Options) =>
  layerRunStoreDurability(options).pipe(Layer.provide(r2Layer(bucket)))

/** @experimental Scoped execution host. Alarm-driven hosts use schedulerMode: "external". */
export const layer = ({ bucket, ...options }: Options) =>
  Layer.effectDiscard(activate).pipe(Layer.provideMerge(layerDurability(options).pipe(Layer.provide(r2Layer(bucket)))))

/**
 * @experimental Run from an independent Cron Trigger or queue consumer for every configured partition.
 * Alarms only accelerate this reconciliation: losing an alarm cannot erase canonical work.
 * The application supplies Crypto and its pinned ExecutableResolver, just as for the Durable Object.
 */
export const reconcile: {
  (options: Options, fuel?: number): Reconciliation
  (fuel?: number): (options: Options) => Reconciliation
} = Function.dual(
  (args) => Predicate.isObject(args[0]),
  (options: Options, fuel: number = 64): Reconciliation =>
    Effect.scoped(
      Effect.gen(function* () {
        const services = yield* Layer.build(layer({ ...options, schedulerMode: "external" }))
        return yield* Effect.gen(function* () {
          const scheduler = yield* LocalScheduler
          return yield* scheduler.drain({ fuel })
        }).pipe(Effect.provideContext(services))
      }),
    ),
)

type Reconciliation = Effect.Effect<
  DrainResult,
  SchedulerError | Layer.Error<ReturnType<typeof layer>>,
  Layer.Services<ReturnType<typeof layer>>
>
