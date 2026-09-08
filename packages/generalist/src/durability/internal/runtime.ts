import { publishChanges } from "./runtime-state/publications.js"
import {
  Clock,
  Context,
  Crypto,
  DateTime,
  Deferred,
  Duration,
  Effect,
  Exit,
  Fiber,
  Layer,
  Ref,
  Scope,
  SynchronizedRef,
  Schema,
} from "effect"
import type { LayerOptions, StartExecutionError } from "../../runtime/service.js"
import { DurabilityFailure } from "../errors.js"
import { make as makeJournal, type Head, type Options as JournalOptions } from "./journal.js"
import { make as makeCodec, decodeReceipt, encodeCommandValue } from "./runtime-state.js"
import { detach } from "./runtime-state/cache.js"
import type { State as CanonicalState } from "./protocol.js"
import { type Definition, ownershipCommands } from "./runtime-command.js"
import { make as makeCapacity } from "./runtime-capacity.js"
import { emptyState, type RuntimeState } from "../../runtime/state/projection.js"
import { PreparedObservation, occurredAtMillis, type Observations } from "../../runtime/state/observation.js"
import { shutdownStore } from "../../runtime/state/store/events.js"
import { activationOf } from "../../runtime/state/store/admission/activation.js"
import { RuntimeUnavailable } from "../../runtime/errors.js"

const ReceiptEnvelope = Schema.Struct({
  value: Schema.Json,
  observations: Schema.Struct({
    commandId: Schema.String,
    occurredAtMillis: Schema.Finite,
    occurredAt: Schema.String,
  }),
})

/** Canonical namespace and host configuration; construction only reconstructs state. */
export interface Options extends LayerOptions, JournalOptions {
  readonly admissionReserveBytes?: number
  readonly workerId?: string
  readonly schedulerMode?: "poll" | "external"
  readonly reconcileInterval?: Duration.Input
  readonly ownershipLeaseMillis?: number
}

export type ActivationFailure = DurabilityFailure | RuntimeUnavailable | StartExecutionError

/** The returned fiber reports ownership failure and is interrupted with the caller's scope. */
export class Activation extends Context.Service<
  Activation,
  {
    readonly activate: Effect.Effect<Fiber.Fiber<never, ActivationFailure>, ActivationFailure, Scope.Scope>
  }
>()("generalist/durability/internal/runtime/Activation") {}

/** Internal ownership boundary shared by store-only and executing hosts. */
export class StoreActivation extends Context.Service<
  StoreActivation,
  {
    readonly acquire: Effect.Effect<
      {
        readonly workerId: string
        readonly monitor: Effect.Effect<never, ActivationFailure>
        readonly incarnation: string
        readonly retire: Effect.Effect<void>
      },
      ActivationFailure,
      Scope.Scope
    >
    readonly nextDueAt: Effect.Effect<number | undefined, ActivationFailure>
  }
>()("generalist/durability/internal/runtime/StoreActivation") {}

export const layerActivation = (
  acquire: Effect.Effect<{ readonly monitor: Effect.Effect<never, ActivationFailure> }, ActivationFailure, Scope.Scope>,
) =>
  Layer.succeed(
    Activation,
    Activation.of({
      activate: Effect.gen(function* () {
        const ready = yield* Deferred.make<void, ActivationFailure>()
        const fiber = yield* Effect.forkScoped(
          Effect.scoped(
            Effect.gen(function* () {
              const { monitor } = yield* acquire
              yield* Deferred.succeed(ready, undefined)
              return yield* monitor
            }),
          ).pipe(
            Effect.onExit((exit) =>
              Exit.isFailure(exit) ? Deferred.failCause(ready, exit.cause).pipe(Effect.asVoid) : Effect.void,
            ),
          ),
        )
        yield* Deferred.await(ready).pipe(Effect.onInterrupt(() => Fiber.interrupt(fiber)))
        return fiber
      }),
    }),
  )

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
        const { writer: _writer, ...releasedSession } = session
        sessions.set(run.message.sessionId, { ...releasedSession, writerEpoch: session.writerEpoch + 1n })
      }
    }
  }
  return { workers, runs, sessions }
}

/** Reconstruction reads only; explicit activation owns heartbeats and takeover. */
export const make = (options: Options) =>
  Effect.gen(function* () {
    const journal = yield* makeJournal(options)
    const reservedBytes = yield* makeCapacity(options)
    const codec = makeCodec()
    const copyReceipt = detach()
    const clock = yield* Clock.Clock
    const crypto = yield* Crypto.Crypto
    const leaseMillis = options.ownershipLeaseMillis ?? 30_000
    const interval = yield* Effect.try({
      try: () => Duration.toMillis(options.reconcileInterval ?? "250 millis"),
      catch: (cause) =>
        DurabilityFailure.make({ reason: "configuration", message: `Invalid reconcileInterval: ${String(cause)}` }),
    })
    if (!Number.isSafeInteger(leaseMillis) || leaseMillis < 1000) {
      return yield* DurabilityFailure.make({
        reason: "configuration",
        message: "ownershipLeaseMillis must be an integer of at least 1000",
      })
    }
    if (!Number.isFinite(interval) || interval <= 0 || interval >= leaseMillis / 2) {
      return yield* DurabilityFailure.make({
        reason: "configuration",
        message: "reconcileInterval must be positive and less than half the ownership lease",
      })
    }
    if (
      options.scheduler?.concurrency !== undefined &&
      (!Number.isSafeInteger(options.scheduler.concurrency) || options.scheduler.concurrency <= 0)
    ) {
      return yield* DurabilityFailure.make({
        reason: "configuration",
        message: "scheduler concurrency must be a positive safe integer",
      })
    }
    const poll = yield* Effect.try({
      try: () => Duration.toMillis(options.scheduler?.pollInterval ?? "250 millis"),
      catch: (cause) =>
        DurabilityFailure.make({
          reason: "configuration",
          message: `Invalid scheduler pollInterval: ${String(cause)}`,
        }),
    })
    if (!Number.isFinite(poll) || poll <= 0) {
      return yield* DurabilityFailure.make({
        reason: "configuration",
        message: "scheduler pollInterval must be positive and finite",
      })
    }
    let owner: { readonly workerId: string; readonly incarnation: string } | undefined
    const stateRef = yield* SynchronizedRef.make(
      emptyState({
        addressBindings: new Map(options.addresses.map((entry) => [entry.address, entry.executable] as const)),
        subscriberQueueCapacity: options.subscriberQueueCapacity ?? 64,
      }),
    )
    let commandCounter = 0
    let sequence = "-1"
    let persistedState: CanonicalState | undefined
    let active = false

    const install = (previous: RuntimeState, projected: Effect.Success<ReturnType<typeof codec.refresh>>) =>
      Effect.gen(function* () {
        const next = projected.state
        const delivered = yield* publishChanges({ previous, next, changes: projected.changes })
        yield* Ref.set(stateRef.backing, delivered).pipe(
          Effect.andThen(Effect.sync(projected.accept)),
          Effect.uninterruptible,
        )
        if (active && options.activationProjection !== undefined) {
          const changes = projected.changes.runs
            .map(({ id }) => [id, next.runs.get(id)!] as const)
            .filter(([id, run]) => {
              const old = previous.runs.get(id)
              return old === undefined || JSON.stringify(activationOf(old)) !== JSON.stringify(activationOf(run))
            })
            .map(([, run]) => activationOf(run))
          if (changes.length > 0) yield* options.activationProjection.applyInTransaction(changes).pipe(Effect.ignore)
        }
        return delivered
      })
    const refresh = (committed?: Omit<Head, "stateDigest">) =>
      Effect.gen(function* () {
        const local = yield* Ref.get(stateRef.backing)
        if (local.closed) return yield* RuntimeUnavailable.make({ message: "runtime store released" })
        const head = committed ?? (yield* journal.head)
        if (head.sequence === sequence) return local
        if (head.state === persistedState) {
          sequence = head.sequence
          return local
        }
        const next = yield* codec.refresh(head.state, local)
        const installed = yield* install(local, next)
        sequence = head.sequence
        persistedState = head.state
        return installed
      })
    const readState = stateRef.semaphore.withPermit(
      refresh().pipe(
        Effect.flatMap((local) => codec.read(persistedState ?? {}, local)),
        Effect.tap((state) => Ref.set(stateRef.backing, state)),
      ),
    )
    const hasAdmissionKey = (key: string) =>
      stateRef.semaphore.withPermit(
        refresh().pipe(Effect.flatMap((local) => codec.hasAdmissionKey(persistedState ?? {}, local, key))),
      )

    const modifyState: ModifyState = (definition, input, transition) =>
      Effect.gen(function* () {
        const encodedInput = yield* encodeCommandValue(input, definition.input)
        // Decode the normalized wire value, so opaque input objects cannot mutate a prepared command by alias.
        const prepared = yield* decodeReceipt(encodedInput, definition.input)
        const commandId = `${definition.tag}:${definition.identity(prepared)}`
        return yield* Effect.gen(function* () {
          let observations: Observations | undefined
          const result = yield* journal.commitWithHead(
            {
              id: commandId,
              input: {
                environment: options.environment,
                tenant: options.tenant,
                partition: options.partition,
                command: definition.tag,
                input: encodedInput,
              },
            },
            (persisted) =>
              Effect.gen(function* () {
                // Receipt reconciliation happens before this callback. Fresh observations never affect input identity.
                if (observations === undefined) {
                  const now = yield* clock.currentTimeMillis
                  observations = Object.freeze({
                    commandId,
                    occurredAtMillis: now,
                    occurredAt: DateTime.formatIso(DateTime.makeUnsafe(now)),
                  })
                }
                const local = yield* Ref.get(stateRef.backing)
                if (local.closed) return yield* RuntimeUnavailable.make({ message: "runtime store released" })
                const committed = yield* codec
                  .prepare(persisted, local, definition.receipt, (state) => transition(state, prepared))
                  .pipe(Effect.provideService(PreparedObservation, observations))
                const receipt = {
                  value: committed.receipt,
                  observations: { ...observations },
                }
                return {
                  patches: committed.patches,
                  receipt,
                  reserveBytes: reservedBytes(definition.tag, committed.next),
                }
              }),
          )
          yield* refresh(result.head)
          const envelope = yield* Schema.decodeUnknownEffect(ReceiptEnvelope)(result.receipt, {
            onExcessProperty: "error",
          }).pipe(
            Effect.mapError((cause) =>
              DurabilityFailure.make({
                reason: "corruption",
                message: `Invalid command receipt: ${String(cause)}`,
                commandId,
              }),
            ),
          )
          const receipt = yield* decodeReceipt(envelope.value, definition.receipt)
          return copyReceipt(receipt)
        }).pipe(
          (effect) => stateRef.semaphore.withPermit(effect),
          Effect.mapError((error) => {
            if (!Schema.is(DurabilityFailure)(error)) return error
            const fields = { reason: error.reason, message: error.message, hint: error.hint, commandId }
            if (error.key !== undefined) Object.assign(fields, { key: error.key })
            if (error.cause !== undefined) Object.assign(fields, { cause: error.cause })
            return DurabilityFailure.make(fields)
          }),
        )
      })

    const acquire = Effect.gen(function* () {
      if (owner !== undefined) return yield* RuntimeUnavailable.make({ message: "runtime host is already activated" })
      const incarnation = yield* crypto.randomUUIDv4.pipe(
        Effect.mapError((cause) =>
          DurabilityFailure.make({ reason: "crypto", message: `Cannot prepare host incarnation: ${String(cause)}` }),
        ),
      )
      const workerId = options.workerId ?? incarnation
      if (workerId.length === 0)
        return yield* DurabilityFailure.make({ reason: "configuration", message: "workerId must be nonempty" })
      const current = { workerId, incarnation }
      yield* Effect.uninterruptible(
        Effect.gen(function* () {
          // Reserve locally before the first interruptible write, so concurrent activation cannot enter.
          if (owner !== undefined)
            return yield* RuntimeUnavailable.make({ message: "runtime host is already activated" })
          owner = current
          yield* Effect.addFinalizer(() =>
            Effect.gen(function* () {
              active = false
              if (owner === current) owner = undefined
              yield* modifyState(
                ownershipCommands.release,
                [
                  {
                    commandId: `${incarnation}:release`,
                    incarnation,
                    owners: [workerId],
                    leaseMillis,
                  },
                ],
                (state, [input]) => {
                  const workers = new Map(state.workers)
                  for (const id of input.owners) {
                    if (workers.get(id)?.incarnation === input.incarnation) {
                      workers.set(id, { incarnation: input.incarnation, expiresAt: 0 })
                    }
                  }
                  return Effect.succeed([undefined, { ...state, workers }] as const)
                },
              ).pipe(Effect.interruptible, Effect.timeoutOption(interval), Effect.ignore)
            }),
          )
        }),
      )
      yield* modifyState(
        ownershipCommands.acquire,
        [
          {
            commandId: `${incarnation}:acquire`,
            incarnation,
            owners: [workerId],
            leaseMillis,
          },
        ],
        (state, [input]) =>
          Effect.gen(function* () {
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
          }),
      )
      const reconcile = () =>
        modifyState(
          ownershipCommands.reconcile,
          [
            {
              commandId: `${incarnation}:reconcile:${++commandCounter}`,
              incarnation,
              owners: [workerId],
              leaseMillis,
            },
          ],
          (state, [input]) =>
            Effect.gen(function* () {
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
            }),
        )
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
          if (id !== workerId && worker.expiresAt <= now) {
            expired = true
            break
          }
        }
        if (lease.expiresAt - now <= leaseMillis / 2 || expired) {
          yield* reconcile()
        }
      })
      const monitor = Effect.sleep(interval).pipe(
        Effect.andThen(heartbeat.pipe(Effect.timeoutOption(leaseMillis / 2 - interval))),
        Effect.flatMap((result) =>
          result._tag === "None"
            ? RuntimeUnavailable.make({ message: "runtime ownership heartbeat timed out" })
            : Effect.void,
        ),
        Effect.forever,
      )
      return {
        workerId,
        incarnation,
        monitor,
        retire: Effect.sync(() => {
          active = false
        }),
      }
    })
    const nextDueAt = readState.pipe(
      Effect.map((state) => {
        let next: number | undefined
        const include = (value: number) => {
          next = next === undefined ? value : Math.min(next, value)
        }
        for (const run of state.runs.values()) {
          const { ownerId, ...unowned } = run
          if (activationOf(unowned).intent === "inactive") continue
          include(ownerId === undefined ? 0 : (state.workers.get(ownerId)?.expiresAt ?? 0))
        }
        for (const wait of state.waits.values()) {
          if (wait.status === "open" && wait.reason._tag === "AwaitEvent" && wait.reason.deadline !== undefined) {
            include(DateTime.toEpochMillis(DateTime.makeUnsafe(wait.reason.deadline)))
          }
        }
        for (const schedule of state.schedules.values()) {
          const claim = state.scheduleClaims.get(schedule.scheduleId)
          include(
            Math.max(
              DateTime.toEpochMillis(DateTime.makeUnsafe(schedule.nextAt)),
              claim === undefined ? 0 : DateTime.toEpochMillis(DateTime.makeUnsafe(claim.leaseExpiresAt)),
            ),
          )
        }
        return next
      }),
    )
    yield* readState
    yield* Effect.addFinalizer(() => shutdownStore(stateRef))
    return {
      stateRef,
      readState,
      hasAdmissionKey,
      modifyState,
      lookupReceipt: journal.lookupReceipt,
      activation: StoreActivation.of({ acquire, nextDueAt }),
      ownership: {
        require: (workerId: string) =>
          Effect.suspend(() =>
            active && owner?.workerId === workerId
              ? Effect.succeed({ incarnation: owner.incarnation, leaseMillis })
              : RuntimeUnavailable.make({ message: `Worker ${workerId} has no active host authority` }),
          ),
      },
    }
  })
