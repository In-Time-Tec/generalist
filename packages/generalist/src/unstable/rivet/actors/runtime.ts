/* oxlint-disable anti-slop-effect/no-service-constructor-imports -- This host composition root owns the SQL client, projection, and exclusive recovery. */
import { Clock, Context, Effect, Function, Layer, Semaphore } from "effect"
import { SqlClient, SqlError } from "effect/unstable/sql"
import type { ActorContext } from "rivetkit"
import type { db } from "rivetkit/db"
import { RuntimeUnavailable } from "../../../runtime/errors.js"
import type { SqliteRuntimeOptions, SqliteRuntimeResolverInput } from "../../../runtime/sql/run/exclusive-runtime.js"
import { Runtime } from "../../../runtime/service.js"
import {
  layerSqliteRuntime,
  makeExclusiveExecutionRecovery,
  SqliteRunActivation,
  type RunActivationProjection,
  type SqliteRuntimeServices,
  type SqliteStoreError,
  type SqliteStoreOptions,
} from "../../../runtime/sql-driver.js"
import { layerSqlClient } from "./raw-sql.js"

/** @experimental Only the Rivet capabilities needed by the Runtime host; no vars or connection state. */
export type RuntimeActorContext = Pick<
  ActorContext<undefined, undefined, undefined, undefined, undefined, ReturnType<typeof db>>,
  "actorId" | "db" | "schedule" | "cron"
>

/** @experimental Exact storage services owned by this actor activation. */
export type ActorRuntimeResolverInput = SqliteRuntimeResolverInput

/** @experimental Product initialization and projection share the host's incarnation and SQL client. */
export interface ActorRuntimeContext {
  readonly sql: SqlClient.SqlClient
  readonly ownerId: string
}

/** @experimental Runtime construction inside an application-owned actor wake scope. */
export interface ActorRuntimeOptions extends Omit<SqliteStoreOptions, "activationProjection" | "source"> {
  readonly drainFuel?: number
  readonly recoveryPageSize?: number
  /** Durable fallback doorbell interval. Rivet requires at least 5 seconds. */
  readonly recoveryIntervalMillis?: number
  /** Scheduled action that invokes ActorRuntime.drain. It must be present on the actor. */
  readonly drainAction: string
  /** Initialize product tables before Runtime construction and recovery. Must be safe on every wake. */
  readonly initialize?: (context: ActorRuntimeContext) => Effect.Effect<void, RuntimeUnavailable | SqlError.SqlError>
  /** Product-only projection. The host always composes its own durable activation projection after this. */
  readonly activationProjection?: (context: ActorRuntimeContext) => RunActivationProjection
  readonly makeExecutableResolver: SqliteRuntimeOptions["makeExecutableResolver"]
  readonly decorateRunExecutor?: SqliteRuntimeOptions["decorateRunExecutor"]
  /** Reconcile product work before execution and before recovery is allowed to become idle. */
  readonly reconcile?: (
    context: ActorRuntimeContext,
  ) => Effect.Effect<number | undefined, RuntimeUnavailable | SqlError.SqlError, SqliteRuntimeServices>
}

/** @experimental Host operations sharing the actor's Runtime and SQLite transaction domain. */
export class ActorRuntime extends Context.Service<
  ActorRuntime,
  {
    readonly ownerId: string
    /** A best-effort doorbell, never durable acceptance. Call after committing product commands. */
    readonly notify: Effect.Effect<void>
    /** Serialize admission/reconciliation without holding the gate during provider execution. */
    readonly guarded: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
    readonly drain: Effect.Effect<
      SqliteRunActivation.DrainResult,
      RuntimeUnavailable | SqlError.SqlError,
      SqliteRuntimeServices | SqlClient.SqlClient
    >
  }
>()("generalist/unstable/rivet/actors/runtime/ActorRuntime") {}

class ActivationProjection extends Context.Service<ActivationProjection, RunActivationProjection>()(
  "generalist/unstable/rivet/actors/runtime/ActivationProjection",
) {}

/** @experimental Services installed by layerActorRuntime in one actor-owned ManagedRuntime. */
export type ActorRuntimeServices = SqliteRuntimeServices | SqlClient.SqlClient | ActorRuntime

const allocateOwner = Effect.fn("RivetActorRuntime.allocateOwner")(function* (actorId: string) {
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql.withTransaction(
    Effect.gen(function* () {
      yield* sql`CREATE TABLE IF NOT EXISTS generalist_rivet_host (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        incarnation INTEGER NOT NULL
      )`
      return yield* sql<{ incarnation: number }>`INSERT INTO generalist_rivet_host (singleton, incarnation)
        VALUES (1, 1)
        ON CONFLICT(singleton) DO UPDATE SET incarnation = incarnation + 1
        RETURNING incarnation`
    }),
  )
  const incarnation = rows[0]?.incarnation
  if (incarnation === undefined) {
    return yield* RuntimeUnavailable.make({ message: "Rivet actor incarnation allocation returned no row" })
  }
  return `${actorId}:${incarnation}`
})

const notify = Effect.fn("RivetActorRuntime.notify")(
  (context: RuntimeActorContext, action: string, delayMillis: number = 0) =>
    Effect.tryPromise({
      try: () => context.schedule.after(Math.max(0, delayMillis), action),
      catch: () => RuntimeUnavailable.make({ message: "Rivet Runtime doorbell failed" }),
    }).pipe(
      Effect.asVoid,
      Effect.catchTag("generalist/runtime/RuntimeUnavailable", () =>
        Effect.logWarning("Rivet Runtime doorbell failed; periodic recovery remains armed"),
      ),
    ),
)

const makeHost = Effect.fn("RivetActorRuntime.makeHost")(function* (
  context: RuntimeActorContext,
  options: ActorRuntimeOptions,
) {
  const interval = Math.max(5_000, Math.floor(options.recoveryIntervalMillis ?? 5_000))
  yield* Effect.tryPromise({
    try: () =>
      context.cron.every({
        name: "generalist-runtime-recovery",
        interval,
        action: options.drainAction,
        maxHistory: 0,
      }),
    catch: () => RuntimeUnavailable.make({ message: "Rivet Runtime periodic recovery could not be armed" }),
  })
  const ownerId = yield* allocateOwner(context.actorId)
  const sql = yield* SqlClient.SqlClient
  const activationContext = { sql, ownerId }
  yield* options.initialize?.(activationContext) ?? Effect.void
  const admission = yield* Semaphore.make(1)
  const execution = yield* Semaphore.make(1)
  const guarded = admission.withPermits(1)
  const fuel = Math.max(1, Math.floor(options.drainFuel ?? 64))
  const reconcile = guarded(
    Effect.gen(function* () {
      if (options.reconcile !== undefined) return yield* options.reconcile(activationContext)
      return undefined
    }),
  )
  const drain = execution.withPermits(1)(
    Effect.gen(function* () {
      yield* reconcile
      const result = yield* SqliteRunActivation.drain({ ownerId, fuel, rearm: Effect.void })
      const productDue = yield* reconcile
      const runDue = yield* SqliteRunActivation.nextDueAt
      let nextDueAt = runDue
      if (productDue !== undefined && (nextDueAt === undefined || productDue < nextDueAt)) nextDueAt = productDue
      if (nextDueAt !== undefined) {
        const now = yield* Clock.currentTimeMillis
        yield* notify(context, options.drainAction, result.hasMore ? 0 : nextDueAt - now)
        return { ...result, nextDueAt }
      }
      return result
    }),
  )
  return ActorRuntime.of({ ownerId, notify: notify(context, options.drainAction), drain, guarded })
})

const recover = Effect.fn("RivetActorRuntime.recover")(function* (pageSize: number) {
  const sql = yield* SqlClient.SqlClient
  const host = yield* ActorRuntime
  const projection = yield* ActivationProjection
  yield* Runtime
  yield* sql.withTransaction(SqliteRunActivation.initialize(Effect.void))
  const recovery = makeExclusiveExecutionRecovery(sql, projection)
  let afterRunId: string | undefined
  do {
    const input: Parameters<typeof recovery.recoverClaims>[0] = {
      newOwnerId: host.ownerId,
      limit: pageSize,
    }
    if (afterRunId !== undefined) Object.assign(input, { afterRunId })
    const recovered = yield* recovery.recoverClaims(input)
    afterRunId = recovered.continuation
  } while (afterRunId !== undefined)
  yield* host.drain
})

const layerActorRuntimeImpl = (
  context: RuntimeActorContext,
  options: ActorRuntimeOptions,
): Layer.Layer<ActorRuntimeServices, SqliteStoreError | SqlError.SqlError | RuntimeUnavailable> => {
  const {
    drainAction: _drainAction,
    drainFuel: _drainFuel,
    recoveryIntervalMillis: _recoveryInterval,
    recoveryPageSize: pageSize,
    initialize: _initialize,
    activationProjection,
    makeExecutableResolver,
    decorateRunExecutor,
    reconcile: _reconcile,
    ...storeOptions
  } = options
  const sql = layerSqlClient(context.db)
  const host = Layer.effect(ActorRuntime, makeHost(context, options))
  const projection = Layer.effect(
    ActivationProjection,
    Effect.gen(function* () {
      const client = yield* SqlClient.SqlClient
      const { ownerId } = yield* ActorRuntime
      const native = SqliteRunActivation.makeProjection(client, Effect.void)
      const application = activationProjection?.({ sql: client, ownerId })
      return {
        applyInTransaction: (changes: Parameters<RunActivationProjection["applyInTransaction"]>[0]) =>
          application === undefined
            ? native.applyInTransaction(changes)
            : application.applyInTransaction(changes).pipe(Effect.andThen(native.applyInTransaction(changes))),
      }
    }),
  ).pipe(Layer.provide(host))
  const runtime = Layer.unwrap(
    Effect.gen(function* () {
      const { ownerId } = yield* ActorRuntime
      const activation = yield* ActivationProjection
      const runtimeOptions: SqliteRuntimeOptions = {
        options: { ...storeOptions, source: "rivet-actor", activationProjection: activation },
        workerId: ownerId,
        schedulerMode: "external",
        makeExecutableResolver,
      }
      if (decorateRunExecutor !== undefined) Object.assign(runtimeOptions, { decorateRunExecutor })
      return layerSqliteRuntime(runtimeOptions)
    }),
  ).pipe(Layer.provideMerge(host), Layer.provideMerge(projection), Layer.provideMerge(sql))
  const initialize = Layer.effectDiscard(recover(Math.max(1, Math.min(1000, Math.floor(pageSize ?? 100))))).pipe(
    Layer.provide(runtime),
  )
  return Layer.merge(runtime, initialize)
}

/**
 * @experimental Build once in onWake and dispose the owning ManagedRuntime in onSleep/onDestroy.
 *
 * Product actions use this same runtime. Never wrap Runtime.send in an outer SQL transaction:
 * activationProjection runs inside Runtime's own transaction and rolls back together with it.
 * No Rivet State copy, second SQLite client, independent scheduler, or independent Runtime is created.
 */
export const layerActorRuntime: {
  (
    context: RuntimeActorContext,
    options: ActorRuntimeOptions,
  ): Layer.Layer<ActorRuntimeServices, SqliteStoreError | SqlError.SqlError | RuntimeUnavailable>
  (
    options: ActorRuntimeOptions,
  ): (
    context: RuntimeActorContext,
  ) => Layer.Layer<ActorRuntimeServices, SqliteStoreError | SqlError.SqlError | RuntimeUnavailable>
} = Function.dual(2, layerActorRuntimeImpl)
