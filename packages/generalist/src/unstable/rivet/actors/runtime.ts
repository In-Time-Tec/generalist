/* oxlint-disable anti-slop-effect/no-service-constructor-imports -- This host composition root owns the SQL client, projection, and exclusive recovery. */
import { Clock, Context, Effect, Function, Layer } from "effect"
import { SqlClient, SqlError } from "effect/unstable/sql"
import type { ActorContext } from "rivetkit"
import type { db } from "rivetkit/db"
import { RuntimeUnavailable } from "../../../runtime/errors.js"
import { ExecutableResolver } from "../../../runtime/executable/resolver.js"
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

/** @experimental Runtime construction inside an application-owned actor wake scope. */
export interface ActorRuntimeOptions extends Omit<SqliteStoreOptions, "activationProjection" | "source"> {
  readonly drainFuel?: number
  readonly recoveryPageSize?: number
  /** Durable fallback doorbell interval. Rivet requires at least 5 seconds. */
  readonly recoveryIntervalMillis?: number
  /** Scheduled action that invokes ActorRuntime.drain. It must be present on the actor. */
  readonly drainAction: string
  /** Initialize product tables before Runtime construction and recovery. Must be safe on every wake. */
  readonly initialize?: Effect.Effect<void, RuntimeUnavailable | SqlError.SqlError, SqlClient.SqlClient>
  /** Product-only projection. The host always composes its own durable activation projection after this. */
  readonly activationProjection?: (sql: SqlClient.SqlClient) => RunActivationProjection
}

/** @experimental Host operations sharing the actor's Runtime and SQLite transaction domain. */
export class ActorRuntime extends Context.Service<
  ActorRuntime,
  {
    readonly ownerId: string
    /** A best-effort doorbell, never durable acceptance. Call after committing product commands. */
    readonly notify: Effect.Effect<void>
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
  yield* options.initialize ?? Effect.void
  const fuel = Math.max(1, Math.floor(options.drainFuel ?? 64))
  const drain = Effect.gen(function* () {
    const result = yield* SqliteRunActivation.drain({ ownerId, fuel, rearm: Effect.void })
    if (result.nextDueAt !== undefined) {
      const now = yield* Clock.currentTimeMillis
      yield* notify(context, options.drainAction, result.hasMore ? 0 : result.nextDueAt - now)
    }
    return result
  })
  return ActorRuntime.of({ ownerId, notify: notify(context, options.drainAction), drain })
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
): Layer.Layer<ActorRuntimeServices, SqliteStoreError | SqlError.SqlError | RuntimeUnavailable, ExecutableResolver> => {
  const {
    drainAction: _drainAction,
    drainFuel: _drainFuel,
    recoveryIntervalMillis: _recoveryInterval,
    recoveryPageSize: pageSize,
    initialize: _initialize,
    activationProjection,
    ...storeOptions
  } = options
  const sql = layerSqlClient(context.db)
  const host = Layer.effect(ActorRuntime, makeHost(context, options))
  const projection = Layer.effect(
    ActivationProjection,
    Effect.map(SqlClient.SqlClient, (client) => {
      const native = SqliteRunActivation.makeProjection(client, Effect.void)
      const application = activationProjection?.(client)
      return {
        applyInTransaction: (changes: Parameters<RunActivationProjection["applyInTransaction"]>[0]) =>
          application === undefined
            ? native.applyInTransaction(changes)
            : application.applyInTransaction(changes).pipe(Effect.andThen(native.applyInTransaction(changes))),
      }
    }),
  )
  const runtime = Layer.unwrap(
    Effect.gen(function* () {
      const { ownerId } = yield* ActorRuntime
      const activation = yield* ActivationProjection
      return layerSqliteRuntime({
        options: { ...storeOptions, source: "rivet-actor", activationProjection: activation },
        workerId: ownerId,
        schedulerMode: "external",
      })
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
  ): Layer.Layer<ActorRuntimeServices, SqliteStoreError | SqlError.SqlError | RuntimeUnavailable, ExecutableResolver>
  (
    options: ActorRuntimeOptions,
  ): (
    context: RuntimeActorContext,
  ) => Layer.Layer<ActorRuntimeServices, SqliteStoreError | SqlError.SqlError | RuntimeUnavailable, ExecutableResolver>
} = Function.dual(2, layerActorRuntimeImpl)
