import { Config, Effect, Layer, Option, Redacted } from "effect"
import { provideScoped } from "../scoped-provide.js"
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

type PostgresWorkerLayer = Layer.Layer<
  | import("../../src/execution-host.js").ExecutionHost
  | import("../../src/sql/run-claims.js").RunClaims
  | import("../../src/run-store.js").RunStore
  | import("../../src/runtime.js").Runtime
  | import("../../src/sql/postgres/worker.js").RuntimeWorker,
  | import("effect/unstable/sql/SqlError").SqlError
  | import("../../src/sql/postgres/runtime-layer.js").PostgresStoreError,
  never
>

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
  provideScoped(PgClient.layer({ url: Redacted.make(url) }), RunSchema.apply("postgres"))

const resetRuntimeSchema = (url: string) =>
  provideScoped(
    PgClient.layer({ url: Redacted.make(url) }),
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql.unsafe(`DROP TABLE IF EXISTS
      baton_run_registrations, baton_executable_registrations,
      baton_program_operations, baton_program_runs, baton_tree_event_index, baton_tree_roots, baton_fan_out_members, baton_fan_outs, baton_run_steering,
      baton_run_links, baton_run_waits, baton_run_operations, baton_run_acks, baton_run_events, baton_runs, baton_lanes,
      baton_runtime_locks, baton_sql_migrations, baton_schema_meta CASCADE`)
    }),
  )

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

export const postgresWithWorker: {
  (url: string, workerId: string, concurrency?: number): PostgresWorkerLayer
  (workerId: string, concurrency?: number): (url: string) => PostgresWorkerLayer
} = (urlOrWorkerId: string, maybeWorkerIdOrConcurrency?: string | number, maybeConcurrency?: number): any => {
  if (maybeWorkerIdOrConcurrency === undefined || typeof maybeWorkerIdOrConcurrency === "number") {
    const workerId = urlOrWorkerId
    const concurrency = typeof maybeWorkerIdOrConcurrency === "number" ? maybeWorkerIdOrConcurrency : maybeConcurrency
    return (url: string) => postgresWithWorker(url, workerId, concurrency)
  }
  const url = urlOrWorkerId
  const workerId = maybeWorkerIdOrConcurrency
  return RuntimeWorker.layerWorker({
    workerId,
    concurrency: maybeConcurrency ?? 4,
    lease: "5 seconds",
    pollInterval: "50 millis",
  }).pipe(Layer.provideMerge(postgresLayer(url)))
}

let uniqueSessionCounter = 0
export const uniqueSession = (label: string) =>
  `session:${label}:${process.pid.toString(36)}:${(uniqueSessionCounter += 1).toString(36)}`
