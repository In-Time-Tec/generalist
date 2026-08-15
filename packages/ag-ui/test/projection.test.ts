import { describe, expect, it } from "@effect/vitest"
import { EventSchemas } from "@ag-ui/core"
import { Effect, Schema } from "effect"
import { Response } from "effect/unstable/ai"
import { Errors, ExecutableManifest, RunEvent } from "@batonfx/runtime"
import { project, projectModelResponse, stateSnapshot } from "../src/projection.js"

const executableRef = ExecutableManifest.makeTest("assistant", "1").ref

const base = {
  specVersion: "1" as const,
  eventId: "run-1:1",
  runId: "run-1",
  sequence: 1,
  executableRef,
  rootRunId: "run-1",
  depth: 0,
  occurredAt: "2026-08-03T00:00:00.000Z",
}

const committed = (content: RunEvent.CompletedModelResponse["content"]) => ({
  event: {
    ...base,
    _tag: "ModelResponseCommitted" as const,
    turn: 0,
    operationKey: "run-1:model:0",
    modelCallId: "model-1",
    modelAttemptId: "attempt-1",
    attempt: 0,
    sessionId: "thread-1",
    sessionParentId: "entry:input",
    sessionEntryId: "entry:committed",
    finishReason: "tool-calls" as const,
    digest: "committed-digest",
  },
  content,
})

const interrupted = (content: RunEvent.CompletedModelResponse["content"]) => ({
  event: {
    ...base,
    eventId: "run-1:2",
    sequence: 2,
    _tag: "ModelResponseInterrupted" as const,
    turn: 0,
    operationKey: "run-1:model:0",
    modelCallId: "model-1",
    modelAttemptId: "attempt-1",
    attempt: 0,
    sessionId: "thread-1",
    sessionParentId: "entry:input",
    sessionEntryId: "entry:interrupted",
    reason: "failure" as const,
    digest: "interrupted-digest",
  },
  content,
})

describe("AG-UI event projection", () => {
  it.effect("projects every committed semantic text, reasoning, and tool unit with deterministic lifecycles", () =>
    Effect.gen(function* () {
      const response = committed([
        Response.makePart("text", { text: "hello" }),
        Response.makePart("reasoning", { text: "inspect the repository" }),
        Response.makePart("tool-call", {
          id: "tool-1",
          name: "search",
          params: { q: "baton" },
          providerExecuted: false,
        }),
        Response.makePart("text", { text: "after the tool" }),
      ])
      expect(Schema.is(RunEvent.RunEvent)(response.event)).toBe(true)

      const events = yield* projectModelResponse(response.event, response.content)

      expect(events).toEqual([
        { type: "TEXT_MESSAGE_START", messageId: "run-1:1:text:0", role: "assistant" },
        { type: "TEXT_MESSAGE_CONTENT", messageId: "run-1:1:text:0", delta: "hello" },
        { type: "TEXT_MESSAGE_END", messageId: "run-1:1:text:0" },
        { type: "REASONING_START", messageId: "run-1:1:reasoning:1" },
        { type: "REASONING_MESSAGE_START", messageId: "run-1:1:reasoning:1", role: "reasoning" },
        {
          type: "REASONING_MESSAGE_CONTENT",
          messageId: "run-1:1:reasoning:1",
          delta: "inspect the repository",
        },
        { type: "REASONING_MESSAGE_END", messageId: "run-1:1:reasoning:1" },
        { type: "REASONING_END", messageId: "run-1:1:reasoning:1" },
        { type: "TOOL_CALL_START", toolCallId: "tool-1", toolCallName: "search" },
        { type: "TOOL_CALL_ARGS", toolCallId: "tool-1", delta: '{"q":"baton"}' },
        { type: "TOOL_CALL_END", toolCallId: "tool-1" },
        { type: "TEXT_MESSAGE_START", messageId: "run-1:1:text:3", role: "assistant" },
        { type: "TEXT_MESSAGE_CONTENT", messageId: "run-1:1:text:3", delta: "after the tool" },
        { type: "TEXT_MESSAGE_END", messageId: "run-1:1:text:3" },
      ])
      expect(events.every((event) => EventSchemas.safeParse(event).success)).toBe(true)
    }),
  )

  it.effect("projects an interrupted normalized partial before terminal failure without fragment state", () =>
    Effect.gen(function* () {
      const partial = interrupted([Response.makePart("text", { text: "retained partial" })])
      const failed = {
        ...base,
        eventId: "run-1:3",
        sequence: 3,
        _tag: "RunFailed" as const,
        error: Errors.AgentExecutionFailure.make({ message: "model terminated" }),
      }
      expect(Schema.is(RunEvent.RunEvent)(partial.event)).toBe(true)
      expect(Schema.is(RunEvent.RunEvent)(failed)).toBe(true)

      const events = [
        ...(yield* projectModelResponse(partial.event, partial.content)),
        ...(yield* project(failed, "thread-1")),
      ]

      expect(events).toEqual([
        { type: "TEXT_MESSAGE_START", messageId: "run-1:2:text:0", role: "assistant" },
        { type: "TEXT_MESSAGE_CONTENT", messageId: "run-1:2:text:0", delta: "retained partial" },
        { type: "TEXT_MESSAGE_END", messageId: "run-1:2:text:0" },
        { type: "RUN_ERROR", message: "model terminated", code: "RUN_FAILED" },
      ])
      expect(events.filter((event) => event.type === "TEXT_MESSAGE_CONTENT").map((event) => event.delta)).toEqual([
        "retained partial",
      ])
    }),
  )

  it.effect("maps tool results, steps, terminal success, waits, progress, and structured output", () =>
    Effect.gen(function* () {
      const inputs = [
        { ...base, _tag: "TurnStarted", turn: 0 },
        {
          ...base,
          _tag: "ToolExecutionCompleted",
          turn: 0,
          call: {
            type: "tool-call",
            id: "tool-1",
            name: "search",
            params: { q: "baton" },
            providerExecuted: false,
            metadata: {},
          },
          result: {
            type: "tool-result",
            id: "tool-1",
            name: "search",
            isFailure: false,
            result: ["found"],
            encodedResult: ["found"],
            providerExecuted: false,
            preliminary: false,
            metadata: {},
          },
        },
        { ...base, _tag: "TurnCompleted", turn: 0 },
        {
          ...base,
          _tag: "RunCompleted",
          result: { text: "hello", turns: 1, session: { sessionId: "thread-1", leafId: null } },
        },
        { ...base, _tag: "ToolProgress", turn: 0, toolCallId: "tool-1", message: "working", data: { percent: 50 } },
        {
          ...base,
          _tag: "StructuredOutput",
          turn: 0,
          modelCallId: "model-1",
          modelAttemptId: "attempt-1",
          attempt: 0,
          value: { answer: 42 },
          content: [],
        },
        {
          ...base,
          _tag: "RunWaiting",
          wait: {
            waitId: "tool-1",
            reason: {
              _tag: "Approval",
              request: { approvalId: "tool-1", operation: "tool-1", capability: "test", input: {} },
            },
            status: "open",
            openedAt: "2026-08-03T00:00:00.000Z",
          },
        },
      ]
      expect(inputs.findIndex((input) => !Schema.is(RunEvent.RunEvent)(input))).toBe(-1)

      const batches = yield* Effect.forEach(inputs, (input) => project(input, "thread-1"))
      const events = batches.flat()

      expect(events.map((event) => event.type)).toEqual([
        "STEP_STARTED",
        "TOOL_CALL_RESULT",
        "STEP_FINISHED",
        "RUN_FINISHED",
        "CUSTOM",
        "CUSTOM",
        "RUN_FINISHED",
      ])
      expect(events[1]).toEqual({
        type: "TOOL_CALL_RESULT",
        messageId: "run-1:1:result",
        toolCallId: "tool-1",
        content: '["found"]',
      })
      expect(events[3]).toMatchObject({
        type: "RUN_FINISHED",
        threadId: "thread-1",
        runId: "run-1",
        outcome: { type: "success" },
      })
      expect(events[6]).toMatchObject({ outcome: { type: "interrupt", interrupts: [{ id: "tool-1" }] } })
    }),
  )

  it.effect("rejects removed transport fragments, malformed Runtime events, and validates snapshots", () =>
    Effect.gen(function* () {
      const removedFragment = {
        ...base,
        _tag: "ModelPart",
        turn: 0,
        modelCallId: "model-1",
        modelAttemptId: "attempt-1",
        attempt: 0,
        part: { type: "text-delta", id: "message-1", delta: "legacy" },
      }
      expect(Schema.is(RunEvent.RunEvent)(removedFragment)).toBe(false)
      const fragmentFailure = yield* project(removedFragment, "thread-1").pipe(Effect.flip)
      expect(fragmentFailure).toMatchObject({
        _tag: "@batonfx/ag-ui/EventInvalid",
        source: "runtime",
      })

      const failure = yield* project({ _tag: "RunCompleted" }, "thread-1").pipe(Effect.flip)
      expect(failure._tag).toBe("@batonfx/ag-ui/EventInvalid")
      const snapshot = yield* stateSnapshot({ run: { runId: "run-1" }, cursor: 5 })
      expect(snapshot).toEqual({ type: "STATE_SNAPSHOT", snapshot: { run: { runId: "run-1" }, cursor: 5 } })
    }),
  )
})
