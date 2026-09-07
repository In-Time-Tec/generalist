import { Clock, Context, Crypto, Effect, Fiber, FiberSet, Layer, Semaphore } from "effect"
import { Activation, StoreActivation, makeActivation, type Options, type ActivationFailure } from "../../durability/internal/runtime.js"
import type { ObjectStore } from "../../durability/object-store.js"
import { ExternalChildStore } from "../child/external/store.js"
import { RuntimeUnavailable } from "../errors.js"
import { ExecutableResolver } from "../executable/resolver.js"
import { layer as activeExecutionsLayer, ActiveExecutions } from "../execution/active-executions.js"
import { layerRegisteredAgents as runExecutorLayer, RunExecutor } from "../execution/run-executor.js"
import { LocalScheduler, type Service as SchedulerService } from "../execution/local-scheduler.js"
import { make as makeLocalScheduler } from "../execution/local-scheduler-internal.js"
import { layer as modelPreviewLayer } from "../execution/model-response/preview-internal.js"
import { RunStore } from "../run/store.js"
import { Runtime } from "../service.js"
import { make as makeRegisteredAgents } from "../executable/registered-agent.js"
import { layerRegisteredAgents as runtimeLayer } from "../hosting/service.js"
import { layerRunStore } from "./store.js"
import { make as makeTriggerScheduler } from "../execution/trigger/scheduler.js"

export { makeRuntime } from "../hosting/service.js"

export type RuntimeServices = Runtime | RunStore | ExternalChildStore | RunExecutor | LocalScheduler | Activation

/** Reconstruct a partition without acquiring authority or starting execution. */
export const layer = (
  options: Options,
): Layer.Layer<RuntimeServices, ActivationFailure, ObjectStore | Crypto.Crypto | ExecutableResolver> =>
  Layer.suspend(() => {
    const store = layerRunStore(options)
    const agents = makeRegisteredAgents()
    const dependencies = Layer.mergeAll(store, activeExecutionsLayer, modelPreviewLayer)
    const runtime = runtimeLayer(agents)(options).pipe(Layer.provide(dependencies))
    const host = runExecutorLayer(agents).pipe(Layer.provide(Layer.merge(dependencies, runtime)))
    const activation = Layer.effectContext(Effect.gen(function* () {
      const ownership = yield* StoreActivation
      const runStore = yield* RunStore
      const executor = yield* RunExecutor
      const active = yield* ActiveExecutions
      const runtime = yield* Runtime
      const services = Context.make(RunStore, runStore).pipe(
        Context.add(RunExecutor, executor), Context.add(ActiveExecutions, active), Context.add(Runtime, runtime),
      )
      let running: SchedulerService | undefined
      const current = Effect.suspend(() => running === undefined
        ? RuntimeUnavailable.make({ message: "runtime scheduler is not activated" })
        : Effect.succeed(running))
      const prepare = <A, E, R>(command: (scheduler: SchedulerService) => Effect.Effect<A, E, R>) => {
        let prepared: { readonly scheduler: SchedulerService; readonly effect: Effect.Effect<A, E, R> } | undefined
        return current.pipe(Effect.flatMap((scheduler): Effect.Effect<A, E | RuntimeUnavailable, R> => {
          if (prepared !== undefined && prepared.scheduler !== scheduler) {
            return RuntimeUnavailable.make({ message: "scheduler invocation belongs to a retired activation" })
          }
          prepared ??= { scheduler, effect: command(scheduler) }
          return prepared.effect
        }))
      }
      const acquire = Effect.gen(function* () {
        const lease = yield* ownership.acquire
        const scheduler = yield* makeLocalScheduler({ workerId: lease.workerId, ...options.scheduler }, lease.incarnation)
        const triggers = yield* makeTriggerScheduler(`trigger:${lease.incarnation}`)
        const drainLock = yield* Semaphore.make(1)
        const requests = yield* FiberSet.make<unknown, ActivationFailure>()
        const owned = <A, E extends ActivationFailure, R>(effect: Effect.Effect<A, E, R>) => Effect.gen(function* () {
          const fiber = yield* FiberSet.run(requests, effect)
          return yield* Fiber.join(fiber).pipe(Effect.onInterrupt(() => Fiber.interrupt(fiber)))
        })
        let triggersFirst = false
        const drain: SchedulerService["drain"] = ({ fuel = 64 } = {}) => {
          if (!Number.isSafeInteger(fuel) || fuel <= 0) {
            return RuntimeUnavailable.make({ message: "scheduler fuel must be a positive safe integer" })
          }
          triggersFirst = !triggersFirst
          const triggerFuel = fuel === 1 ? (triggersFirst ? 1 : 0) : Math.ceil(fuel / 2)
          const trigger = triggerFuel === 0 ? Effect.succeed({ processed: 0, hasMore: false }) : triggers.drain(triggerFuel)
          const remaining = fuel - triggerFuel
          const execute = remaining === 0
            ? Effect.succeed({ processed: 0, hasMore: false })
            : scheduler.drain({ fuel: remaining })
          return owned(Effect.gen(function* () {
            const triggered = yield* trigger
            const scheduled = yield* execute
            yield* scheduler.idle
            const nextDueAt = yield* ownership.nextDueAt
            const now = yield* Clock.currentTimeMillis
            const hasMore = triggered.hasMore || scheduled.hasMore || (nextDueAt !== undefined && nextDueAt <= now)
            return {
              processed: triggered.processed + scheduled.processed,
              hasMore,
              ...(hasMore ? { nextDueAt: now } : nextDueAt === undefined ? {} : { nextDueAt }),
            }
          }).pipe((effect) => drainLock.withPermit(effect), Effect.provideService(RunStore, runStore)))
        }
        const tick = Effect.gen(function* () {
          yield* triggers.tick
          yield* scheduler.tick
        }).pipe((effect) => drainLock.withPermit(effect), Effect.provideService(RunStore, runStore))
        running = {
          tick: owned(tick),
          drain,
          idle: owned(scheduler.idle),
          reconcileCancellation: (runId) => owned(scheduler.reconcileCancellation(runId)),
        }
        yield* Effect.addFinalizer(() => lease.retire.pipe(Effect.andThen(Effect.sync(() => { running = undefined }))))
        const poll = options.scheduler?.pollInterval ?? "250 millis"
        const monitor = Effect.raceFirst(lease.monitor, Effect.raceFirst(
          scheduler.failure, FiberSet.join(requests).pipe(Effect.andThen(Effect.never)),
        ))
        return options.schedulerMode === "external"
          ? monitor
          : Effect.raceFirst(monitor, Effect.sleep(poll).pipe(
            Effect.andThen(tick), Effect.forever,
          ))
      }).pipe(Effect.provide(services))
      return Context.make(Activation, makeActivation(acquire)).pipe(Context.add(LocalScheduler, LocalScheduler.of({
        tick: Effect.suspend(() => prepare((scheduler) => scheduler.tick)),
        drain: (input) => prepare((scheduler) => scheduler.drain(input)),
        idle: Effect.suspend(() => prepare((scheduler) => scheduler.idle)),
        reconcileCancellation: (runId) => prepare((scheduler) => scheduler.reconcileCancellation(runId)),
      })))
    })).pipe(Layer.provide(Layer.mergeAll(dependencies, runtime, host)))
    // The executing controller overrides the store-only activation service.
    return activation.pipe(Layer.provideMerge(Layer.mergeAll(runtime, host, store)))
  })
