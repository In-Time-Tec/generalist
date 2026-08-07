import { Config, Effect, Option, Redacted } from "effect"
import { provideScoped } from "../scoped-provide.js"
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
  registrationsFor,
  researcherRef,
} from "../helpers.js"
import { closedTestAgent } from "../identity.js"

export const mysqlUrl = Effect.runSync(
  Config.option(Config.string("BATON_MYSQL_URL").pipe(Config.orElse(() => Config.string("MYSQL_URL")))).pipe(
    Effect.map(Option.getOrUndefined),
  ),
)
export const mysqlAvailable = typeof mysqlUrl === "string" && mysqlUrl.length > 0

const resolver = ExecutableResolver.makeStatic([
  { executable: assistantRef, agent: closedTestAgent(assistant) },
  { executable: researcherRef, agent: closedTestAgent(researcher) },
  { executable: analystRef, agent: closedTestAgent(analyst) },
])
const addresses = [
  { address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) },
  { address: researcherAddress, executable: researcherRef, registrations: registrationsFor(researcherRef) },
]

export const mysqlClient = (url: string) => MysqlClient.layer({ url: Redacted.make(url), maxConnections: 4 })

export const applySchema = (url: string) => provideScoped(mysqlClient(url), MysqlRunSchema.apply("mysql-test"))

export const resetRuntimeTables = (url: string) =>
  provideScoped(
    mysqlClient(url),
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql.withTransaction(
        Effect.gen(function* () {
          yield* sql.unsafe("SET FOREIGN_KEY_CHECKS=0")
          for (const table of [
            "baton_run_registrations",
            "baton_executable_registrations",
            "baton_program_operations",
            "baton_program_runs",
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
    }),
  )

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

let uniqueSessionCounter = 0
export const uniqueSession = (label: string) =>
  `session:${label}:${process.pid.toString(36)}:${(uniqueSessionCounter += 1).toString(36)}`
