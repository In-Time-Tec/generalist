import { describe, expect, it } from "@effect/vitest"
import { EventSchemas } from "@ag-ui/core"
import { Effect, Schema } from "effect"
import { Response } from "effect/unstable/ai"
import { Errors, ExecutableManifest, RunEvent, TreePolicy } from "generalist/runtime"
import type { RuntimeInspection } from "../../../src/runtime/engine.js"
import {
  project,
  projectModelResponse,
  projectStateSnapshot,
  stateSnapshot,
} from "../../../src/unstable/ag-ui/projection.js"

const executable = ExecutableManifest.makeTest("assistant", "1")
const executableRef = executable.ref
const privateMarker = "AGUI_PRIVATE_RECOVERY_MARKER"
const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))
const privateManifest = {
  ...executable.manifest,
  entries: executable.manifest.entries.map((entry) =>
    entry._tag === "Agent" ? { ...entry, manifest: { ...entry.manifest, instructions: privateMarker } } : entry,
  ),
}

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
    originRunId: "run-1",
    originOperationKey: "run-1:model:0",
    operationKey: "run-1:model:0",
    modelCallId: "model-1",
    modelAttemptId: "attempt-1",
    attempt: 0,
    sessionId: "thread-1",
    sessionParentId: "entry:input",
    sessionEntryId: "entry:committed",
    budgetCharge: 0,
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
    originRunId: "run-1",
    originOperationKey: "run-1:model:0",
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

const inspection = (overrides: Partial<RuntimeInspection> = {}): RuntimeInspection => ({
  retainedSession: {
    id: "thread-1",
    rootSessionId: "thread-1",
    parentSessionId: null,
    parentRunId: null,
    initialRunId: "run-1",
    depth: 0,
  },
  runId: "run-1",
  status: "running",
  executableRef,
  executableManifest: privateManifest,
  depth: 0,
  treePolicy: TreePolicy.defaultTreePolicy,
  waits: [],
  lastSequence: 5,
  durability: "durable",
  branches: [],
  revision: "public-revision",
  waitOpenedAtSequence: {},
  turn: 1,
  usage: { inputTokens: 4, outputTokens: 3 },
  usageFacts: [],
  activeTools: [],
  elapsed: 0,
  budget: { tokens: 12 },
  gates: [],
  children: [],
  ...overrides,
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
          params: { q: "generalist" },
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
        { type: "TOOL_CALL_ARGS", toolCallId: "tool-1", delta: '{"q":"generalist"}' },
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
      expect(events.flatMap((event) => ("delta" in event ? [event.delta] : []))).toEqual(["retained partial"])
    }),
  )

  it.effect("maps tool results, steps, terminal success, waits, and progress", () =>
    Effect.gen(function* () {
      const inputs = [
        { ...base, _tag: "TurnStarted", turn: 0 },
        {
          ...base,
          _tag: "ToolExecutionCompleted",
          turn: 0,
          call: Response.makePart("tool-call", {
            id: "tool-1",
            name: "search",
            params: { q: "generalist" },
            providerExecuted: false,
          }),
          result: Object.assign(
            Response.makePart("tool-result", {
              id: "tool-1",
              name: "search",
              isFailure: false,
              result: ["found"],
              encodedResult: ["found"],
              providerExecuted: false,
              preliminary: false,
            }),
            { taint: [] },
          ),
        },
        { ...base, _tag: "TurnCompleted", turn: 0 },
        {
          ...base,
          _tag: "RunCompleted",
          result: {
            text: "hello",
            output: "hello",
            turns: 1,
            session: { sessionId: "thread-1", leafId: null },
          },
        },
        { ...base, _tag: "ToolProgress", turn: 0, toolCallId: "tool-1", message: "working", data: { percent: 50 } },
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
      expect(events[5]).toMatchObject({ outcome: { type: "interrupt", interrupts: [{ id: "tool-1" }] } })
    }),
  )

  it.effect("allowlists event and replay payloads without runtime envelopes", () =>
    Effect.gen(function* () {
      const call = Object.assign(
        Response.makePart("tool-call", {
          id: "tool-1",
          name: "search",
          params: { visible: "query" },
          providerExecuted: false,
        }),
        { metadata: { provider: privateMarker }, attemptFence: 17 },
      )
      const result = Object.assign(
        Response.makePart("tool-result", {
          id: "tool-1",
          name: "search",
          isFailure: false,
          result: { visible: "tool result" },
          encodedResult: { visible: "tool result" },
          providerExecuted: false,
          preliminary: false,
        }),
        { metadata: { provider: privateMarker }, taint: [], privateMarker },
      )
      const inputs = [
        {
          ...base,
          _tag: "ToolProgress" as const,
          turn: 0,
          toolCallId: "tool-1",
          message: "visible progress",
          data: { privateMarker, attemptFence: 17, providerResourceRef: privateMarker },
          privateMarker,
        },
        {
          ...base,
          eventId: "run-1:2",
          sequence: 2,
          _tag: "RunWaiting" as const,
          wait: {
            waitId: "approval-1",
            reason: {
              _tag: "Approval" as const,
              request: {
                approvalId: "approval-1",
                operation: "private operation",
                capability: "private capability",
                input: { privateMarker, claim: { ownerId: privateMarker, fence: 17 } },
              },
            },
            status: "open" as const,
            openedAt: "2026-08-03T00:00:01.000Z",
          },
          claim: { ownerId: privateMarker, epoch: 3, fence: 17 },
        },
        {
          ...base,
          eventId: "run-1:3",
          sequence: 3,
          _tag: "ToolExecutionCompleted" as const,
          turn: 0,
          call,
          result,
          providerResourceRef: privateMarker,
        },
        {
          ...base,
          eventId: "run-1:4",
          sequence: 4,
          _tag: "RunCompleted" as const,
          result: {
            text: "visible answer",
            output: { visible: "output" },
            turns: 1,
            session: { sessionId: "thread-1", leafId: "entry-1" },
            privateMarker,
            attemptFence: 17,
          },
          executableManifest: privateManifest,
        },
      ]
      const events = (yield* Effect.forEach(inputs, (event) => project(event, "thread-1"))).flat()
      expect(events).toEqual([
        {
          type: "CUSTOM",
          name: "generalist.tool.progress",
          value: { toolCallId: "tool-1", message: "visible progress" },
        },
        {
          type: "RUN_FINISHED",
          threadId: "thread-1",
          runId: "run-1",
          outcome: {
            type: "interrupt",
            interrupts: [
              {
                id: "approval-1",
                reason: "Approval",
                metadata: {
                  status: "open",
                  approval: {
                    approvalId: "approval-1",
                    tool: "private capability",
                    summary: "private operation",
                  },
                },
              },
            ],
          },
        },
        {
          type: "TOOL_CALL_RESULT",
          messageId: "run-1:3:result",
          toolCallId: "tool-1",
          content: '{"visible":"tool result"}',
        },
        {
          type: "RUN_FINISHED",
          threadId: "thread-1",
          runId: "run-1",
          result: {
            text: "visible answer",
            output: { visible: "output" },
            turns: 1,
            session: { sessionId: "thread-1", leafId: "entry-1" },
          },
          outcome: { type: "success" },
        },
      ])

      const modelEvents = yield* projectModelResponse(committed([call, result]).event, [call, result])
      const bytes = encodeJson([...events, ...modelEvents])
      for (const forbidden of [
        privateMarker,
        "attemptFence",
        "privateMarker",
        "executableManifest",
        "providerResourceRef",
        "claim",
        "ownerId",
        "fence",
      ]) {
        expect(bytes).not.toContain(forbidden)
      }
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
        _tag: "generalist/ag-ui/EventInvalid",
        source: "runtime",
      })

      const failure = yield* project({ _tag: "RunCompleted" }, "thread-1").pipe(Effect.flip)
      expect(failure._tag).toBe("generalist/ag-ui/EventInvalid")
      const inspected = {
        ...inspection(),
        attemptFence: 17,
        privateMarker,
        executableManifest: privateManifest,
        claim: { ownerId: privateMarker, epoch: 3, fence: 17 },
        providerResourceRef: privateMarker,
      }
      const projected = yield* projectStateSnapshot(inspected, "run-root")
      const snapshot = yield* stateSnapshot(projected)
      expect(snapshot).toEqual({
        type: "STATE_SNAPSHOT",
        snapshot: {
          version: 1,
          cursor: "5",
          run: {
            runId: "run-1",
            sessionId: "thread-1",
            rootRunId: "run-root",
            agent: { name: "assistant", revision: "public-revision" },
            status: "running",
            durability: "durable",
            depth: 0,
            turn: 1,
            lastSequence: 5,
            budget: { tokens: 12 },
            usage: { inputTokens: 4, outputTokens: 3 },
            waits: [],
          },
        },
      })
      const bytes = encodeJson(snapshot)
      for (const forbidden of [
        privateMarker,
        "attemptFence",
        "privateMarker",
        "executableManifest",
        "claim",
        "ownerId",
        "epoch",
        "fence",
        "providerResourceRef",
      ]) {
        expect(bytes).not.toContain(forbidden)
      }
      const snapshotWithPrivateMarker = { ...projected, privateMarker }
      const unsafe = yield* stateSnapshot(snapshotWithPrivateMarker).pipe(Effect.flip)
      expect(unsafe).toMatchObject({ _tag: "generalist/ag-ui/EventInvalid", source: "runtime" })
      const snapshotWithPrivateRunField = { ...projected, run: { ...projected.run, attemptFence: 17 } }
      const unsafeRun = yield* stateSnapshot(snapshotWithPrivateRunField).pipe(Effect.flip)
      expect(unsafeRun).toMatchObject({ _tag: "generalist/ag-ui/EventInvalid", source: "runtime" })
    }),
  )
})
