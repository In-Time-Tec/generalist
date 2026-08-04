import { Effect, Layer, Redacted } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { PgClient } from "@effect/sql-pg"
import { Runtime, RuntimeWorker, RunSchema } from "../../src/index.js"
import { SCHEMA_VERSION, schemaChecksum } from "../../src/sql/postgres/schema.js"
import { assistant, assistantAddress, assistantRef, researcher, researcherAddress, researcherRef } from "../helpers.js"

export const postgresUrl = process.env.BATON_DATABASE_URL ?? process.env.DATABASE_URL

export const postgresAvailable = typeof postgresUrl === "string" && postgresUrl.length > 0

const agents = [
  { ref: assistantRef, agent: assistant },
  { ref: researcherRef, agent: researcher },
]
const addresses = [
  { address: assistantAddress, agent: assistantRef },
  { address: researcherAddress, agent: researcherRef },
]

export const applySchema = (url: string) =>
  RunSchema.apply("postgres").pipe(Effect.provide(PgClient.layer({ url: Redacted.make(url) })), Effect.scoped)

export const resetRuntimeTables = (url: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`
      TRUNCATE baton_fan_out_members, baton_fan_outs, baton_run_steering, baton_run_links,
        baton_run_waits, baton_run_operations, baton_run_events, baton_runs, baton_lanes
      RESTART IDENTITY CASCADE
    `
    yield* sql`
      UPDATE baton_schema_meta
      SET version = ${SCHEMA_VERSION}, checksum = ${schemaChecksum()}, dirty = FALSE
      WHERE id = 1
    `
  }).pipe(Effect.provide(PgClient.layer({ url: Redacted.make(url) })), Effect.scoped)

export const preparePostgres = (url: string) =>
  Effect.gen(function* () {
    yield* applySchema(url)
    yield* resetRuntimeTables(url)
  })

export const postgresLayer = (url: string) =>
  Runtime.layerPostgres({
    url,
    source: "postgres-test",
    agents,
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

export const uniqueSession = (label: string) =>
  `session:${label}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`
