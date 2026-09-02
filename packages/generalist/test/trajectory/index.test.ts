import { expect, it } from "@effect/vitest"
import { Effect, Schema, Stream } from "effect"
import { Prompt, Response } from "effect/unstable/ai"
import { Agent } from "../../src/index.js"
import type { RunSnapshot } from "../../src/runtime/run.js"
import type { RunEvent } from "../../src/runtime/run/event.js"
import * as Trajectory from "../../src/trajectory/index.js"
import { pinnedTestExecutable } from "../runtime/run/identity.js"

const runId = "run:trajectory:golden"
const sessionId = "session:trajectory:golden"
const executable = pinnedTestExecutable(Agent.make({ name: "golden-agent", budget: { totalTokens: 100 } }))
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
  compactions: [],
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
} satisfies Trajectory.JournalReader

it.effect("projects a recorded journal to stable JSON", () =>
  Effect.gen(function* () {
    const trajectory = yield* Trajectory.fromJournal(runtime, runId)
    expect(yield* Trajectory.encode(trajectory)).toMatchInlineSnapshot(`
      {
        "agent": "golden-agent",
        "budget": {
          "totalTokens": 100,
        },
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
    const trajectory = yield* Trajectory.fromJournal(runtime, runId)
    const bytes = yield* Stream.runCollect(Trajectory.export(trajectory, { format: "jsonl" }))
    const line = new TextDecoder().decode(bytes[0])
    const record = yield* Schema.decodeEffect(Schema.fromJsonString(Trajectory.JsonlRecord))(line.trim())
    expect(record.schemaVersion).toBe("1")
  }),
)
