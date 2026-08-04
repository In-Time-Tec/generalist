import { Effect, Redacted } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { MysqlClient } from "@effect/sql-mysql2"
import { ExecutableResolver, MysqlRunSchema, Runtime } from "../../src/index.js"
import { SCHEMA_VERSION, schemaChecksum } from "../../src/sql/mysql/schema.js"
import {
  analyst,
  analystRef,
  assistant,
  assistantAddress,
  assistantRef,
  researcher,
  researcherAddress,
  researcherRef,
} from "../helpers.js"

export const mysqlUrl = process.env.BATON_MYSQL_URL ?? process.env.MYSQL_URL
export const mysqlAvailable = typeof mysqlUrl === "string" && mysqlUrl.length > 0

const resolver = ExecutableResolver.makeStatic([
  { executable: assistantRef, agent: assistant },
  { executable: researcherRef, agent: researcher },
  { executable: analystRef, agent: analyst },
])
const addresses = [
  { address: assistantAddress, executable: assistantRef },
  { address: researcherAddress, executable: researcherRef },
]

export const mysqlClient = (url: string) => MysqlClient.layer({ url: Redacted.make(url), maxConnections: 4 })

export const applySchema = (url: string) =>
  MysqlRunSchema.apply("mysql-test").pipe(Effect.provide(mysqlClient(url)), Effect.scoped)

export const resetRuntimeTables = (url: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql.withTransaction(
      Effect.gen(function* () {
        yield* sql.unsafe("SET FOREIGN_KEY_CHECKS=0")
        for (const table of [
          "baton_tree_event_index",
          "baton_tree_roots",
          "baton_fan_out_members",
          "baton_fan_outs",
          "baton_run_steering",
          "baton_run_links",
          "baton_run_waits",
          "baton_run_operations",
          "baton_run_events",
          "baton_runs",
          "baton_lanes",
        ])
          yield* sql.unsafe(`TRUNCATE ${table}`)
        yield* sql.unsafe("SET FOREIGN_KEY_CHECKS=1")
        yield* sql`
      UPDATE baton_schema_meta
      SET version = ${SCHEMA_VERSION}, checksum = ${schemaChecksum()}, dirty = 0
      WHERE id = 1
    `
      }),
    )
  }).pipe(Effect.provide(mysqlClient(url)), Effect.scoped)

export const prepareMysql = (url: string) =>
  Effect.gen(function* () {
    yield* applySchema(url)
    yield* resetRuntimeTables(url)
  })

export const mysqlLayer = (url: string) =>
  Runtime.layerMysql({
    url,
    source: "mysql-test",
    resolver,
    addresses,
    subscriberQueueCapacity: 8,
    maxConnections: 4,
    pollInterval: "20 millis",
  })

export const uniqueSession = (label: string) =>
  `session:${label}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`
