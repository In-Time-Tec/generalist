import { expect, it } from "@effect/vitest"
import { Effect, Layer, Schema, Stream } from "effect"
import { LanguageModel, Prompt, Response } from "effect/unstable/ai"
import { Agent, Permissions } from "../../src/index.js"
import { ExecutableResolver, RunExecutor, RunStore, Runtime } from "../../src/runtime/index.js"
import type { RunSnapshot } from "../../src/runtime/run.js"
import type { RunEvent } from "../../src/runtime/run/event.js"
import { Runtime as SqliteRuntime } from "../../src/runtime/sqlite-bun.js"
import {
  JsonlRecord,
  encode,
  export as exportTrajectory,
  fromJournal,
  type JournalReader,
} from "../../src/trajectory/index.js"
import { provideScoped } from "../runtime/execution/scoped-provide.js"
import { pinnedTestExecutable } from "../runtime/run/identity.js"
import { tempDbPath } from "../runtime/sql/scenario.js"

const runId = "run:trajectory:golden"
const sessionId = "session:trajectory:golden"
const executable = pinnedTestExecutable(Agent.make({ name: "golden-agent", budget: { tokens: 100 } }))
const usage = Response.Usage.make({
  inputTokens: { total: 4 },
  outputTokens: { total: 2 },
})
const response = {
  content: [
    Response.makePart("text", { text: "high" }),
    Response.makePart("finish", { reason: "stop", usage, response: undefined }),
  ],
  usage,
  finishReason: "stop" as const,
}
const base = {
  specVersion: "1" as const,
  runId,
  executableRef: executable.ref,
  attemptId: "attempt-1",
  rootRunId: runId,
  depth: 0,
  occurredAt: "2026-01-01T00:00:00.000Z",
}
const modelEvent = {
  ...base,
  _tag: "ModelResponseCommitted" as const,
  eventId: `${runId}:1`,
  sequence: 1,
  turn: 0,
  operationKey: "model:0",
  modelCallId: "call-1",
  modelAttemptId: "model-attempt-1",
  attempt: 0,
  sessionId,
  sessionParentId: "input-1",
  sessionEntryId: `${runId}:model:0:session-response`,
  budgetCharge: 6,
  digest: "digest",
  usage,
  finishReason: "stop" as const,
}
const events = [
  modelEvent,
  {
    ...base,
    _tag: "TurnCompleted" as const,
    eventId: `${runId}:2`,
    sequence: 2,
    turn: 0,
    usage,
    finishReason: "stop" as const,
  },
] satisfies ReadonlyArray<RunEvent>
const snapshot: RunSnapshot = {
  run: {
    runId,
    status: "succeeded",
    executableRef: executable.ref,
    executableManifest: executable.manifest,
    depth: 0,
    treePolicy: { maxDepth: 8, maxSubagents: 32 },
    waits: [],
    lastSequence: 2,
    durability: "durable",
    branches: [],
  },
  cursor: 2,
  turn: 0,
  outcome: {
    _tag: "Succeeded",
    result: {
      text: "high",
      output: { severity: "high" },
      turns: 1,
      session: { sessionId, leafId: modelEvent.sessionEntryId },
    },
    eventId: `${runId}:3`,
    occurredAt: "2026-01-01T00:00:01.000Z",
  },
  usage: [
    {
      _tag: "Completed",
      runId,
      turn: 0,
      purpose: "conversation",
      modelCallId: "call-1",
      modelAttemptId: "model-attempt-1",
      attempt: 0,
      provider: "openai",
      model: "gpt-4o-mini",
      usageAt: 1,
      usage,
    },
  ],
  budget: { tokens: 94 },
  compactions: [],
  gates: [{ name: "quality", verdict: "pass", evidence: { score: 1 } }],
}
const inputEntry = {
  _tag: "Message" as const,
  id: "input-1",
  parentId: null,
  message: Prompt.make("classify").content[0]!,
}
const runtime = {
  snapshot: () => Effect.succeed(snapshot),
  history: () => Effect.succeed(events),
  sessionEntry: () => Effect.succeed(inputEntry),
  resolveModelResponse: () => Effect.succeed(response),
} satisfies JournalReader

it.effect("projects a recorded journal to stable JSON", () =>
  Effect.gen(function* () {
    const trajectory = yield* fromJournal(runtime, runId)
    expect(yield* encode(trajectory)).toMatchInlineSnapshot(`
      {
        "agent": "golden-agent",
        "budget": {
          "tokens": 100,
        },
        "gates": [
          {
            "evidence": {
              "score": 1,
            },
            "name": "quality",
            "verdict": "pass",
          },
        ],
        "input": {
          "content": [
            {
              "content": "classify",
              "options": {},
              "role": "user",
            },
          ],
        },
        "output": {
          "severity": "high",
        },
        "runId": "run:trajectory:golden",
        "stopReason": "stop",
        "turns": [
          {
            "prompt": {
              "content": [
                {
                  "content": "classify",
                  "options": {},
                  "role": "user",
                },
              ],
            },
            "response": {
              "content": [
                {
                  "metadata": {},
                  "text": "high",
                  "type": "text",
                },
                {
                  "metadata": {},
                  "reason": "stop",
                  "response": undefined,
                  "type": "finish",
                  "usage": {
                    "inputTokens": {
                      "total": 4,
                    },
                    "outputTokens": {
                      "total": 2,
                    },
                  },
                },
              ],
              "finishReason": "stop",
              "usage": {
                "inputTokens": {
                  "total": 4,
                },
                "outputTokens": {
                  "total": 2,
                },
              },
            },
            "toolCalls": [],
            "usage": [
              {
                "_tag": "Completed",
                "attempt": 0,
                "model": "gpt-4o-mini",
                "modelAttemptId": "model-attempt-1",
                "modelCallId": "call-1",
                "provider": "openai",
                "purpose": "conversation",
                "runId": "run:trajectory:golden",
                "turn": 0,
                "usage": {
                  "inputTokens": {
                    "total": 4,
                  },
                  "outputTokens": {
                    "total": 2,
                  },
                },
                "usageAt": 1,
              },
            ],
          },
        ],
      }
    `)
  }),
)

it.effect("exports one documented JSONL record as bytes", () =>
  Effect.gen(function* () {
    const trajectory = yield* fromJournal(runtime, runId)
    const bytes = yield* Stream.runCollect(exportTrajectory(trajectory, { format: "jsonl" }))
    const line = new TextDecoder().decode(bytes[0])
    const record = yield* Schema.decodeEffect(Schema.fromJsonString(JsonlRecord))(line.trim())
    expect(record.schemaVersion).toBe("1")
  }),
)

it.live("exports usage from a reopened SQLite journal as one decodable JSONL line", () => {
  const filename = tempDbPath("trajectory-jsonl-reopen")
  const recordedUsage = Response.Usage.make({
    inputTokens: { total: 23, uncached: 11, cacheRead: 7, cacheWrite: 5 },
    outputTokens: { total: 13, text: 8, reasoning: 5 },
  })
  const model = Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
      streamText: () =>
        Stream.fromIterable<Response.StreamPartEncoded>([
          Response.makePart("reasoning-delta", { id: "reasoning", delta: "brief thought" }),
          Response.makePart("text-delta", { id: "answer", delta: "journaled answer" }),
          Response.makePart("finish", { reason: "stop", usage: recordedUsage, response: undefined }),
        ]),
    }),
  )
  const recordedAgent = Agent.make({ name: "trajectory-jsonl-reopen" })
  const runtimeLayer = SqliteRuntime.layerSqlite({
    filename,
    addresses: [],
    scheduler: { pollInterval: "1 hour" },
  }).pipe(Layer.provide(ExecutableResolver.layerStatic([]).pipe(Layer.orDie)))

  return Effect.gen(function* () {
    const recordedRunId = yield* provideScoped(
      runtimeLayer,
      Effect.gen(function* () {
        const durableRuntime = yield* Runtime.Runtime
        const executor = yield* RunExecutor.RunExecutor
        const store = yield* RunStore.RunStore
        const context = yield* Layer.build(Layer.merge(model, Permissions.layerAllowAll))
        yield* durableRuntime.register(recordedAgent).pipe(Effect.provideContext(context))
        const handle = yield* durableRuntime.start(recordedAgent, "answer once", {
          sessionId: "session:trajectory-jsonl-reopen",
          idempotencyKey: "trajectory-jsonl-reopen",
        })
        yield* executor.execute(yield* store.claimExecution({ runId: handle.runId, ownerId: "trajectory-test" }))
        expect(yield* handle.await).toBe("journaled answer")
        return handle.runId
      }),
    )

    yield* provideScoped(
      runtimeLayer,
      Effect.gen(function* () {
        const reopenedRuntime = yield* Runtime.Runtime
        const trajectory = yield* fromJournal(reopenedRuntime, recordedRunId)
        const bytes = yield* Stream.runCollect(exportTrajectory(trajectory, { format: "jsonl" }))
        const line = new TextDecoder().decode(bytes[0])
        expect(line.endsWith("\n")).toBe(true)
        expect(line.split("\n")).toHaveLength(2)
        const record = yield* Schema.decodeEffect(Schema.fromJsonString(JsonlRecord))(line.trim())
        expect(record.trajectory).toEqual(trajectory)
        expect(record.trajectory.turns[0]?.usage[0]).toMatchObject({
          _tag: "Completed",
          usage: recordedUsage,
        })
      }),
    )
  })
})
