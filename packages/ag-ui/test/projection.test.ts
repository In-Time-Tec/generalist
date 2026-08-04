import { describe, expect, it } from "@effect/vitest"
import { EventSchemas } from "@ag-ui/core"
import { Effect, Schema } from "effect"
import { Prompt, Response } from "effect/unstable/ai"
import { RunEvent } from "@batonfx/runtime"
import { makeState, project, stateSnapshot } from "../src/projection.js"

const base = {
  specVersion: "1",
  eventId: "run-1:1",
  runId: "run-1",
  sequence: 1,
  agent: { id: "assistant", version: "1", digest: "digest" },
  rootRunId: "run-1",
  occurredAt: "2026-08-03T00:00:00.000Z",
}

const modelPart = (part: Response.AnyPart) => ({
  ...base,
  _tag: "ModelPart",
  turn: 0,
  modelCallId: "model-1",
  modelAttemptId: "attempt-1",
  attempt: 0,
  part,
})

describe("AG-UI event projection", () => {
  it.effect("maps text, reasoning, streamed tool arguments, results, steps, and success", () =>
    Effect.gen(function* () {
      const state = makeState()
      const inputs = [
        { ...base, _tag: "TurnStarted", turn: 0 },
        modelPart(Response.makePart("text-start", { id: "message-1" })),
        modelPart(Response.makePart("text-delta", { id: "message-1", delta: "hello" })),
        modelPart(Response.makePart("text-end", { id: "message-1" })),
        modelPart(Response.makePart("reasoning-start", { id: "reasoning-1" })),
        modelPart(Response.makePart("reasoning-delta", { id: "reasoning-1", delta: "think" })),
        modelPart(Response.makePart("reasoning-end", { id: "reasoning-1" })),
        modelPart(Response.makePart("tool-params-start", { id: "tool-1", name: "search", providerExecuted: false })),
        modelPart(Response.makePart("tool-params-delta", { id: "tool-1", delta: '{"q":' })),
        modelPart(Response.makePart("tool-params-delta", { id: "tool-1", delta: '"baton"}' })),
        modelPart(Response.makePart("tool-params-end", { id: "tool-1" })),
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
        { ...base, _tag: "TurnCompleted", turn: 0, transcript: Prompt.empty },
        { ...base, _tag: "RunCompleted", result: { text: "hello", turns: 1, transcript: Prompt.empty } },
      ]
      expect(inputs.findIndex((input) => !Schema.is(RunEvent.RunEvent)(input))).toBe(-1)
      const batches = yield* Effect.forEach(inputs, (input) => project(state, input, "thread-1"))
      const events = batches.flat()
      expect(events.map((event) => event.type)).toEqual([
        "STEP_STARTED",
        "TEXT_MESSAGE_START",
        "TEXT_MESSAGE_CONTENT",
        "TEXT_MESSAGE_END",
        "REASONING_START",
        "REASONING_MESSAGE_START",
        "REASONING_MESSAGE_CONTENT",
        "REASONING_MESSAGE_END",
        "REASONING_END",
        "TOOL_CALL_START",
        "TOOL_CALL_ARGS",
        "TOOL_CALL_ARGS",
        "TOOL_CALL_END",
        "TOOL_CALL_RESULT",
        "STEP_FINISHED",
        "RUN_FINISHED",
      ])
      expect(events.every((event) => EventSchemas.safeParse(event).success)).toBe(true)
    }),
  )

  it.effect("maps waits, failure, cancellation, progress, and structured output", () =>
    Effect.gen(function* () {
      const inputs = [
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
          wait: { waitId: "tool-1", reason: "approval", status: "open", openedAt: "2026-08-03T00:00:00.000Z" },
        },
        { ...base, _tag: "RunFailed", error: { message: "failed" } },
        { ...base, _tag: "RunCancelled", reason: "stopped" },
      ]
      const batches = yield* Effect.forEach(inputs, (input) => project(makeState(), input, "thread-1"))
      expect(batches.flat().map((event) => event.type)).toEqual([
        "CUSTOM",
        "CUSTOM",
        "RUN_FINISHED",
        "RUN_ERROR",
        "RUN_ERROR",
      ])
      expect(batches[2]?.[0]).toMatchObject({ outcome: { type: "interrupt", interrupts: [{ id: "tool-1" }] } })
    }),
  )

  it.effect("rejects malformed Runtime events and validates snapshots", () =>
    Effect.gen(function* () {
      const failure = yield* project(makeState(), { _tag: "RunCompleted" }, "thread-1").pipe(Effect.flip)
      expect(failure._tag).toBe("@batonfx/ag-ui/EventInvalid")
      const snapshot = yield* stateSnapshot({ run: { runId: "run-1" }, cursor: 5 })
      expect(snapshot).toEqual({ type: "STATE_SNAPSHOT", snapshot: { run: { runId: "run-1" }, cursor: 5 } })
    }),
  )
})
