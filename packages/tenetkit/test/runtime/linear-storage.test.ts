import { Database } from "bun:sqlite"
import { expect, it } from "@effect/vitest"
import { Effect, Layer, Option, Schema, Stream } from "effect"
import { LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
import { Agent, ToolExecutor } from "tenetkit"
import { Address, ExecutionHost, ExecutableResolver, Runtime, RunStore } from "../../src/runtime/index.js"
import { registrationsFor } from "./helpers.js"
import { testExecutable } from "./identity.js"
import { provideScoped } from "./scoped-provide.js"
import { tempDbPath } from "./sqlite-helpers.js"

import { Runtime as SqliteRuntime } from "../../src/runtime/sqlite-bun.js"
const scalePoints = [1, 5, 10, 20] as const
const probe = Tool.make("linear_storage_probe", {
  parameters: Schema.Struct({ marker: Schema.String }),
  success: Schema.String,
})
const finish = Response.makePart("finish", {
  reason: "stop",
  usage: Response.Usage.make({
    inputTokens: { total: 1, uncached: 1, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 1, text: 1, reasoning: undefined },
  }),
  response: undefined,
})

interface JsonRow {
  readonly rowKey: string
  readonly payload: string | null
}

interface ParsedRow {
  readonly rowKey: string
  readonly payload: unknown
  readonly bytes: number
}

interface Counts {
  readonly modelCalls: number
  readonly toolCalls: number
}

interface Measurement extends Counts {
  readonly scale: number
  readonly operationBytes: number
  readonly eventBytes: number
  readonly checkpointBytes: number
  readonly sessionBytes: number
  readonly totalJsonBytes: number
  readonly activePages: number
}

const markersFor = (scale: number): ReadonlyArray<string> =>
  Array.from({ length: scale }, (_, turn) => `linear-semantic-${turn.toString().padStart(2, "0")}-payload`)

const parseRows = (rows: ReadonlyArray<JsonRow>): ReadonlyArray<ParsedRow> =>
  rows.flatMap((row) =>
    row.payload === null
      ? []
      : [{ rowKey: row.rowKey, payload: JSON.parse(row.payload), bytes: Buffer.byteLength(row.payload) }],
  )

const totalBytes = (rows: ReadonlyArray<ParsedRow>): number => rows.reduce((total, row) => total + row.bytes, 0)

const makeFixture = (scale: number, filename: string) => {
  const markers = markersFor(scale)
  const agent = Agent.make({ name: "linear-storage", toolkit: Toolkit.make(probe) })
  const executable = testExecutable(agent, "linear-storage-v1")
  const address = Address.make("agent:linear-storage")
  let modelCalls = 0
  let toolCalls = 0
  const model = Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
      streamText: () => {
        const turn = modelCalls++
        const marker = markers[turn]
        if (marker === undefined) return Stream.die(new Error(`unexpected model call ${turn}`))
        return Stream.fromIterable<Response.StreamPartEncoded>(
          turn + 1 < scale
            ? [
                Response.makePart("tool-call", {
                  id: `linear-call-${turn.toString().padStart(2, "0")}`,
                  name: "linear_storage_probe",
                  params: { marker },
                  providerExecuted: false,
                }),
                finish,
              ]
            : [
                Response.makePart("text-start", { id: "linear-answer" }),
                Response.makePart("text-delta", { id: "linear-answer", delta: marker }),
                Response.makePart("text-end", { id: "linear-answer" }),
                finish,
              ],
        )
      },
    }),
  )
  const executor = ToolExecutor.layerTest({
    execute: (request) =>
      Effect.sync(() => {
        toolCalls += 1
        const marker = (request.call.params as { readonly marker: string }).marker
        return { _tag: "Success" as const, result: `observed:${marker}`, encodedResult: `observed:${marker}` }
      }),
  })
  const handlers = Toolkit.make(probe).toLayer({
    linear_storage_probe: () => Effect.die("ToolExecutor test layer owns execution"),
  })
  const resolver = ExecutableResolver.makeStatic([
    { executable, agent: Agent.close(agent, Layer.mergeAll(model, executor, handlers)) },
  ])
  const runtimeLayer = SqliteRuntime.layerSqlite({
    filename,
    resolver,
    addresses: [{ address, executable, registrations: registrationsFor(executable) }],
    scheduler: { pollInterval: "1 day" },
  })
  return {
    address,
    executable,
    markers,
    runtimeLayer,
    counts: () => ({ modelCalls, toolCalls }),
  }
}

const initialize = (filename: string) => {
  const fixture = makeFixture(1, filename)
  return Effect.scoped(provideScoped(fixture.runtimeLayer, Effect.void))
}

const readRows = (database: Database, sql: string): ReadonlyArray<ParsedRow> =>
  parseRows(database.query<JsonRow, []>(sql).all())

const measure = (filename: string, scale: number, markers: ReadonlyArray<string>, counts: Counts): Measurement => {
  const database = new Database(filename)
  database.exec("PRAGMA wal_checkpoint(TRUNCATE)")
  const operations = readRows(
    database,
    "SELECT operation_id || ':result' AS rowKey, result_json AS payload FROM tenetkit_run_operations WHERE result_json IS NOT NULL",
  )
  const events = readRows(
    database,
    "SELECT run_id || ':event:' || sequence AS rowKey, event_json AS payload FROM tenetkit_run_events",
  )
  const checkpoints = readRows(
    database,
    "SELECT run_id || ':checkpoint' AS rowKey, driver_checkpoint_json AS payload FROM tenetkit_runs WHERE driver_checkpoint_json IS NOT NULL",
  )
  const sessions = readRows(
    database,
    "SELECT session_id || ':session:' || entry_id AS rowKey, payload_json AS payload FROM tenetkit_session_entries",
  )
  const lifecycle = readRows(
    database,
    `SELECT operation_id || ':input' AS rowKey, input_json AS payload FROM tenetkit_run_operations
     UNION ALL SELECT operation_id || ':result', result_json FROM tenetkit_run_operations
     UNION ALL SELECT operation_id || ':error', error_json FROM tenetkit_run_operations
     UNION ALL SELECT run_id || ':event:' || sequence, event_json FROM tenetkit_run_events
     UNION ALL SELECT run_id || ':message', message_json FROM tenetkit_runs
     UNION ALL SELECT run_id || ':checkpoint', driver_checkpoint_json FROM tenetkit_runs
     UNION ALL SELECT run_id || ':suspension', suspension_json FROM tenetkit_runs
     UNION ALL SELECT run_id || ':continuation', continuation_json FROM tenetkit_runs
     UNION ALL SELECT run_id || ':pending', pending_outcome_json FROM tenetkit_runs`,
  )
  const sessionJson = sessions.map((row) => JSON.stringify(row.payload))
  for (const marker of markers) expect(sessionJson.some((payload) => payload.includes(marker))).toBe(true)
  for (const row of lifecycle) {
    const serialized = JSON.stringify(row.payload)
    const contained = markers.flatMap((marker, turn) => (serialized.includes(marker) ? [turn] : []))
    expect(contained.length, row.rowKey).toBeLessThanOrEqual(1)
    if (typeof row.payload === "object" && row.payload !== null && "turn" in row.payload) {
      const turn = (row.payload as { readonly turn?: unknown }).turn
      if (typeof turn === "number") {
        for (let earlier = 0; earlier < turn; earlier++) expect(serialized, row.rowKey).not.toContain(markers[earlier])
      }
    }
  }
  const modelResults = operations.filter(
    (row) => typeof row.payload === "object" && row.payload !== null && "modelCallId" in row.payload,
  )
  expect(modelResults).toHaveLength(scale)
  for (const row of modelResults) expect(row.payload).not.toHaveProperty("messages")
  expect(events.filter((row) => JSON.stringify(row.payload).includes('"_tag":"ModelResponseCommitted"'))).toHaveLength(
    scale,
  )
  const activePages = database
    .query<
      { readonly activePages: number },
      []
    >("SELECT (SELECT page_count FROM pragma_page_count()) - (SELECT freelist_count FROM pragma_freelist_count()) AS activePages")
    .get()!.activePages
  database.close()
  const operationBytes = totalBytes(operations)
  const eventBytes = totalBytes(events)
  const checkpointBytes = totalBytes(checkpoints)
  const sessionBytes = totalBytes(sessions)
  return {
    scale,
    ...counts,
    operationBytes,
    eventBytes,
    checkpointBytes,
    sessionBytes,
    totalJsonBytes: operationBytes + eventBytes + checkpointBytes + sessionBytes,
    activePages,
  }
}

const executeScale = (scale: number) =>
  Effect.gen(function* () {
    const filename = tempDbPath(`linear-storage-${scale}`)
    const fixture = makeFixture(scale, filename)
    yield* Effect.scoped(
      provideScoped(
        fixture.runtimeLayer,
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const store = yield* RunStore.RunStore
          const host = yield* ExecutionHost.ExecutionHost
          const receipt = yield* runtime.send({
            to: fixture.address,
            sessionId: `session:linear-storage:${scale}`,
            idempotencyKey: `linear-storage:${scale}`,
            prompt: "Generate the scripted linear storage proof.",
          })
          yield* host.execute(yield* store.claimExecution({ runId: receipt.runId, ownerId: `linear-storage:${scale}` }))
          expect(yield* runtime.inspect(receipt.runId)).toMatchObject({ status: "succeeded" })
          const session = yield* store.sessionStore(`session:linear-storage:${scale}`)
          if (Option.isNone(session)) return yield* Effect.die("expected durable Session")
          expect(yield* session.value.path()).not.toHaveLength(0)
        }),
      ),
    )
    const counts = fixture.counts()
    expect(counts.modelCalls).toBe(scale)
    expect(counts.toolCalls).toBe(scale - 1)
    return measure(filename, scale, fixture.markers, counts)
  })

it.live("keeps durable JSON payload growth linear across scripted model turns", () =>
  Effect.gen(function* () {
    const baselineFile = tempDbPath("linear-storage-baseline")
    yield* initialize(baselineFile)
    const baseline = measure(baselineFile, 0, [], { modelCalls: 0, toolCalls: 0 })
    const measurements = yield* Effect.all(scalePoints.map(executeScale), { concurrency: 1 })
    const byScale = new Map(measurements.map((measurement) => [measurement.scale, measurement]))
    const ten = byScale.get(10)!
    const twenty = byScale.get(20)!
    for (const key of ["operationBytes", "eventBytes", "checkpointBytes", "sessionBytes", "totalJsonBytes"] as const) {
      const increment10 = ten[key] - baseline[key]
      const increment20 = twenty[key] - baseline[key]
      expect(increment10, key).toBeGreaterThan(0)
      expect(increment20, key).toBeLessThanOrEqual(increment10 * 2.2)
    }
    const activePageIncrement10 = ten.activePages - baseline.activePages
    const activePageIncrement20 = twenty.activePages - baseline.activePages
    expect(activePageIncrement10).toBeGreaterThanOrEqual(0)
    expect(activePageIncrement20).toBeLessThanOrEqual(activePageIncrement10 * 2.6 + 2)
  }),
)
