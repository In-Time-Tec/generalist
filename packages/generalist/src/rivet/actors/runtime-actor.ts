/* oxlint-disable effecttsgo/async-function -- Rivet actor hooks and actions are Promise-only host boundaries. */
/* oxlint-disable anti-slop-effect/no-service-constructor-imports -- the actor is the composition root that owns its SQL client, projection, and exclusive recovery. */
import { Clock, Context as EffectContext, Effect, Layer, ManagedRuntime, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import { SqlClient, SqlError } from "effect/unstable/sql"
import {
  actor,
  type ActionContext,
  type ActorContext,
  type ActorDefinition,
  type InstanceActorOptionsInput,
  type ScheduledFireInfo,
} from "rivetkit"
import { db } from "rivetkit/db"
import { Address } from "../../runtime/address.js"
import { RuntimeUnavailable } from "../../runtime/errors.js"
import { ExecutableResolver } from "../../runtime/executable/resolver.js"
import { Metadata } from "../../runtime/messaging/message.js"
import { ResolveOperationInput } from "../../runtime/operation/resolution.js"
import {
  Runtime,
  type CancelInput as RuntimeCancelInput,
  type RespondInput as RuntimeRespondInput,
  type SendInput as RuntimeSendInput,
  type Service as RuntimeService,
  type SignalInput as RuntimeSignalInput,
} from "../../runtime/service.js"
import { TreePolicy } from "../../runtime/tree/policy.js"
import {
  layerSqliteRuntime,
  makeExclusiveExecutionRecovery,
  SqliteRunActivation,
  type SqliteRuntimeServices,
  type SqliteStoreError,
  type SqliteStoreOptions,
} from "../../runtime/sql-driver.js"
import { layerSqlClient } from "./raw-sql.js"

const SendInput = Schema.Struct({
  runId: Schema.optionalKey(Schema.String),
  treePolicy: Schema.optionalKey(TreePolicy),
  to: Address,
  from: Schema.optionalKey(Address),
  sessionId: Schema.String,
  idempotencyKey: Schema.String,
  prompt: Schema.Union([Schema.String, Schema.toEncoded(Prompt.Prompt), Schema.Array(Schema.Unknown)]),
  messageId: Schema.optionalKey(Schema.String),
  causationId: Schema.optionalKey(Schema.String),
  correlationId: Schema.optionalKey(Schema.String),
  inReplyTo: Schema.optionalKey(Schema.String),
  metadata: Schema.optionalKey(Metadata),
})

const SignalInput = Schema.Struct({
  runId: Schema.String,
  name: Schema.String,
  payload: Schema.optionalKey(Schema.Unknown),
})

const RespondInput = Schema.Struct({
  runId: Schema.String,
  waitId: Schema.String,
  resolution: Schema.Union([
    Schema.TaggedStruct("Approved", {}),
    Schema.TaggedStruct("Denied", { reason: Schema.optionalKey(Schema.String) }),
    Schema.TaggedStruct("ToolResult", { result: Schema.Unknown, encodedResult: Schema.Unknown }),
  ]),
})

const CancelInput = Schema.Struct({
  runId: Schema.String,
  reason: Schema.optionalKey(Schema.String),
})

const actionInputSchemas = {
  runtime: {
    send: Schema.toStandardSchemaV1(Schema.Tuple([SendInput])),
    signal: Schema.toStandardSchemaV1(Schema.Tuple([SignalInput])),
    respond: Schema.toStandardSchemaV1(Schema.Tuple([RespondInput])),
    cancel: Schema.toStandardSchemaV1(Schema.Tuple([CancelInput])),
    resolveOperation: Schema.toStandardSchemaV1(Schema.Tuple([ResolveOperationInput])),
    inspect: Schema.toStandardSchemaV1(Schema.Tuple([Schema.String])),
  },
}

class RuntimeOwner extends EffectContext.Service<RuntimeOwner, { readonly ownerId: string }>()(
  "generalist/rivet/actors/runtime-actor/RuntimeOwner",
) {}

type RuntimeHost = ManagedRuntime.ManagedRuntime<
  SqliteRuntimeServices | SqlClient.SqlClient | RuntimeOwner,
  SqliteStoreError | SqlError.SqlError | RuntimeUnavailable
>

interface Host {
  readonly runtime: RuntimeHost
  readonly ownerId: string
}

interface Vars {
  host: Host | undefined
}

type Context = ActorContext<undefined, undefined, undefined, Vars, undefined, ReturnType<typeof db>>
type RuntimeActionContext = ActionContext<undefined, undefined, undefined, Vars, undefined, ReturnType<typeof db>>

type RuntimeActions = {
  readonly runtime: {
    readonly send: (
      c: RuntimeActionContext,
      input: RuntimeSendInput,
    ) => Promise<Effect.Success<ReturnType<RuntimeService["send"]>>>
    readonly signal: (c: RuntimeActionContext, input: RuntimeSignalInput) => Promise<void>
    readonly respond: (c: RuntimeActionContext, input: RuntimeRespondInput) => Promise<void>
    readonly cancel: (c: RuntimeActionContext, input: RuntimeCancelInput) => Promise<void>
    readonly resolveOperation: (c: RuntimeActionContext, input: ResolveOperationInput) => Promise<void>
    readonly inspect: (
      c: RuntimeActionContext,
      runId: string,
    ) => Promise<Effect.Success<ReturnType<RuntimeService["inspect"]>>>
    readonly drain: (c: RuntimeActionContext, fire?: ScheduledFireInfo) => Promise<SqliteRunActivation.DrainResult>
  }
}

/** @experimental One typed Rivet Actor definition owning one Runtime partition. */
export type RuntimeActorDefinition = ActorDefinition<
  undefined,
  undefined,
  undefined,
  Vars,
  undefined,
  ReturnType<typeof db>,
  Record<never, never>,
  Record<never, never>,
  RuntimeActions
>

/** @experimental */
export interface RuntimeActorOptions extends Omit<SqliteStoreOptions, "activationProjection" | "source"> {
  /** Application-owned executable reconstruction composed into each actor incarnation. */
  readonly resolver: Layer.Layer<ExecutableResolver>
  /** Bounded authoritative candidates processed per wake. */
  readonly drainFuel?: number
  /** Bounded stale claims recovered per startup transaction. */
  readonly recoveryPageSize?: number
  /** Durable fallback doorbell interval. Rivet requires at least 5 seconds. */
  readonly recoveryIntervalMillis?: number
  /** Rivet process-lifecycle tuning; it never carries Runtime authority. */
  readonly actorOptions?: InstanceActorOptionsInput
}

interface ConfiguredActorOptions {
  options?: InstanceActorOptionsInput
}

const requireHost = (c: Context): Host => {
  if (c.vars.host === undefined) throw new Error("Generalist Runtime host is not awake")
  return c.vars.host
}

const arm = async (c: Context, delayMillis = 0): Promise<void> => {
  try {
    await c.schedule.after(Math.max(0, delayMillis), "runtime.drain")
  } catch (cause) {
    // Rivet's logger is intentionally untyped at this raw SDK boundary.
    // oxlint-disable-next-line typescript/no-unsafe-call
    c.log.warn({ msg: "Generalist Runtime doorbell failed; periodic recovery remains armed", cause })
  }
}

const runDrain = async (c: Context, fuel: number) => {
  const host = requireHost(c)
  const result = await host.runtime.runPromise(
    SqliteRunActivation.drain({
      ownerId: host.ownerId,
      fuel,
      rearm: Effect.void,
    }),
    { signal: c.abortSignal },
  )
  if (result.nextDueAt !== undefined) {
    const now = await host.runtime.runPromise(Clock.currentTimeMillis)
    await arm(c, result.hasMore ? 0 : result.nextDueAt - now)
  }
  return result
}

const runAction = async <A, E>(c: Context, effect: (runtime: RuntimeService) => Effect.Effect<A, E>): Promise<A> => {
  const host = requireHost(c)
  const result = await c.keepAwake(host.runtime.runPromise(Effect.flatMap(Runtime, effect), { signal: c.abortSignal }))
  await arm(c)
  return result
}

const dispose = async (c: Context): Promise<void> => {
  const host = c.vars.host
  c.vars.host = undefined
  if (host !== undefined) await host.runtime.dispose()
}

const makeRuntimeOwner = (actorId: string) =>
  Effect.gen(function* () {
    const sqlClient = yield* SqlClient.SqlClient
    const rows = yield* sqlClient.withTransaction(
      Effect.gen(function* () {
        yield* sqlClient`CREATE TABLE IF NOT EXISTS generalist_rivet_host (
          singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
          incarnation INTEGER NOT NULL
        )`
        return yield* sqlClient<{ incarnation: number }>`INSERT INTO generalist_rivet_host (singleton, incarnation)
          VALUES (1, 1)
          ON CONFLICT(singleton) DO UPDATE SET incarnation = incarnation + 1
          RETURNING incarnation`
      }),
    )
    const incarnation = rows[0]?.incarnation
    if (incarnation === undefined) {
      return yield* RuntimeUnavailable.make({ message: "Rivet actor incarnation allocation returned no row" })
    }
    return RuntimeOwner.of({ ownerId: `${actorId}:${incarnation}` })
  })

/**
 * @experimental Build one Rivet Actor per Runtime partition.
 *
 * Actor SQLite is the only mutable Runtime authority. Schedules and cron are lossy doorbells.
 */
export const makeRuntimeActor = (options: RuntimeActorOptions): RuntimeActorDefinition => {
  const {
    actorOptions,
    drainFuel,
    recoveryIntervalMillis,
    recoveryPageSize: pageSize,
    resolver,
    ...storeOptions
  } = options
  const fuel = Math.max(1, Math.floor(drainFuel ?? 64))
  const recoveryPageSize = Math.max(1, Math.min(1000, Math.floor(pageSize ?? 100)))
  const recoveryInterval = Math.max(5_000, Math.floor(recoveryIntervalMillis ?? 5_000))
  const configuredOptions: ConfiguredActorOptions = {}
  if (actorOptions !== undefined) configuredOptions.options = actorOptions

  return actor({
    db: db({ warnOnManualTransactions: false }),
    createVars: (): Vars => ({ host: undefined }),
    ...configuredOptions,
    actionInputSchemas,
    onWake: async (c) => {
      await c.cron.every({
        name: "generalist-runtime-recovery",
        interval: recoveryInterval,
        action: "runtime.drain",
        maxHistory: 0,
      })

      const ownerLayer = Layer.effect(RuntimeOwner, makeRuntimeOwner(c.actorId))
      const runtime = ManagedRuntime.make(
        Layer.unwrap(
          Effect.gen(function* () {
            const sqlClient = yield* SqlClient.SqlClient
            const owner = yield* RuntimeOwner
            return layerSqliteRuntime({
              options: {
                ...storeOptions,
                source: "rivet-actor",
                activationProjection: SqliteRunActivation.makeProjection(sqlClient, Effect.void),
              },
              workerId: owner.ownerId,
              schedulerMode: "external",
            })
          }),
        ).pipe(Layer.provide(resolver), Layer.provideMerge(ownerLayer), Layer.provideMerge(layerSqlClient(c.db))),
      )
      try {
        const { ownerId } = await runtime.runPromise(RuntimeOwner, { signal: c.abortSignal })
        const sql = await runtime.runPromise(SqlClient.SqlClient, { signal: c.abortSignal })
        const projection = SqliteRunActivation.makeProjection(sql, Effect.void)
        const host: Host = { runtime, ownerId }
        c.vars.host = host
        const result = await runtime.runPromise(
          Effect.gen(function* () {
            yield* Runtime
            yield* sql.withTransaction(SqliteRunActivation.initialize(Effect.void))
            const recovery = makeExclusiveExecutionRecovery(sql, projection)
            let afterRunId: string | undefined
            do {
              const input: Parameters<typeof recovery.recoverClaims>[0] = {
                newOwnerId: ownerId,
                limit: recoveryPageSize,
              }
              if (afterRunId !== undefined) Object.assign(input, { afterRunId })
              const recovered = yield* recovery.recoverClaims(input)
              afterRunId = recovered.continuation
            } while (afterRunId !== undefined)
            return yield* SqliteRunActivation.drain({
              ownerId,
              fuel,
              rearm: Effect.void,
            })
          }),
          { signal: c.abortSignal },
        )
        if (result.nextDueAt !== undefined) await arm(c)
      } catch (cause) {
        c.vars.host = undefined
        await runtime.dispose()
        throw cause
      }
    },
    onSleep: dispose,
    onDestroy: dispose,
    actions: {
      runtime: {
        send: (c, input: RuntimeSendInput) => runAction(c, (runtime) => runtime.send(input)),
        signal: (c, input: RuntimeSignalInput) => runAction(c, (runtime) => runtime.signal(input)),
        respond: (c, input: RuntimeRespondInput) => runAction(c, (runtime) => runtime.respond(input)),
        cancel: (c, input: RuntimeCancelInput) => runAction(c, (runtime) => runtime.cancel(input)),
        resolveOperation: (c, input: ResolveOperationInput) =>
          runAction(c, (runtime) => runtime.resolveOperation(input)),
        inspect: (c, runId: string) => {
          const host = requireHost(c)
          return c.keepAwake(
            host.runtime.runPromise(
              Effect.flatMap(Runtime, (runtime) => runtime.inspect(runId)),
              {
                signal: c.abortSignal,
              },
            ),
          )
        },
        drain: (c, _fire?: ScheduledFireInfo) => c.keepAwake(runDrain(c, fuel)),
      },
    },
  })
}
