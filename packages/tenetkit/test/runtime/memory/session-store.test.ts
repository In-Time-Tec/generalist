import { Database } from "bun:sqlite"
import { expect, it } from "@effect/vitest"
import { Effect, Layer, Option, Schema, Stream } from "effect"
import { LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
import { Agent, ExecutableManifest, ToolExecutor } from "../../../src/index.js"
import { Address, ChildRuns, RunExecutor, ExecutableResolver, Runtime, RunStore } from "../../../src/runtime/index.js"
import { registrationsFor } from "../execution/fixtures.js"
import { pinnedTestAgent } from "../run/identity.js"
import { provideScoped } from "../execution/scoped-provide.js"
import { tempDbPath } from "../sql/scenario.js"

import { Runtime as SqliteRuntime } from "../../../src/runtime/sqlite-bun.js"
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

const childCount = 4
const callsPerChild = 10
const parentMarker = (call: number) => `linear-parent-model-${call.toString().padStart(2, "0")}`
const childMarker = (childIndex: number, call: number) =>
  `linear-child-${childIndex}-model-${call.toString().padStart(2, "0")}`

interface JsonRow {
  readonly rowKey: string
  readonly payload: string | null
}

interface ParsedRow {
  readonly rowKey: string
  readonly payload: unknown
  readonly bytes: number
}

interface DurableJsonMeasurement {
  readonly operationBytes: number
  readonly eventBytes: number
  readonly checkpointBytes: number
  readonly sessionBytes: number
  readonly allJsonBytes: number
}

interface FourChildAdmission {
  readonly parentRunId: string
  readonly fanOutId: string
  readonly childRunIds: ReadonlyArray<string>
}

const probeParameters = Schema.Struct({ marker: Schema.String })
const taggedPayload = Schema.Struct({ _tag: Schema.String })
const sessionReference = Schema.Struct({
  modelCallId: Schema.String,
  sessionId: Schema.String,
  sessionParentId: Schema.NullOr(Schema.String),
  sessionEntryId: Schema.String,
  digest: Schema.String,
})

const parseRows = (rows: ReadonlyArray<JsonRow>): ReadonlyArray<ParsedRow> =>
  rows.flatMap((row) =>
    row.payload === null
      ? []
      : [
          {
            rowKey: row.rowKey,
            payload: Schema.decodeSync(Schema.fromJsonString(Schema.Unknown))(row.payload),
            bytes: Buffer.byteLength(row.payload),
          },
        ],
  )

const totalBytes = (rows: ReadonlyArray<ParsedRow>): number => rows.reduce((total, row) => total + row.bytes, 0)

const readRows = (database: Database, sql: string): ReadonlyArray<ParsedRow> =>
  parseRows(database.query<JsonRow, []>(sql).all())

const makeFourChildFixture = (filename: string) => {
  const parent = Agent.make({ name: "linear-four-child-parent" })
  const child = Agent.make({
    name: "linear-four-child-worker",
    toolkit: Toolkit.make(probe),
  })
  const parentPinned = pinnedTestAgent(parent, "linear-four-child-v1", [{ selection: "worker" }])
  const childPinned = pinnedTestAgent(child, "linear-four-child-v1")
  const entries = [parentPinned, childPinned].map((entry) => ({ _tag: "Agent" as const, ...entry }))
  const profiles = [{ selection: "worker", agent: childPinned.pin }]
  const parentExecutable = ExecutableManifest.make({ root: parentPinned.pin, profiles, entries })
  const parentRef: ExecutableManifest.PinnedExecutable & ExecutableManifest.ExecutableRef = {
    ...parentExecutable,
    ...parentExecutable.ref,
  }
  const childExecutable = ExecutableManifest.make({
    root: parentPinned.pin,
    active: childPinned.pin,
    profiles,
    entries,
  })
  const childRef: ExecutableManifest.PinnedExecutable & ExecutableManifest.ExecutableRef = {
    ...childExecutable,
    ...childExecutable.ref,
  }
  const address = Address.make("agent:linear-four-child")
  const parentCalls: Array<string> = []
  const childCalls = Array.from({ length: childCount }, () => 0)
  const childToolCalls = Array.from({ length: childCount }, () => 0)
  const expectedMarkers = [
    parentMarker(0),
    ...Array.from({ length: childCount }, (_childValue, childIndex) =>
      Array.from({ length: callsPerChild }, (_callValue, call) => childMarker(childIndex, call)),
    ).flat(),
    parentMarker(1),
  ]
  const parentModel = Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
      streamText: (options) => {
        const call = parentCalls.length
        parentCalls.push(JSON.stringify(options.prompt.content))
        if (call > 1) return Stream.die(new Error(`unexpected parent model call ${call}`))
        return Stream.fromIterable<Response.StreamPartEncoded>(
          call === 0
            ? [
                Response.makePart("tool-call", {
                  id: "linear-four-child-group",
                  name: ChildRuns.runGroupToolName,
                  params: {
                    concurrency: childCount,
                    members: Array.from({ length: childCount }, (_, childIndex) => ({
                      key: `worker-${childIndex}`,
                      selection: "worker",
                      label: childIndex === 0 ? parentMarker(0) : `Worker ${childIndex}`,
                      prompt: `linear-child-${childIndex}-request`,
                    })),
                  },
                  providerExecuted: false,
                }),
                finish,
              ]
            : [
                Response.makePart("text-start", { id: "linear-four-child-answer" }),
                Response.makePart("text-delta", { id: "linear-four-child-answer", delta: parentMarker(1) }),
                Response.makePart("text-end", { id: "linear-four-child-answer" }),
                finish,
              ],
        )
      },
    }),
  )
  const childModel = Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
      streamText: (options) => {
        const serialized = JSON.stringify(options.prompt.content)
        const childIndex = Array.from({ length: childCount }, (_, index) => index).find((index) =>
          serialized.includes(`linear-child-${index}-request`),
        )
        if (childIndex === undefined) return Stream.die(new Error("child model prompt has no child identity"))
        const call = childCalls[childIndex]!
        childCalls[childIndex] = call + 1
        if (call >= callsPerChild) {
          return Stream.die(new Error(`unexpected child ${childIndex} model call ${call}`))
        }
        for (let prior = 0; prior < call; prior += 1) {
          const priorMarker = childMarker(childIndex, prior)
          if (!serialized.includes(priorMarker) || !serialized.includes(`observed:${priorMarker}`)) {
            return Stream.die(new Error(`child ${childIndex} model call ${call} is missing ${priorMarker}`))
          }
        }
        const marker = childMarker(childIndex, call)
        return Stream.fromIterable<Response.StreamPartEncoded>(
          call + 1 < callsPerChild
            ? [
                Response.makePart("tool-call", {
                  id: `linear-child-${childIndex}-call-${call.toString().padStart(2, "0")}`,
                  name: "linear_storage_probe",
                  params: { marker },
                  providerExecuted: false,
                }),
                finish,
              ]
            : [
                Response.makePart("text-start", { id: `linear-child-${childIndex}-answer` }),
                Response.makePart("text-delta", { id: `linear-child-${childIndex}-answer`, delta: marker }),
                Response.makePart("text-end", { id: `linear-child-${childIndex}-answer` }),
                finish,
              ],
        )
      },
    }),
  )
  const executor = ToolExecutor.layerTest({
    execute: (request) =>
      Effect.sync(() => {
        const marker = Schema.decodeUnknownOption(probeParameters)(request.call.params).pipe(Option.getOrThrow).marker
        const match = /^linear-child-(\d)-model-\d{2}$/.exec(marker)
        if (match === null) throw new Error(`unexpected probe marker ${marker}`)
        childToolCalls[Number(match[1])]! += 1
        return { _tag: "Success" as const, result: `observed:${marker}`, encodedResult: `observed:${marker}` }
      }),
  })
  const handlers = Toolkit.make(probe).toLayer({
    linear_storage_probe: () => Effect.die("ToolExecutor test layer owns execution"),
  })
  const resolverLayer = ExecutableResolver.layerStatic([
    { executable: parentRef, agent: Agent.close(parent, parentModel) },
    { executable: childRef, agent: Agent.close(child, Layer.mergeAll(childModel, executor, handlers)) },
  ]).pipe(Layer.orDie)
  return {
    address,
    expectedMarkers,
    runtimeLayer: () =>
      SqliteRuntime.layerSqlite({
        filename,
        addresses: [{ address, executable: parentRef, registrations: registrationsFor(parentRef) }],
        scheduler: { pollInterval: "1 day" },
      }).pipe(Layer.provide(resolverLayer)),
    counts: () => ({
      parentCalls: parentCalls.length,
      childCalls: [...childCalls],
      childToolCalls: [...childToolCalls],
    }),
    resumedParentPrompt: () => parentCalls[1],
  }
}

const measureDurableJson = (filename: string): DurableJsonMeasurement => {
  const database = new Database(filename)
  database.run("PRAGMA wal_checkpoint(TRUNCATE)")
  const operations = readRows(
    database,
    `SELECT run_id || ':' || operation_id || ':input' AS rowKey, input_json AS payload FROM tenetkit_run_operations
     UNION ALL SELECT run_id || ':' || operation_id || ':result', result_json FROM tenetkit_run_operations
     UNION ALL SELECT run_id || ':' || operation_id || ':error', error_json FROM tenetkit_run_operations
     UNION ALL SELECT run_id || ':' || operation_id || ':resolution', resolution_json FROM tenetkit_run_operations`,
  )
  const events = readRows(
    database,
    "SELECT run_id || ':event:' || sequence AS rowKey, event_json AS payload FROM tenetkit_run_events",
  )
  const checkpoints = readRows(
    database,
    `SELECT run_id || ':message' AS rowKey, message_json AS payload FROM tenetkit_runs
     UNION ALL SELECT run_id || ':checkpoint', driver_checkpoint_json FROM tenetkit_runs
     UNION ALL SELECT run_id || ':suspension', suspension_json FROM tenetkit_runs
     UNION ALL SELECT run_id || ':continuation', continuation_json FROM tenetkit_runs
     UNION ALL SELECT run_id || ':pending', pending_outcome_json FROM tenetkit_runs`,
  )
  const sessions = readRows(
    database,
    "SELECT session_id || ':session:' || entry_id AS rowKey, payload_json AS payload FROM tenetkit_session_entries",
  )
  const tables = database
    .query<
      { readonly name: string },
      []
    >("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'tenetkit_%'")
    .all()
  let allJsonBytes = 0
  for (const { name } of tables) {
    const columns = database.query<{ readonly name: string }, []>(`PRAGMA table_info(${name})`).all()
    for (const column of columns) {
      if (!column.name.endsWith("_json")) continue
      const rows = database
        .query<{ readonly payload: string | null }, []>(`SELECT ${column.name} AS payload FROM ${name}`)
        .all()
      for (const row of rows) {
        if (row.payload === null) continue
        Schema.decodeSync(Schema.fromJsonString(Schema.Unknown))(row.payload)
        allJsonBytes += Buffer.byteLength(row.payload)
      }
    }
  }
  database.close()
  return {
    operationBytes: totalBytes(operations),
    eventBytes: totalBytes(events),
    checkpointBytes: totalBytes(checkpoints),
    sessionBytes: totalBytes(sessions),
    allJsonBytes,
  }
}

const inspectFourChildReferences = (filename: string, expectedMarkers: ReadonlyArray<string>) => {
  const database = new Database(filename)
  const operations = readRows(
    database,
    "SELECT run_id || ':' || operation_id AS rowKey, result_json AS payload FROM tenetkit_run_operations WHERE result_json IS NOT NULL",
  ).filter((row) => Option.isSome(Schema.decodeUnknownOption(sessionReference)(row.payload)))
  const committed = readRows(
    database,
    "SELECT run_id || ':event:' || sequence AS rowKey, event_json AS payload FROM tenetkit_run_events",
  ).filter((row) =>
    Schema.decodeUnknownOption(taggedPayload)(row.payload).pipe(
      Option.exists((value) => value._tag === "ModelResponseCommitted"),
    ),
  )
  const sessions = readRows(
    database,
    "SELECT session_id || ':' || entry_id AS rowKey, payload_json AS payload FROM tenetkit_session_entries",
  )
  const sessionCount = database
    .query<{ readonly count: number }, []>("SELECT COUNT(DISTINCT session_id) AS count FROM tenetkit_session_entries")
    .get()!.count
  database.close()
  expect(operations).toHaveLength(42)
  expect(committed).toHaveLength(42)
  expect(sessions).toHaveLength(85)
  expect(sessionCount).toBe(5)
  const messages = sessions.filter((row) =>
    Schema.decodeUnknownOption(taggedPayload)(row.payload).pipe(Option.exists((value) => value._tag === "Message")),
  )
  const compactions = sessions.filter((row) =>
    Schema.decodeUnknownOption(taggedPayload)(row.payload).pipe(Option.exists((value) => value._tag === "Compaction")),
  )
  expect(messages).toHaveLength(42)
  expect(compactions).toHaveLength(1)
  const messageJson = messages.map((row) => JSON.stringify(row.payload)).join("\n")
  const requests = messageJson.match(/linear-child-\d-request/g)?.toSorted() ?? []
  const observations = messageJson.match(/observed:linear-child-\d-model-\d{2}/g)?.toSorted() ?? []
  expect(requests).toEqual(Array.from({ length: childCount }, (_, childIndex) => `linear-child-${childIndex}-request`))
  expect(observations).toEqual(
    Array.from({ length: childCount }, (_child, childIndex) =>
      Array.from({ length: callsPerChild - 1 }, (_call, call) => `observed:${childMarker(childIndex, call)}`),
    )
      .flat()
      .toSorted(),
  )
  const childOperations = operations.filter((row) =>
    Schema.decodeUnknownSync(sessionReference)(row.payload).sessionId.startsWith("fanout:"),
  )
  const childCommitted = committed.filter((row) =>
    Schema.decodeUnknownSync(sessionReference)(row.payload).sessionId.startsWith("fanout:"),
  )
  expect(childOperations).toHaveLength(40)
  expect(childCommitted).toHaveLength(40)
  expect(Math.max(...childOperations.map((row) => row.bytes))).toBeLessThanOrEqual(1_100)
  expect(
    Math.max(...childOperations.map((row) => row.bytes)) - Math.min(...childOperations.map((row) => row.bytes)),
  ).toBeLessThanOrEqual(64)
  expect(Math.max(...childCommitted.map((row) => row.bytes))).toBeLessThanOrEqual(2_048)
  expect(
    Math.max(...childCommitted.map((row) => row.bytes)) - Math.min(...childCommitted.map((row) => row.bytes)),
  ).toBeLessThanOrEqual(64)
  const sessionByKey = new Map(sessions.map((row) => [row.rowKey, row.payload]))
  const eventByCall = new Map(
    committed.map((row) => {
      const payload = Schema.decodeUnknownSync(sessionReference)(row.payload)
      return [
        payload.modelCallId,
        {
          sessionId: payload.sessionId,
          sessionParentId: payload.sessionParentId,
          sessionEntryId: payload.sessionEntryId,
          digest: payload.digest,
        },
      ] as const
    }),
  )
  const referencedPayloads: Array<unknown> = []
  for (const row of operations) {
    const payload = Schema.decodeUnknownSync(sessionReference)(row.payload)
    for (const forbidden of ["content", "messages", "prompt", "response", "transcript"] as const) {
      expect(payload).not.toHaveProperty(forbidden)
    }
    const reference = {
      sessionId: payload.sessionId,
      sessionParentId: payload.sessionParentId,
      sessionEntryId: payload.sessionEntryId,
      digest: payload.digest,
    }
    expect(reference.sessionId).not.toBe("")
    expect(reference.sessionParentId).not.toBe("")
    expect(reference.sessionEntryId).not.toBe("")
    expect(reference.digest).toMatch(/^[a-f0-9]{64}$/)
    expect(eventByCall.get(payload.modelCallId)).toEqual(reference)
    expect(JSON.stringify(payload)).not.toMatch(/linear-(?:parent|child-\d)-model-\d{2}/)
    const referenced = sessionByKey.get(`${payload.sessionId}:${payload.sessionEntryId}`)
    expect(referenced, row.rowKey).toBeDefined()
    referencedPayloads.push(referenced)
  }
  for (const row of committed) {
    for (const forbidden of ["content", "messages", "prompt", "response", "transcript"] as const) {
      expect(row.payload).not.toHaveProperty(forbidden)
    }
    expect(JSON.stringify(row.payload)).not.toMatch(/linear-(?:parent|child-\d)-model-\d{2}/)
  }
  const markerPattern = /linear-(?:parent|child-\d)-model-\d{2}/g
  const preserved = referencedPayloads
    .flatMap((payload) => JSON.stringify(payload).match(markerPattern) ?? [])
    .toSorted()
  expect(preserved).toEqual([...expectedMarkers].toSorted())
  expect(
    new Set(
      operations.map((row) => {
        const payload = Schema.decodeUnknownSync(sessionReference)(row.payload)
        return `${payload.sessionId}:${payload.sessionEntryId}`
      }),
    ).size,
  ).toBe(42)
}

it.live("preserves 42 provider-free model calls across four durable children and a SQLite reopen", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("linear-storage-four-child")
    const fixture = makeFourChildFixture(filename)
    yield* Effect.scoped(provideScoped(fixture.runtimeLayer(), Effect.void))
    const baseline = measureDurableJson(filename)
    expect(baseline.allJsonBytes).toBe(0)

    const admitted = yield* Effect.scoped(
      provideScoped(
        fixture.runtimeLayer(),
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const host = yield* RunExecutor.RunExecutor
          const store = yield* RunStore.RunStore
          const parent = yield* runtime.send({
            to: fixture.address,
            sessionId: "session:linear-four-child",
            idempotencyKey: "linear-four-child",
            prompt: "Run the four-child durable storage proof.",
            treePolicy: { maxDepth: 1, maxSubagents: 4 },
          })
          yield* host.execute(yield* store.claimExecution({ runId: parent.runId, ownerId: "parent:before-reopen" }))
          expect(yield* runtime.inspect(parent.runId)).toMatchObject({ status: "waiting" })
          const history = yield* runtime.history({ runId: parent.runId, limit: 200 })
          const fanOut = history.find((event) => event._tag === "FanOutAdmitted")
          if (fanOut?._tag !== "FanOutAdmitted") return yield* Effect.die("four-child group was not admitted")
          const group = yield* runtime.inspectFanOut(fanOut.fanOutId)
          expect(group.members).toHaveLength(4)
          expect(group.members.map((member) => member.ordinal)).toEqual([0, 1, 2, 3])
          expect(group.members.map((member) => member.readiness)).toEqual(["ready", "ready", "ready", "ready"])
          const childRunIds = group.members.map((member) => member.childRunId)
          yield* Effect.forEach(
            childRunIds.slice(0, 2),
            (runId, index) =>
              store
                .claimExecution({ runId, ownerId: `child:${index}:before-reopen` })
                .pipe(Effect.flatMap((claim) => host.execute(claim))),
            { concurrency: "unbounded", discard: true },
          )
          expect((yield* runtime.inspect(parent.runId)).status).toBe("waiting")
          expect(
            yield* Effect.forEach(childRunIds, (runId) => runtime.inspect(runId).pipe(Effect.map((run) => run.status))),
          ).toEqual(["succeeded", "succeeded", "queued", "queued"])
          return { parentRunId: parent.runId, fanOutId: fanOut.fanOutId, childRunIds } satisfies FourChildAdmission
        }),
      ),
    )

    expect(fixture.counts()).toEqual({
      parentCalls: 1,
      childCalls: [10, 10, 0, 0],
      childToolCalls: [9, 9, 0, 0],
    })
    const halfway = measureDurableJson(filename)

    yield* Effect.scoped(
      provideScoped(
        fixture.runtimeLayer(),
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const host = yield* RunExecutor.RunExecutor
          const store = yield* RunStore.RunStore
          expect(
            yield* Effect.forEach(admitted.childRunIds, (runId) =>
              runtime.inspect(runId).pipe(Effect.map((run) => run.status)),
            ),
          ).toEqual(["succeeded", "succeeded", "queued", "queued"])
          yield* Effect.forEach(
            admitted.childRunIds.slice(2),
            (runId, index) =>
              store
                .claimExecution({ runId, ownerId: `child:${index + 2}:after-reopen` })
                .pipe(Effect.flatMap((claim) => host.execute(claim))),
            { concurrency: "unbounded", discard: true },
          )
          const resumedParent = yield* runtime.inspect(admitted.parentRunId)
          if (resumedParent.status === "failed") {
            const failedHistory = yield* runtime.history({ runId: admitted.parentRunId, limit: 300 })
            const failure = failedHistory.findLast((event) => event._tag === "RunFailed")
            return yield* Effect.die(
              new Error(failure?._tag === "RunFailed" ? failure.error.message : "parent failed before resume"),
            )
          }
          expect(resumedParent.status).toBe("running")
          yield* host.execute(
            yield* store.claimExecution({ runId: admitted.parentRunId, ownerId: "parent:after-reopen" }),
          )
          expect(yield* runtime.inspect(admitted.parentRunId)).toMatchObject({ status: "succeeded" })
          const group = yield* runtime.inspectFanOut(admitted.fanOutId)
          expect(group.status).toBe("succeeded")
          expect(group.members.map((member) => member.status)).toEqual([
            "succeeded",
            "succeeded",
            "succeeded",
            "succeeded",
          ])
          const history = yield* runtime.history({ runId: admitted.parentRunId, limit: 300 })
          expect(history.filter((event) => event._tag === "ChildLinked")).toHaveLength(4)
          expect(history.filter((event) => event._tag === "ChildSettled")).toHaveLength(4)
          expect(history.filter((event) => event._tag === "RunWaiting")).toHaveLength(1)
          expect(history.filter((event) => event._tag === "RunResumed")).toHaveLength(1)
          expect(history.filter((event) => event._tag === "FanOutJoined")).toHaveLength(1)
          const snapshot = yield* store.snapshot(admitted.parentRunId)
          expect(snapshot).toMatchObject({
            outcome: {
              _tag: "Succeeded",
              result: {
                text: "linear-parent-model-01",
                turns: 2,
                session: { sessionId: "session:linear-four-child" },
              },
            },
          })
          const succeeded = Schema.decodeUnknownOption(
            Schema.Struct({ outcome: Schema.TaggedStruct("Succeeded", { result: Schema.Unknown }) }),
          )(snapshot)
          expect(Option.isSome(succeeded)).toBe(true)
        }),
      ),
    )

    expect(fixture.counts()).toEqual({
      parentCalls: 2,
      childCalls: [10, 10, 10, 10],
      childToolCalls: [9, 9, 9, 9],
    })
    const resumedPrompt = fixture.resumedParentPrompt()
    expect(resumedPrompt).toBeDefined()
    const authoredOrder = Array.from({ length: 4 }, (_, childIndex) =>
      resumedPrompt!.indexOf(`linear-child-${childIndex}-model-09`),
    )
    expect(authoredOrder.every((index) => index >= 0)).toBe(true)
    expect(authoredOrder).toEqual([...authoredOrder].toSorted((left, right) => left - right))

    inspectFourChildReferences(filename, fixture.expectedMarkers)
    const completed = measureDurableJson(filename)
    for (const key of ["operationBytes", "eventBytes", "checkpointBytes", "sessionBytes", "allJsonBytes"] as const) {
      expect(halfway[key], key).toBeGreaterThan(0)
      expect(completed[key], key).toBeLessThanOrEqual(halfway[key] * 2.2)
    }
  }),
)
