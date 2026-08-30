import { layer, RuntimeSchema } from "@tenetkit/mysql"
import { Config, Effect, Layer, Option, Redacted } from "effect"
import { provideScoped } from "../../../../tenetkit/test/runtime/execution/scoped-provide.js"
import { SqlClient } from "effect/unstable/sql"
import type { SqlError } from "effect/unstable/sql/SqlError"
import { MysqlClient } from "@effect/sql-mysql2"
import { ExecutableResolver } from "tenetkit/runtime"
import type { RuntimeError } from "../../../src/mysql/store/implementation.js"
import { SCHEMA_VERSION, schemaChecksum } from "../../../src/mysql/schema/definition.js"
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
} from "../../../../tenetkit/test/runtime/execution/fixtures.js"
import { closedTestAgent } from "../../../../tenetkit/test/runtime/run/identity.js"
import type { MessagingOverrides } from "../../../../tenetkit/test/runtime/messaging/scenario.js"

export const mysqlUrl = Effect.runSync(
  Config.option(Config.string("TENETKIT_MYSQL_URL").pipe(Config.orElse(() => Config.string("MYSQL_URL")))).pipe(
    Effect.map(Option.getOrUndefined),
  ),
)
export const mysqlAvailable = mysqlUrl !== undefined && mysqlUrl.length > 0

const resolverLayer = ExecutableResolver.layerStatic([
  { executable: assistantRef, agent: closedTestAgent(assistant) },
  { executable: researcherRef, agent: closedTestAgent(researcher) },
  { executable: analystRef, agent: closedTestAgent(analyst) },
]).pipe(Layer.orDie)
const addresses = [
  { address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) },
  { address: researcherAddress, executable: researcherRef, registrations: registrationsFor(researcherRef) },
]

export const mysqlClient = (url: string) => MysqlClient.layer({ url: Redacted.make(url), maxConnections: 4 })

export const mysqlLayer = (url: string) =>
  layer({
    url,
    source: "mysql-test",
    addresses,
    subscriberQueueCapacity: 8,
    maxConnections: 4,
    pollInterval: "20 millis",
  }).pipe(Layer.provide(resolverLayer))

/**
 * A MySQL Runtime whose mailbox bounds and messaging policy the test chooses.
 *
 * Bounds and policy are Runtime construction options, so each variant is its own Runtime over the
 * one database this file provisions.
 */
export const mysqlMessagingLayer = (database: MysqlDatabase) => (overrides: MessagingOverrides) =>
  database.provision(
    layer({
      url: database.url,
      source: "mysql-test",
      addresses,
      subscriberQueueCapacity: 8,
      maxConnections: 4,
      pollInterval: "20 millis",
      ...overrides,
    }).pipe(Layer.provide(resolverLayer)),
  )

const RUNTIME_TABLES = [
  "tenetkit_session_entries",
  "tenetkit_sessions",
  "tenetkit_run_registrations",
  "tenetkit_executable_registrations",
  "tenetkit_program_operations",
  "tenetkit_program_runs",
  "tenetkit_tree_event_index",
  "tenetkit_tree_roots",
  "tenetkit_fan_out_members",
  "tenetkit_fan_outs",
  "tenetkit_run_steering",
  "tenetkit_messages",
  "tenetkit_agent_names",
  "tenetkit_external_child_placements",
  "tenetkit_run_links",
  "tenetkit_run_waits",
  "tenetkit_run_operations",
  "tenetkit_run_events",
  "tenetkit_runs",
  "tenetkit_lanes",
] as const

const serverUrl = mysqlUrl ?? "mysql://mysql-unavailable/tenetkit"

const databaseName = (label: string) =>
  `tenetkit_${label.replace(/[^A-Za-z0-9]+/g, "_").toLowerCase()}_${process.pid.toString(36)}`

type MysqlClientError = SqlError | Config.ConfigError

export interface MysqlDatabase {
  readonly url: string
  readonly empty: Effect.Effect<void, MysqlClientError>
  readonly ready: Effect.Effect<void, MysqlClientError | RuntimeError>
  readonly truncated: Effect.Effect<void, MysqlClientError | RuntimeError>
  readonly provisioned: () => Promise<void>
  readonly client: Layer.Layer<SqlClient.SqlClient, MysqlClientError>
  readonly provision: <A, E, R>(self: Layer.Layer<A, E, R>) => Layer.Layer<A, E | MysqlClientError | RuntimeError, R>
  readonly provisionEmpty: <A, E, R>(self: Layer.Layer<A, E, R>) => Layer.Layer<A, E | MysqlClientError, R>
}

/**
 * One MySQL database per test file. Files never share tables, so the suite is
 * order-independent and safe under Vitest file parallelism.
 */
export const mysqlDatabase = (label: string): MysqlDatabase => {
  const name = databaseName(label)
  const parsed = new URL(serverUrl)
  parsed.pathname = `/${name}`
  const url = parsed.toString()
  const client = mysqlClient(url)
  const withServer = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) =>
    provideScoped(mysqlClient(serverUrl), effect).pipe(Effect.scoped)
  const withDatabase = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) =>
    provideScoped(client, effect).pipe(Effect.scoped)
  const empty = withServer(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql.unsafe(`DROP DATABASE IF EXISTS \`${name}\``)
      yield* sql.unsafe(`CREATE DATABASE \`${name}\``)
    }),
  ).pipe(Effect.asVoid)
  const ready = Effect.andThen(
    withServer(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        yield* sql.unsafe(`CREATE DATABASE IF NOT EXISTS \`${name}\``)
      }),
    ),
    withDatabase(RuntimeSchema.apply("mysql-test")),
  ).pipe(Effect.asVoid)
  const readyOnce = Effect.runSync(Effect.cached(ready))
  const provisioned = () => (mysqlAvailable ? Effect.runPromise(readyOnce) : Promise.resolve())
  const truncated = Effect.andThen(
    readyOnce,
    withDatabase(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        yield* sql.unsafe("SET FOREIGN_KEY_CHECKS=0")
        for (const table of RUNTIME_TABLES) yield* sql.unsafe(`DELETE FROM ${table}`)
        yield* sql.unsafe("SET FOREIGN_KEY_CHECKS=1")
        yield* sql`
          UPDATE tenetkit_schema_meta
          SET version = ${SCHEMA_VERSION}, checksum = ${schemaChecksum()}, dirty = 0
          WHERE id = 1
        `
      }),
    ),
  ).pipe(Effect.asVoid)
  return {
    url,
    empty,
    ready: readyOnce,
    truncated,
    provisioned,
    client,
    provision: <A, E, R>(self: Layer.Layer<A, E, R>) => Layer.unwrap(Effect.as(readyOnce, self)),
    provisionEmpty: <A, E, R>(self: Layer.Layer<A, E, R>) => Layer.unwrap(Effect.as(empty, self)),
  }
}

let uniqueSessionCounter = 0
export const uniqueSession = (label: string) =>
  `session:${label}:${process.pid.toString(36)}:${(uniqueSessionCounter += 1).toString(36)}`
