import { layer, RuntimeSchema } from "@tenetkit/pg"
import { Config, Effect, Layer, Option } from "effect"
import { provideScoped } from "../../../tenetkit/test/runtime/execution/scoped-provide.js"
import { SqlClient } from "effect/unstable/sql"
import type { SqlError } from "effect/unstable/sql/SqlError"
import { ExecutableResolver } from "tenetkit/runtime"
import { RuntimeWorker } from "tenetkit/runtime/sql-driver"
import type { RuntimeError } from "../../src/postgres/runtime-layer.js"
import {
  analyst,
  analystRef,
  assistant,
  assistantAddress,
  assistantRef,
  researcher,
  researcherAddress,
  registrationsFor,
  researcherRef,
} from "../../../tenetkit/test/runtime/execution/fixtures.js"
import { closedTestAgent } from "../../../tenetkit/test/runtime/run/identity.js"
import type { MessagingOverrides } from "../../../tenetkit/test/runtime/messaging/scenario.js"

export const postgresUrl = Effect.runSync(
  Config.option(Config.string("TENETKIT_DATABASE_URL").pipe(Config.orElse(() => Config.string("DATABASE_URL")))).pipe(
    Effect.map(Option.getOrUndefined),
  ),
)

export const postgresAvailable = postgresUrl !== undefined && postgresUrl.length > 0

export const postgresTestMaxConnections = 8

export const postgresClient = (url: string) => RuntimeSchema.layerClient({ url, maxConnections: 2 })

type PostgresWorkerLayer = Layer.Layer<
  | import("tenetkit/runtime").RunExecutor.RunExecutor
  | import("tenetkit/runtime/sql-driver").RunClaims
  | import("tenetkit/runtime").RunStore.RunStore
  | import("tenetkit/runtime").Runtime.Runtime
  | import("tenetkit/runtime/sql-driver").RuntimeWorker.RuntimeWorker,
  SqlError | RuntimeError,
  never
>

const resolverLayer = ExecutableResolver.layerStatic([
  { executable: assistantRef, agent: closedTestAgent(assistant) },
  { executable: researcherRef, agent: closedTestAgent(researcher) },
  { executable: analystRef, agent: closedTestAgent(analyst) },
]).pipe(Layer.orDie)
const addresses = [
  { address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) },
  { address: researcherAddress, executable: researcherRef, registrations: registrationsFor(researcherRef) },
]

export const postgresLayer = (url: string) =>
  layer({
    url,
    source: "postgres-test",
    addresses,
    subscriberQueueCapacity: 8,
    maxConnections: postgresTestMaxConnections,
  }).pipe(Layer.provide(resolverLayer))

/**
 * A PostgreSQL Runtime whose mailbox bounds and messaging policy the test chooses.
 *
 * Bounds and policy are Runtime construction options, so each variant is its own Runtime over the
 * one schema this file provisions.
 */
export const postgresMessagingLayer = (database: PostgresDatabase) => (overrides: MessagingOverrides) =>
  database.provision(
    layer({
      url: database.url,
      source: "postgres-test",
      addresses,
      subscriberQueueCapacity: 8,
      maxConnections: postgresTestMaxConnections,
      ...overrides,
    }).pipe(Layer.provide(resolverLayer)),
  )

export interface PostgresWorkerOptions {
  readonly url: string
  readonly workerId: string
  readonly concurrency?: number
}

export const postgresWithWorker = (options: PostgresWorkerOptions): PostgresWorkerLayer =>
  RuntimeWorker.layer({
    workerId: options.workerId,
    concurrency: options.concurrency ?? 4,
    lease: "5 seconds",
    fallbackInterval: "30 seconds",
  }).pipe(Layer.provideMerge(postgresLayer(options.url)))

const serverUrl = postgresUrl ?? "postgres://postgres-unavailable"

const schemaName = (label: string) =>
  `tenetkit_${label.replace(/[^A-Za-z0-9]+/g, "_").toLowerCase()}_${process.pid.toString(36)}`

export interface PostgresDatabase {
  readonly url: string
  readonly empty: Effect.Effect<void, SqlError>
  readonly ready: Effect.Effect<void, SqlError | RuntimeError>
  /** The one provisioning this file performs, so reopening a Runtime does not drop its own state. */
  readonly readyOnce: Effect.Effect<void, SqlError | RuntimeError>
  readonly client: Layer.Layer<SqlClient.SqlClient, SqlError>
  readonly provision: <A, E, R>(self: Layer.Layer<A, E, R>) => Layer.Layer<A, E | SqlError | RuntimeError, R>
  readonly provisionEmpty: <A, E, R>(self: Layer.Layer<A, E, R>) => Layer.Layer<A, E | SqlError, R>
}

/**
 * One PostgreSQL schema per test file. Files never share tables, so the suite is
 * order-independent and safe under Vitest file parallelism.
 */
export const postgresDatabase = (label: string): PostgresDatabase => {
  const schema = schemaName(label)
  const separator = serverUrl.includes("?") ? "&" : "?"
  const url = `${serverUrl}${separator}options=${encodeURIComponent(`-c search_path=${schema}`)}`
  const client = postgresClient(url)
  const empty = provideScoped(
    postgresClient(serverUrl),
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      yield* sql.unsafe(`CREATE SCHEMA ${schema}`)
    }),
  ).pipe(Effect.scoped, Effect.asVoid)
  const ready = Effect.andThen(
    empty,
    provideScoped(client, RuntimeSchema.apply("postgres-test")).pipe(Effect.scoped),
  ).pipe(Effect.asVoid)
  const readyOnce = Effect.runSync(Effect.cached(ready))
  return {
    url,
    empty,
    ready,
    readyOnce,
    client,
    provision: <A, E, R>(self: Layer.Layer<A, E, R>) => Layer.unwrap(Effect.as(readyOnce, self)),
    provisionEmpty: <A, E, R>(self: Layer.Layer<A, E, R>) => Layer.unwrap(Effect.as(empty, self)),
  }
}

let uniqueSessionCounter = 0
export const uniqueSession = (label: string) =>
  `session:${label}:${process.pid.toString(36)}:${(uniqueSessionCounter += 1).toString(36)}`
