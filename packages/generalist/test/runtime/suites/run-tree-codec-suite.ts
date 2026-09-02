import { expect, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import { Agent } from "../../../src/index.js"
import { RunEvent, RunTree } from "../../../src/runtime/index.js"
import { assistantRef } from "../execution/fixtures.js"

const rootRunId = "run:tree-codec"
const cursor = (position: number) =>
  RunTree.TreeCursor.make(
    `generalist-tree:${encodeURIComponent(JSON.stringify({ version: 1, projection: "run-tree", rootRunId, position }))}`,
  )

const base = (sequence: number, runId = rootRunId): RunEvent.RunEventBase => ({
  specVersion: "1",
  eventId: `${runId}:${sequence}`,
  runId,
  sequence,
  executableRef: assistantRef.ref,
  depth: 0,
  rootRunId,
  occurredAt: "2026-08-05T00:00:00.000Z",
})

const representativeEvents: ReadonlyArray<RunTree.TreeEvent> = [
  {
    rootRunId,
    runId: rootRunId,
    modelCallId: "model-call:1",
    modelAttemptId: "model-attempt:1",
    event: {
      ...base(0),
      _tag: "ModelResponseCommitted",
      turn: 0,
      operationKey: "operation:model:1",
      modelCallId: "model-call:1",
      modelAttemptId: "model-attempt:1",
      attempt: 0,
      sessionId: "session:tree-codec",
      sessionParentId: "entry:input",
      sessionEntryId: "entry:model:1",
      budgetCharge: 0,
      finishReason: "stop",
      digest: "digest:model:1",
    },
    cursor: cursor(0),
  },
  {
    rootRunId,
    runId: rootRunId,
    toolCallId: "tool:1",
    event: {
      ...base(1),
      _tag: "ToolProgress",
      turn: 0,
      toolCallId: "tool:1",
      message: "working",
      data: { completed: 1 },
    },
    cursor: cursor(1),
  },
  {
    rootRunId,
    runId: rootRunId,
    invocationId: "invoke:child",
    event: {
      ...base(2),
      _tag: "ChildLinked",
      childRunId: "run:child",
      invocationId: "invoke:child",
      selection: "researcher",
      prompt: Prompt.make("research the request"),
      childDepth: 1,
      readiness: "ready",
      inherit: Agent.defaultInheritance,
    },
    cursor: cursor(2),
  },
  {
    rootRunId,
    runId: rootRunId,
    event: {
      ...base(3),
      _tag: "RunWaiting",
      wait: {
        waitId: "wait:1",
        reason: { _tag: "ToolWait" },
        status: "open",
        openedAt: "2026-08-05T00:00:01.000Z",
      },
    },
    cursor: cursor(3),
  },
  {
    rootRunId,
    runId: rootRunId,
    event: {
      ...base(4),
      _tag: "RunCompleted",
      result: { _tag: "Program", value: { answer: 42 } },
    },
    cursor: cursor(4),
  },
]

it.effect("round-trips representative tree event families and pages", () =>
  Effect.gen(function* () {
    for (const event of representativeEvents) {
      expect(yield* RunTree.decodeTreeEvent(yield* RunTree.encodeTreeEvent(event))).toEqual(event)
    }

    const page: RunTree.ReplayPage = {
      events: representativeEvents,
      cursor: cursor(4),
      hasMore: false,
    }
    expect(yield* RunTree.decodeReplayPage(yield* RunTree.encodeReplayPage(page))).toEqual(page)
  }),
)

it.effect("rejects malformed cursor and nested event payloads", () =>
  Effect.gen(function* () {
    const encoded = yield* RunTree.encodeTreeEvent(representativeEvents[0]!)
    const malformedCursor = { ...encoded, cursor: { position: 0 } }
    const malformedEvent = {
      ...encoded,
      event: { ...encoded.event, _tag: "UnknownEvent" },
    }

    expect(Schema.decodeUnknownExit(RunTree.TreeEvent)(malformedCursor)._tag).toBe("Failure")
    expect(Schema.decodeUnknownExit(RunTree.TreeEvent)(malformedEvent)._tag).toBe("Failure")
  }),
)
