import { Clock, Context, Crypto, DateTime, Deferred, Duration, Effect, Exit, Fiber, Ref, Scope, SynchronizedRef, Schema } from "effect"
import type { LayerOptions, StartExecutionError } from "../../runtime/service.js"
import { DurabilityFailure } from "../errors.js"
import * as Journal from "./journal.js"
import * as Codec from "./runtime-state.js"
import { type Definition, ownershipCommands } from "./runtime-command.js"
import { emptyState, type RuntimeState, type RuntimePublication } from "../../runtime/state/state.js"
import { PreparedObservation, occurredAtMillis, type Observations } from "../../runtime/state/observation.js"
import { publish } from "../../runtime/state/store/event/publications.js"
import { publish as publishArtifact } from "../../runtime/state/store/artifact/index.js"
import { publish as publishSession } from "../../runtime/state/store/host-session.js"
import { shutdownStore } from "../../runtime/state/store/events.js"
import { activationOf } from "../../runtime/state/store/activate.js"
import { RuntimeUnavailable } from "../../runtime/errors.js"

/** Canonical namespace and host configuration; construction only reconstructs state. */
export interface Options extends LayerOptions, Journal.Options {
  readonly workerId?: string
  readonly schedulerMode?: "poll" | "external"
  readonly reconcileInterval?: Duration.Input
  readonly ownershipLeaseMillis?: number
}

export type ActivationFailure = DurabilityFailure | RuntimeUnavailable | StartExecutionError

/** The returned fiber reports ownership failure and is interrupted with the caller's scope. */
export class Activation extends Context.Service<Activation, {
  readonly activate: Effect.Effect<Fiber.Fiber<never, ActivationFailure>, ActivationFailure, Scope.Scope>
}>()("generalist/durability/Activation") {}

/** Internal ownership boundary shared by store-only and executing hosts. */
export class StoreActivation extends Context.Service<StoreActivation, {
  readonly acquire: Effect.Effect<{
    readonly workerId: string
    readonly monitor: Effect.Effect<never, ActivationFailure>
    readonly incarnation: string
    readonly retire: Effect.Effect<void>
  }, ActivationFailure, Scope.Scope>
  readonly nextDueAt: Effect.Effect<number | undefined, ActivationFailure>
}>()("generalist/durability/internal/StoreActivation") {}

export const makeActivation = (
  acquire: Effect.Effect<Effect.Effect<never, ActivationFailure>, ActivationFailure, Scope.Scope>,
) => Activation.of({
  activate: Effect.gen(function* () {
    const ready = yield* Deferred.make<void, ActivationFailure>()
    const fiber = yield* Effect.forkScoped(Effect.scoped(Effect.gen(function* () {
      const run = yield* acquire
      yield* Deferred.succeed(ready, undefined)
      return yield* run
    })).pipe(Effect.onExit((exit) =>
      Exit.isFailure(exit) ? Deferred.failCause(ready, exit.cause).pipe(Effect.asVoid) : Effect.void)))
    yield* Deferred.await(ready).pipe(Effect.onInterrupt(() => Fiber.interrupt(fiber)))
    return fiber
  }),
})

export type ModifyState = <Input, A, E>(
  definition: Definition<Input, A>,
  input: Input,
  transition: (state: RuntimeState, input: Input) => Effect.Effect<readonly [A, RuntimeState], E, PreparedObservation>,
) => Effect.Effect<A, E | DurabilityFailure | RuntimeUnavailable>

/** Lease expiry advances authority; reconstruction never calls this transition. */
const releaseExpiredOwners = (state: RuntimeState, now: number) => {
  const workers = new Map(state.workers)
  const runs = new Map(state.runs)
  const sessions = new Map(state.sessions)
  for (const [id, lease] of workers) {
    if (lease.expiresAt > now) continue
    workers.delete(id)
    for (const [runId, run] of runs) {
      if (run.ownerId !== id) continue
      const { ownerId: _, ...released } = run
      runs.set(runId, { ...released, attemptFence: run.attemptFence + 1 })
      const session = sessions.get(run.message.sessionId)
      if (session?.writer?.runId === runId && session.writer.ownerId === id) {
        const { writer: _, ...releasedSession } = session
        sessions.set(run.message.sessionId, { ...releasedSession, writerEpoch: session.writerEpoch + 1n })
      }
    }
  }
  return { workers, runs, sessions }
}

/** Reconstruction reads only; explicit activation owns heartbeats and takeover. */
export const make = (options: Options) => Effect.gen(function* () {
  const journal = yield* Journal.make(options)
  const clock = yield* Clock.Clock
  const crypto = yield* Crypto.Crypto
  const leaseMillis = options.ownershipLeaseMillis ?? 30_000
  const interval = yield* Effect.try({
    try: () => Duration.toMillis(options.reconcileInterval ?? "250 millis"),
    catch: (cause) => DurabilityFailure.make({ reason: "configuration", message: `Invalid reconcileInterval: ${String(cause)}` }),
  })
  if (!Number.isSafeInteger(leaseMillis) || leaseMillis < 1000) {
    return yield* DurabilityFailure.make({ reason: "configuration", message: "ownershipLeaseMillis must be an integer of at least 1000" })
  }
  if (!Number.isFinite(interval) || interval <= 0 || interval >= leaseMillis / 2) {
    return yield* DurabilityFailure.make({ reason: "configuration", message: "reconcileInterval must be positive and less than half the ownership lease" })
  }
  if (options.scheduler?.concurrency !== undefined &&
    (!Number.isSafeInteger(options.scheduler.concurrency) || options.scheduler.concurrency <= 0)) {
    return yield* DurabilityFailure.make({ reason: "configuration", message: "scheduler concurrency must be a positive safe integer" })
  }
  const poll = yield* Effect.try({
    try: () => Duration.toMillis(options.scheduler?.pollInterval ?? "250 millis"),
    catch: (cause) => DurabilityFailure.make({ reason: "configuration", message: `Invalid scheduler pollInterval: ${String(cause)}` }),
  })
  if (!Number.isFinite(poll) || poll <= 0) {
    return yield* DurabilityFailure.make({ reason: "configuration", message: "scheduler pollInterval must be positive and finite" })
  }
  let owner: { readonly workerId: string; readonly incarnation: string } | undefined
  const stateRef = yield* SynchronizedRef.make(emptyState({
    addressBindings: new Map(options.addresses.map((entry) => [entry.address, entry.executable] as const)),
    subscriberQueueCapacity: options.subscriberQueueCapacity ?? 64,
  }))
  let commandCounter = 0
  let sequence = "-1"
  let active = false

  const install = (previous: RuntimeState, next: RuntimeState) => Effect.gen(function* () {
    const publications: Array<RuntimePublication> = []
    for (const [runId, run] of next.runs) {
      const old = previous.runs.get(runId)
      for (const event of run.events.slice((old?.lastSequence ?? -1) + 1)) {
        publications.push({ runId, event, lastDeliveredSequence: event.sequence - 1,
          subscribers: old?.subscribers ?? new Map(),
          treeSubscribers: previous.treeRoots.get(run.rootRunId)?.subscribers ?? new Map() })
      }
    }
    let delivered = yield* publish({ initial: { ...next, publications: [], artifactPublications: [] }, publications })
    for (const [sessionId, session] of next.hostSessions) {
      const old = previous.hostSessions.get(sessionId)
      for (const entry of session.events.slice(old?.events.length ?? 0)) {
        delivered = yield* publishSession({ state: delivered, publication: {
          sessionId, entry, lastDeliveredCursor: entry.cursor - 1, subscribers: old?.subscribers ?? new Map(),
        } })
      }
    }
    for (const [key, artifact] of next.artifacts) {
      const old = previous.artifacts.get(key)
      for (const update of artifact.updates.slice(old?.updates.length ?? 0)) {
        delivered = yield* publishArtifact({ state: delivered, publication: { key, update, subscribers: old?.subscribers ?? new Map() } })
      }
    }
    yield* Ref.set(stateRef.backing, delivered)
    if (active && options.activationProjection !== undefined) {
      const changes = [...next.runs].filter(([id, run]) => {
        const old = previous.runs.get(id)
        return old === undefined || JSON.stringify(activationOf(old)) !== JSON.stringify(activationOf(run))
      }).map(([, run]) => activationOf(run))
      if (changes.length > 0) yield* options.activationProjection.applyInTransaction(changes).pipe(Effect.ignore)
    }
    return delivered
  })
  const refresh = Effect.gen(function* () {
    const local = yield* Ref.get(stateRef.backing)
    if (local.closed) return yield* RuntimeUnavailable.make({ message: "runtime store released" })
    const head = yield* journal.read
    if (head.sequence === sequence) return local
    const next = yield* Codec.decode(head.state, local)
    const installed = yield* install(local, next)
    sequence = head.sequence
    return installed
  })
  const readState = stateRef.semaphore.withPermit(refresh)

  const modifyState: ModifyState = (definition, input, transition) =>
    Effect.gen(function* () {
      const encodedInput = yield* Codec.encodeCommandValue(input, definition.input)
      // Decode the normalized wire value, so opaque input objects cannot mutate a prepared command by alias.
      const prepared = yield* Codec.decodeReceipt(encodedInput, definition.input)
      const commandId = `${definition.tag}:${definition.identity(prepared)}`
      return yield* Effect.gen(function* () {
        let observations: Observations | undefined
        const result = yield* journal.commit({ id: commandId, input: {
          environment: options.environment, tenant: options.tenant, partition: options.partition,
          command: definition.tag, input: encodedInput,
        } }, (persisted) => Effect.gen(function* () {
          // Receipt reconciliation happens before this callback. Fresh observations never affect input identity.
          if (observations === undefined) {
            const now = yield* clock.currentTimeMillis
            observations = Object.freeze({ commandId, occurredAtMillis: now, occurredAt: new Date(now).toISOString() })
          }
          const local = yield* Ref.get(stateRef.backing)
          if (local.closed) return yield* RuntimeUnavailable.make({ message: "runtime store released" })
          const state = yield* Codec.decode(persisted, local)
          const [value, next] = yield* transition(state, prepared).pipe(Effect.provideService(PreparedObservation, observations))
          const encoded = yield* Codec.encode(next)
          const receipt = { value: yield* Codec.encodeCommandValue(value, definition.receipt), observations: { ...observations } }
          return { patches: Codec.diff(persisted, encoded), receipt }
        }))
        yield* refresh
        const envelope = yield* Schema.decodeUnknownEffect(Schema.Struct({
          value: Schema.Json,
          observations: Schema.Struct({ commandId: Schema.String, occurredAtMillis: Schema.Finite, occurredAt: Schema.String }),
        }))(result, { onExcessProperty: "error" }).pipe(Effect.mapError((cause) =>
          DurabilityFailure.make({ reason: "corruption", message: `Invalid command receipt: ${String(cause)}`, commandId })))
        return yield* Codec.decodeReceipt(envelope.value, definition.receipt)
      }).pipe((effect) => stateRef.semaphore.withPermit(effect), Effect.mapError((error) =>
        Schema.is(DurabilityFailure)(error) ? new DurabilityFailure({
          reason: error.reason,
          message: error.message,
          hint: error.hint,
          commandId,
          ...(error.key === undefined ? {} : { key: error.key }),
          ...(error.cause === undefined ? {} : { cause: error.cause }),
        }) : error))
    })

  const acquire = Effect.gen(function* () {
    if (owner !== undefined) return yield* RuntimeUnavailable.make({ message: "runtime host is already activated" })
    const incarnation = yield* crypto.randomUUIDv4.pipe(Effect.mapError((cause) =>
      DurabilityFailure.make({ reason: "crypto", message: `Cannot prepare host incarnation: ${String(cause)}` })))
    const workerId = options.workerId ?? incarnation
    if (workerId.length === 0) return yield* DurabilityFailure.make({ reason: "configuration", message: "workerId must be nonempty" })
    const current = { workerId, incarnation }
    yield* Effect.uninterruptible(Effect.gen(function* () {
    // Reserve locally before the first interruptible write, so concurrent activation cannot enter.
    if (owner !== undefined) return yield* RuntimeUnavailable.make({ message: "runtime host is already activated" })
    owner = current
    yield* Effect.addFinalizer(() => Effect.gen(function* () {
      active = false
      if (owner === current) owner = undefined
      yield* modifyState(ownershipCommands.release, [{
        commandId: `${incarnation}:release`, incarnation, owners: [workerId], leaseMillis,
      }], (state, [input]) => {
        const workers = new Map(state.workers)
        for (const id of input.owners) {
          if (workers.get(id)?.incarnation === input.incarnation) {
            workers.set(id, { incarnation: input.incarnation, expiresAt: 0 })
          }
        }
        return Effect.succeed([undefined, { ...state, workers }] as const)
      }).pipe(Effect.interruptible, Effect.timeoutOption(interval), Effect.ignore)
    }))
    }))
    yield* modifyState(ownershipCommands.acquire, [{
      commandId: `${incarnation}:acquire`, incarnation, owners: [workerId], leaseMillis,
    }], (state, [input]) => Effect.gen(function* () {
      const now = yield* occurredAtMillis
      const { workers, runs, sessions } = releaseExpiredOwners(state, now)
      for (const id of input.owners) {
        const lease = workers.get(id)
        if (lease !== undefined && lease.expiresAt > now && lease.incarnation !== input.incarnation) {
          return yield* RuntimeUnavailable.make({ message: `Worker ${id} belongs to a live host` })
        }
        workers.set(id, { incarnation: input.incarnation, expiresAt: now + input.leaseMillis })
      }
      return [undefined, { ...state, workers, runs, sessions }] as const
    }))
    const reconcile = () => modifyState(ownershipCommands.reconcile, [{
      commandId: `${incarnation}:reconcile:${++commandCounter}`, incarnation, owners: [workerId], leaseMillis,
    }], (state, [input]) => Effect.gen(function* () {
      const now = yield* occurredAtMillis
      const { workers, runs, sessions } = releaseExpiredOwners(state, now)
      for (const id of input.owners) {
        const lease = workers.get(id)
        if (lease === undefined || lease.incarnation !== input.incarnation || lease.expiresAt <= now) {
          return yield* RuntimeUnavailable.make({ message: `Worker ${id} lost its activation lease` })
        }
        workers.set(id, { incarnation: input.incarnation, expiresAt: now + input.leaseMillis })
      }
      return [undefined, { ...state, workers, runs, sessions }] as const
    }))
    yield* reconcile()
    active = true
    const heartbeat = Effect.gen(function* () {
      const state = yield* readState
      const now = yield* clock.currentTimeMillis
      const lease = state.workers.get(workerId)
      if (lease === undefined || lease.incarnation !== incarnation || lease.expiresAt <= now) {
        return yield* RuntimeUnavailable.make({ message: `Worker ${workerId} lost its activation lease` })
      }
      let expired = false
      for (const [id, worker] of state.workers) {
        if (id !== workerId && worker.expiresAt <= now) { expired = true; break }
      }
      if (lease.expiresAt - now <= leaseMillis / 2 || expired) {
        yield* reconcile()
      }
    })
    const monitor = Effect.sleep(interval).pipe(
      Effect.andThen(heartbeat.pipe(Effect.timeoutOption(leaseMillis / 2 - interval))),
      Effect.flatMap((result) => result._tag === "None"
        ? RuntimeUnavailable.make({ message: "runtime ownership heartbeat timed out" })
        : Effect.void),
      Effect.forever,
    )
    return { workerId, incarnation, monitor, retire: Effect.sync(() => { active = false }) }
  })
  const nextDueAt = readState.pipe(Effect.map((state) => {
    let next: number | undefined
    const include = (value: number) => { next = next === undefined ? value : Math.min(next, value) }
    for (const run of state.runs.values()) {
      if (run.ownerId === undefined && activationOf(run).intent !== "inactive") {
        include(0)
        break
      }
    }
    for (const wait of state.waits.values()) {
      if (wait.status === "open" && wait.reason._tag === "AwaitEvent" && wait.reason.deadline !== undefined) {
        include(DateTime.toEpochMillis(DateTime.makeUnsafe(wait.reason.deadline)))
      }
    }
    for (const schedule of state.schedules.values()) {
      const claim = state.scheduleClaims.get(schedule.scheduleId)
      include(Math.max(DateTime.toEpochMillis(DateTime.makeUnsafe(schedule.nextAt)),
        claim === undefined ? 0 : DateTime.toEpochMillis(DateTime.makeUnsafe(claim.leaseExpiresAt))))
    }
    for (const lease of state.workers.values()) include(lease.expiresAt)
    return next
  }))
  yield* readState
  yield* Effect.addFinalizer(() => shutdownStore(stateRef))
  return {
    stateRef,
    readState,
    modifyState,
    lookupReceipt: journal.lookupReceipt,
    activation: StoreActivation.of({ acquire, nextDueAt }),
    ownership: {
      require: (workerId: string) => Effect.suspend(() => active && owner?.workerId === workerId
        ? Effect.succeed({ incarnation: owner.incarnation, leaseMillis })
        : RuntimeUnavailable.make({ message: `Worker ${workerId} has no active host authority` })),
    } }
})
