import { describe, expect, it } from "@effect/vitest"
import { Context, Effect, Layer, Option, Schema, Stream } from "effect"
import { IdempotencyConflict, RunIdConflict } from "../../runtime/errors.js"
import type { ExecutionResult } from "../../runtime/execution/state.js"
import { RunStore } from "../../runtime/run/store.js"
import { Runtime } from "../../runtime/service.js"
import { StaleClaim } from "../../runtime/sql/errors.js"
import { RunClaims } from "../../runtime/sql/run/claims.js"
import { checkpoint, replay } from "../../runtime/tree.js"
import { registerAcknowledgement } from "./acknowledgement.js"
import type {
  MultiWorkerClaimCapability,
  NotificationRecoveryCapability,
  Options,
  RunTreeCapability,
  RuntimeCapability,
  Services,
  SqlTransactionCapability,
  WorkerClaim,
} from "./contract.js"
import { pluralWaitsConformance, toolSuspension } from "./plural-waits.js"

export type * from "./contract.js"
export * from "./model-response-fault.js"
export * from "./sql-transaction-fault.js"

const servicesFrom = (context: Context.Context<Runtime | RunStore>): Services => {
  const optionalClaims = Context.getOption(context, RunClaims)
  const services: Services = {
    runtime: Context.get(context, Runtime),
    store: Context.get(context, RunStore),
  }
  return Option.isSome(optionalClaims) ? { ...services, claims: optionalClaims.value } : services
}

const provideLayer = <A, E, LayerError>(
  layer: Layer.Layer<Runtime | RunStore, LayerError, never>,
  use: (services: Services) => Effect.Effect<A, E>,
): Effect.Effect<A, E | LayerError> =>
  Effect.scoped(Effect.flatMap(Layer.build(layer), (context) => use(servicesFrom(context))))

const prepare = <A, E, LayerError, ClaimsLayerError>(
  options: Options<LayerError, ClaimsLayerError>,
  effect: Effect.Effect<A, E>,
): Effect.Effect<A, E> => (options.setup === undefined ? effect : Effect.andThen(options.setup, effect))

const provide = <A, E, LayerError, ClaimsLayerError>(
  options: Options<LayerError, ClaimsLayerError>,
  use: (services: Services) => Effect.Effect<A, E>,
): Effect.Effect<A, E | LayerError> => prepare(options, provideLayer(options.layer, use))

const provideClaims = <A, E, LayerError>(
  layer: Layer.Layer<Runtime | RunStore | RunClaims, LayerError, never>,
  use: (services: Services & { readonly claims: RunClaims["Service"] }) => Effect.Effect<A, E>,
): Effect.Effect<A, E | LayerError> =>
  Effect.scoped(
    Effect.flatMap(Layer.build(layer), (context) =>
      use({
        runtime: Context.get(context, Runtime),
        store: Context.get(context, RunStore),
        claims: Context.get(context, RunClaims),
      }),
    ),
  )

const slug = (value: string): string => value.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()

const identity = (name: string, test: string) => {
  const prefix = `conformance:${slug(name)}:${test}`
  return {
    sessionId: `session:${prefix}`,
    idempotencyKey: prefix,
    runId: `run:${prefix}`,
  }
}

const completedResult = (sessionId: string, text: string): ExecutionResult => ({
  text,
  turns: 1,
  session: { sessionId, leafId: null },
})

const registerAdmission = <LayerError, ClaimsLayerError>(options: Options<LayerError, ClaimsLayerError>) => {
  it.effect("replays exact admission and rejects divergent idempotency", () =>
    provide(options, ({ runtime }) =>
      Effect.gen(function* () {
        const id = identity(options.name, "admission-idempotency")
        const first = yield* runtime.send({
          to: options.address,
          sessionId: id.sessionId,
          idempotencyKey: id.idempotencyKey,
          prompt: "same payload",
        })
        const duplicate = yield* runtime.send({
          to: options.address,
          sessionId: id.sessionId,
          idempotencyKey: id.idempotencyKey,
          prompt: "same payload",
        })
        expect(duplicate).toEqual({ ...first, duplicate: true })
        const conflict = yield* runtime
          .send({
            to: options.address,
            sessionId: id.sessionId,
            idempotencyKey: id.idempotencyKey,
            prompt: "changed payload",
          })
          .pipe(Effect.flip)
        expect(conflict).toBeInstanceOf(IdempotencyConflict)
        if (Schema.is(IdempotencyConflict)(conflict)) expect(conflict.existingRunId).toBe(first.runId)
      }),
    ),
  )

  it.effect("preserves caller Run identity and rejects conflicting admission", () =>
    provide(options, ({ runtime }) =>
      Effect.gen(function* () {
        const id = identity(options.name, "admission-run-id")
        const first = yield* runtime.send({
          runId: id.runId,
          to: options.address,
          sessionId: id.sessionId,
          idempotencyKey: id.idempotencyKey,
          prompt: "caller identity",
        })
        expect(first.runId).toBe(id.runId)
        const conflict = yield* runtime
          .send({
            runId: `${id.runId}:other`,
            to: options.address,
            sessionId: id.sessionId,
            idempotencyKey: id.idempotencyKey,
            prompt: "caller identity",
          })
          .pipe(Effect.flip)
        expect(conflict).toBeInstanceOf(RunIdConflict)
      }),
    ),
  )
}

const registerRuntime = <LayerError, ClaimsLayerError>(
  options: Options<LayerError, ClaimsLayerError>,
  capability: RuntimeCapability,
) => {
  registerAcknowledgement({ options, capability })

  it.effect("persists control transitions and strictly ordered durable events", () =>
    provide(options, (services) =>
      Effect.gen(function* () {
        const id = identity(options.name, "runtime-control")
        const receipt = yield* services.runtime.send({
          to: options.address,
          sessionId: id.sessionId,
          idempotencyKey: id.idempotencyKey,
          prompt: "wait for signal",
        })
        const claim = yield* capability.claim(services, { runId: receipt.runId, workerId: "control-a" })
        const waitId = `${id.idempotencyKey}:signal`
        yield* services.store.suspend({
          ...claim,
          waits: [
            {
              waitId,
              reason: { _tag: "Signal", name: waitId },
              status: "open",
              openedAt: "2026-08-29T00:00:00.000Z",
            },
          ],
          suspension: toolSuspension([waitId]),
        })
        yield* services.runtime.signal({ runId: receipt.runId, name: waitId })
        const resumed = yield* capability.claim(services, { runId: receipt.runId, workerId: "control-b" })
        yield* services.store.complete({ ...resumed, result: completedResult(id.sessionId, "completed") })

        const inspection = yield* services.runtime.inspect(receipt.runId)
        const events = yield* services.runtime.history({ runId: receipt.runId, limit: 100 })
        expect(inspection.status).toBe("succeeded")
        const control = events.filter((event) => ["RunWaiting", "RunResumed", "RunCompleted"].includes(event._tag))
        expect(control.map((event) => event._tag)).toEqual(["RunWaiting", "RunResumed", "RunCompleted"])
        expect(events.every((event, index) => index === 0 || event.sequence > events[index - 1]!.sequence)).toBe(true)
        expect(events.map((event) => event.eventId)).toEqual(
          events.map((event) => `${receipt.runId}:${event.sequence}`),
        )
      }),
    ),
  )

  it.effect("keeps plural waits independent, idempotent, and insert-once", () =>
    provide(options, (services) =>
      pluralWaitsConformance({ name: options.name, address: options.address, services, capability }),
    ),
  )
}

const registerRunTree = <LayerError, ClaimsLayerError>(
  options: Options<LayerError, ClaimsLayerError>,
  capability: RunTreeCapability,
) => {
  it.effect("paginates strictly after an opaque root-bound replay cursor", () =>
    provide(options, (services) =>
      Effect.gen(function* () {
        const id = identity(options.name, "run-tree")
        const root = yield* services.runtime.send({
          to: options.address,
          sessionId: id.sessionId,
          idempotencyKey: id.idempotencyKey,
          prompt: "tree replay",
        })
        const before = yield* checkpoint(root.runId).pipe(Effect.provideService(Runtime, services.runtime))
        const claim = yield* capability.claim(services, { runId: root.runId, workerId: "tree" })
        yield* services.store.emitAgentEvent({ ...claim, event: { _tag: "TurnStarted", turn: 1 } })
        yield* services.store.emitAgentEvent({ ...claim, event: { _tag: "TurnStarted", turn: 2 } })
        const first = yield* replay({ rootRunId: root.runId, cursor: before.cursor, limit: 1 }).pipe(
          Effect.provideService(Runtime, services.runtime),
        )
        const second = yield* replay({ rootRunId: root.runId, cursor: first.cursor, limit: 1 }).pipe(
          Effect.provideService(Runtime, services.runtime),
        )
        const rest = yield* replay({ rootRunId: root.runId, cursor: second.cursor, limit: 100 }).pipe(
          Effect.provideService(Runtime, services.runtime),
        )
        const tail = yield* replay({ rootRunId: root.runId, cursor: rest.cursor, limit: 1 }).pipe(
          Effect.provideService(Runtime, services.runtime),
        )
        const replayed = [...first.events, ...second.events, ...rest.events]
        expect(first.events).toHaveLength(1)
        expect(first.hasMore).toBe(true)
        expect(new Set(replayed.map(({ event }) => event.eventId)).size).toBe(replayed.length)
        expect(replayed.filter(({ event }) => event._tag === "TurnStarted")).toHaveLength(2)
        expect(tail).toMatchObject({ events: [], cursor: rest.cursor, hasMore: false })

        const other = yield* services.runtime.send({
          to: options.address,
          sessionId: `${id.sessionId}:other`,
          idempotencyKey: `${id.idempotencyKey}:other`,
          prompt: "other tree",
        })
        const wrongRoot = yield* replay({ rootRunId: other.runId, cursor: first.cursor, limit: 1 }).pipe(
          Effect.provideService(Runtime, services.runtime),
          Effect.flip,
        )
        expect(wrongRoot._tag).toBe("generalist/runtime/TreeCursorRootMismatch")
      }),
    ),
  )
}

const registerSqlTransactions = <LayerError, ClaimsLayerError>(
  options: Options<LayerError, ClaimsLayerError>,
  capability: SqlTransactionCapability,
) => {
  it.effect("rolls back failed state and event commits, then commits once", () =>
    provide(options, (services) =>
      Effect.gen(function* () {
        const id = identity(options.name, "sql-transaction")
        const receipt = yield* services.runtime.send({
          to: options.address,
          sessionId: id.sessionId,
          idempotencyKey: id.idempotencyKey,
          prompt: "transaction",
        })
        const claim = yield* capability.claim(services, { runId: receipt.runId, workerId: "transaction" })
        const before = yield* services.runtime.history({ runId: receipt.runId, limit: 100 })
        const failed = yield* Effect.exit(
          capability.forceRollback(
            services.store.complete({ ...claim, result: completedResult(id.sessionId, "committed") }),
          ),
        )
        expect(failed._tag).toBe("Failure")
        expect((yield* services.runtime.inspect(receipt.runId)).status).toBe("running")
        expect(yield* services.runtime.history({ runId: receipt.runId, limit: 100 })).toEqual(before)

        yield* services.store.complete({ ...claim, result: completedResult(id.sessionId, "committed") })
        const committed = yield* services.runtime.history({ runId: receipt.runId, limit: 100 })
        expect((yield* services.runtime.inspect(receipt.runId)).status).toBe("succeeded")
        expect(committed.filter((event) => event._tag === "RunCompleted")).toHaveLength(1)
      }),
    ),
  )
}

const registerMultiWorkerClaims = <LayerError, ClaimsLayerError>(
  options: Options<LayerError, ClaimsLayerError>,
  capability: MultiWorkerClaimCapability<ClaimsLayerError>,
) => {
  it.effect("atomically distributes concurrent claims across workers", () =>
    prepare(
      options,
      provideClaims(capability.layer, ({ runtime, claims }) =>
        Effect.gen(function* () {
          const receipts = yield* Effect.forEach(
            Array.from({ length: 6 }, (_, index) => index),
            (index) => {
              const id = identity(options.name, `claims-concurrent-${index}`)
              return runtime.send({
                to: options.address,
                sessionId: id.sessionId,
                idempotencyKey: id.idempotencyKey,
                prompt: `claim ${index}`,
              })
            },
          )
          const batches = yield* Effect.all(
            ["worker-a", "worker-b", "worker-c"].map((workerId) =>
              claims.claimReadyRuns({ workerId, limit: 2, lease: "10 seconds" }),
            ),
            { concurrency: "unbounded" },
          )
          const claimed = batches.flat()
          expect(batches.map((batch) => batch.length)).toEqual([2, 2, 2])
          expect(new Set(claimed.map((item) => item.run.runId)).size).toBe(receipts.length)
          expect(claimed.map((item) => item.run.runId).toSorted()).toEqual(
            receipts.map((receipt) => receipt.runId).toSorted(),
          )
        }),
      ),
    ),
  )

  it.effect("raises fences and rejects stale renew, release, and commit", () =>
    prepare(
      options,
      provideClaims(capability.layer, ({ runtime, claims }) =>
        Effect.gen(function* () {
          const id = identity(options.name, "claims-stale")
          const receipt = yield* runtime.send({
            to: options.address,
            sessionId: id.sessionId,
            idempotencyKey: id.idempotencyKey,
            prompt: "stale claim",
          })
          const [first] = yield* claims.claimReadyRuns({ workerId: "stale-a", limit: 1, lease: "10 seconds" })
          if (first === undefined) return yield* Effect.die("initial conformance claim is missing")
          const stale: WorkerClaim = {
            runId: first.run.runId,
            workerId: first.workerId,
            attemptFence: first.attemptFence,
            session: first.session,
          }
          yield* capability.expire(stale)
          const [second] = yield* claims.claimReadyRuns({ workerId: "stale-b", limit: 1, lease: "10 seconds" })
          if (second === undefined) return yield* Effect.die("replacement conformance claim is missing")
          expect(second.run.runId).toBe(receipt.runId)
          expect(second.attemptFence).toBeGreaterThan(first.attemptFence)
          expect(
            yield* claims.refreshLease({
              ...stale,
              cancellationRequested: false,
              lease: "10 seconds",
            }),
          ).toBe(false)
          yield* claims.releaseClaim(stale)
          expect(yield* claims.claimReadyRuns({ workerId: "stale-c", limit: 1, lease: "10 seconds" })).toEqual([])
          const staleCommit = yield* claims
            .commitWithClaim({
              ...stale,
              transition: "complete",
              result: completedResult(id.sessionId, "stale"),
            })
            .pipe(Effect.flip)
          expect(staleCommit).toBeInstanceOf(StaleClaim)
          yield* claims.commitWithClaim({
            runId: second.run.runId,
            workerId: second.workerId,
            attemptFence: second.attemptFence,
            session: second.session,
            transition: "complete",
            result: completedResult(id.sessionId, "fresh"),
          })
          expect((yield* runtime.inspect(receipt.runId)).status).toBe("succeeded")
        }),
      ),
    ),
  )
}

const registerNotificationRecovery = <LayerError, ClaimsLayerError>(
  options: Options<LayerError, ClaimsLayerError>,
  capability: NotificationRecoveryCapability,
) => {
  it.effect("recovers a committed event missed while no notification listener exists", () =>
    prepare(
      options,
      Effect.gen(function* () {
        const seeded = yield* provideLayer(options.layer, (services) =>
          Effect.gen(function* () {
            const id = identity(options.name, "notification-recovery")
            const receipt = yield* services.runtime.send({
              to: options.address,
              sessionId: id.sessionId,
              idempotencyKey: id.idempotencyKey,
              prompt: "notification recovery",
            })
            const events = yield* services.runtime.history({ runId: receipt.runId, limit: 100 })
            const cursor = events.at(-1)!.sequence
            const claim = yield* capability.claim(services, { runId: receipt.runId, workerId: "notification" })
            yield* services.store.emitAgentEvent({ ...claim, event: { _tag: "TurnStarted", turn: 41 } })
            return { runId: receipt.runId, cursor }
          }),
        )
        const recovered = yield* provideLayer(options.layer, ({ runtime }) =>
          runtime.events(seeded).pipe(
            Stream.filter((event) => event._tag === "TurnStarted"),
            Stream.take(1),
            Stream.runCollect,
          ),
        )
        expect(Array.from(recovered, (event) => (event._tag === "TurnStarted" ? event.turn : undefined))).toEqual([41])
      }),
    ),
  )
}

/** @experimental Registers only the conformance suites selected by the supplied driver capabilities. */
export const driverConformance = <LayerError, ClaimsLayerError>(
  options: Options<LayerError, ClaimsLayerError>,
): void => {
  const suite = options.skip === true ? describe.skip : describe
  suite(`${options.name} Generalist Runtime driver conformance`, () => {
    if (options.capabilities.admission === true) registerAdmission(options)
    if (options.capabilities.runtime !== undefined) registerRuntime(options, options.capabilities.runtime)
    if (options.capabilities.runTree !== undefined) registerRunTree(options, options.capabilities.runTree)
    if (options.capabilities.sqlTransactions !== undefined) {
      registerSqlTransactions(options, options.capabilities.sqlTransactions)
    }
    if (options.capabilities.multiWorkerClaims !== undefined) {
      registerMultiWorkerClaims(options, options.capabilities.multiWorkerClaims)
    }
    if (options.capabilities.notificationRecovery !== undefined) {
      registerNotificationRecovery(options, options.capabilities.notificationRecovery)
    }
  })
}
