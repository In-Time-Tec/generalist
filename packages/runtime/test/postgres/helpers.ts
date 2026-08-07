import { Config, Effect, Layer, Option, Redacted } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { PgClient } from "@effect/sql-pg"
import { ExecutableResolver, Runtime, RuntimeWorker, RunSchema } from "../../src/index.js"
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

export const postgresUrl = Effect.runSync(
  Config.option(Config.string("BATON_DATABASE_URL").pipe(Config.orElse(() => Config.string("DATABASE_URL")))).pipe(
    Effect.map(Option.getOrUndefined),
  ),
)

export const postgresAvailable = typeof postgresUrl === "string" && postgresUrl.length > 0

const resolver = ExecutableResolver.makeStatic([
  { executable: assistantRef, agent: closedTestAgent(assistant) },
  { executable: researcherRef, agent: closedTestAgent(researcher) },
  { executable: analystRef, agent: closedTestAgent(analyst) },
])
const addresses = [
  { address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) },
  { address: researcherAddress, executable: researcherRef, registrations: registrationsFor(researcherRef) },
]

export const applySchema = (url: string) =>
  RunSchema.apply("postgres").pipe(Effect.provide(PgClient.layer({ url: Redacted.make(url) })), Effect.scoped)

const resetRuntimeSchema = (url: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql.unsafe(`DROP TABLE IF EXISTS
      baton_run_registrations, baton_executable_registrations,
      baton_program_operations, baton_program_runs, baton_tree_event_index, baton_tree_roots, baton_fan_out_members, baton_fan_outs, baton_run_steering,
      baton_run_links, baton_run_waits, baton_run_operations, baton_run_events, baton_runs, baton_lanes,
      baton_runtime_locks, baton_sql_migrations, baton_schema_meta CASCADE`)
  }).pipe(Effect.provide(PgClient.layer({ url: Redacted.make(url) })), Effect.scoped)

export const preparePostgres = (url: string) =>
  Effect.gen(function* () {
    yield* resetRuntimeSchema(url)
    yield* applySchema(url)
  })

export const postgresLayer = (url: string) =>
  Runtime.layerPostgres({
    url,
    source: "postgres-test",
    resolver,
    addresses,
    subscriberQueueCapacity: 8,
  })

export const postgresWithWorker = (url: string, workerId: string, concurrency = 4) =>
  RuntimeWorker.layerWorker({
    workerId,
    concurrency,
    lease: "5 seconds",
    pollInterval: "50 millis",
  }).pipe(Layer.provideMerge(postgresLayer(url)))

let uniqueSessionCounter = 0
export const uniqueSession = (label: string) =>
  `session:${label}:${process.pid.toString(36)}:${(uniqueSessionCounter += 1).toString(36)}`
