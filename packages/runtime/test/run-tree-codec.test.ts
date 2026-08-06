import { expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { Prompt, Response } from "effect/unstable/ai"
import { RunEvent, RunTree } from "../src/index.js"
import { makeCursor } from "../src/tree-cursor.js"
import { assistantRef } from "./helpers.js"

const rootRunId = "run:tree-codec"

const base = (sequence: number, runId = rootRunId): RunEvent.RunEventBase => ({
  specVersion: "1",
  eventId: `${runId}:${sequence}`,
  runId,
  sequence,
  executableRef: assistantRef.ref,
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
      _tag: "ModelPart",
      turn: 0,
      modelCallId: "model-call:1",
      modelAttemptId: "model-attempt:1",
      attempt: 0,
      part: Response.makePart("text-delta", { id: "text:1", delta: "hello" }),
    },
    cursor: makeCursor(rootRunId, 0),
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
    cursor: makeCursor(rootRunId, 1),
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
    },
    cursor: makeCursor(rootRunId, 2),
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
    cursor: makeCursor(rootRunId, 3),
  },
  {
    rootRunId,
    runId: rootRunId,
    event: {
      ...base(4),
      _tag: "RunCompleted",
      result: { _tag: "Program", value: { answer: 42 } },
    },
    cursor: makeCursor(rootRunId, 4),
  },
]

it.effect("round-trips representative tree event families and pages", () =>
  Effect.gen(function* () {
    for (const event of representativeEvents) {
      expect(yield* RunTree.decodeTreeEvent(yield* RunTree.encodeTreeEvent(event))).toEqual(event)
    }

    const page: RunTree.TreePage = {
      events: representativeEvents,
      cursor: makeCursor(rootRunId, 4),
      hasMore: false,
    }
    expect(yield* RunTree.decodeTreePage(yield* RunTree.encodeTreePage(page))).toEqual(page)
  }),
)

it.effect("rejects malformed cursor and nested event payloads", () =>
  Effect.gen(function* () {
    const encoded = yield* RunTree.encodeTreeEvent(representativeEvents[0]!)
    const malformedCursor = { ...encoded, cursor: { position: 0 } } as unknown as typeof encoded
    const malformedEvent = {
      ...encoded,
      event: { ...encoded.event, _tag: "UnknownEvent" },
    } as unknown as typeof encoded

    expect((yield* Effect.exit(RunTree.decodeTreeEvent(malformedCursor)))._tag).toBe("Failure")
    expect((yield* Effect.exit(RunTree.decodeTreeEvent(malformedEvent)))._tag).toBe("Failure")
  }),
)
