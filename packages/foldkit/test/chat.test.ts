import { describe, expect, it } from "vitest"
import { Option, Schema } from "effect"
import { Prompt, Response } from "effect/unstable/ai"
import { Errors, ExecutableManifest, RunEvent } from "@batonfx/runtime"
import { Chat, Connection } from "../src/index.js"

const agent = ExecutableManifest.makeTest("assistant", "1").ref
const runEvent = (sequence: number, fields: Record<string, unknown>): RunEvent.RunEvent =>
  ({
    specVersion: "1",
    eventId: `run-1:${sequence}`,
    runId: "run-1",
    sequence,
    executableRef: agent,
    rootRunId: "run-1",
    depth: 0,
    occurredAt: "2026-08-03T00:00:00.000Z",
    ...fields,
  }) as RunEvent.RunEvent

const modelResponse = (
  sequence: number,
  tag: "ModelResponseCommitted" | "ModelResponseInterrupted",
  content: ReadonlyArray<Response.AnyPart>,
): RunEvent.RunEvent =>
  runEvent(sequence, {
    _tag: tag,
    turn: 0,
    operationKey: "run-1:model:0",
    modelCallId: "model-call-0",
    modelAttemptId: "attempt-0",
    attempt: 0,
    response: { content },
    ...(tag === "ModelResponseCommitted" ? {} : { reason: "failure" }),
    digest: `${tag}-digest`,
  })

const updateWith = (model: Chat.Model, incoming: Connection.Incoming) =>
  Chat.update(model, Chat.ReceivedAgent({ incoming }))

const searchCall = Response.makePart("tool-call", {
  id: "tool-1",
  name: "search",
  params: { query: "Baton" },
  providerExecuted: true,
})

const searchResult = Response.makePart("tool-result", {
  id: "tool-1",
  name: "search",
  result: ["found"],
  encodedResult: ["found"],
  isFailure: false,
  providerExecuted: true,
  preliminary: false,
})

describe("Chat RunEvent projection", () => {
  it("projects a committed normalized response and retains Runtime-owned tool execution status", () => {
    let model = Chat.initialModel("run-1")
    let output: Option.Option<Chat.Output> = Option.none()
    const committed = modelResponse(1, "ModelResponseCommitted", [
      Response.makePart("text", { text: "Hello " }),
      Response.makePart("reasoning", { text: "inspect " }),
      searchCall,
      Response.makePart("text", { text: "world" }),
      Response.makePart("reasoning", { text: "carefully" }),
    ])
    expect(Schema.is(RunEvent.RunEvent)(committed)).toBe(true)
    ;[model] = updateWith(model, runEvent(0, { _tag: "TurnStarted", turn: 0 }))
    ;[model] = updateWith(model, committed)

    expect(model.entries).toEqual([
      {
        _tag: "ToolEntry",
        callId: "tool-1",
        name: "search",
        params: { query: "Baton" },
        phase: "called",
        outcome: { _tag: "Pending" },
        progress: [],
      },
      { _tag: "AssistantEntry", text: "Hello world", reasoning: "inspect carefully" },
    ])
    const pendingTool = model.entries[0]
    expect(pendingTool?._tag === "ToolEntry" && Chat.toolStatusOf(pendingTool)).toBe("input-available")
    ;[model] = updateWith(
      model,
      runEvent(2, { _tag: "ToolExecutionStarted", turn: 0, call: { ...searchCall, providerExecuted: false } }),
    )
    expect(model.entries[0]).toMatchObject({ _tag: "ToolEntry", phase: "executing", outcome: { _tag: "Pending" } })
    ;[model] = updateWith(
      model,
      runEvent(3, {
        _tag: "ToolExecutionCompleted",
        turn: 0,
        call: { ...searchCall, providerExecuted: false },
        result: { ...searchResult, providerExecuted: false },
      }),
    )
    expect(model.entries[0]).toMatchObject({
      _tag: "ToolEntry",
      phase: "executing",
      outcome: { _tag: "Completed", isFailure: false, result: ["found"] },
    })
    ;[model] = updateWith(model, runEvent(4, { _tag: "TurnCompleted", turn: 0, transcript: Prompt.empty }))
    ;[model, , output] = updateWith(
      model,
      runEvent(5, {
        _tag: "RunCompleted",
        result: { text: "Hello world", turns: 1, transcript: Prompt.empty },
      }),
    )

    expect(model.lastSeq).toBe(5)
    expect(model.entries.filter((entry) => entry._tag === "AssistantEntry")).toEqual([
      { _tag: "AssistantEntry", text: "Hello world", reasoning: "inspect carefully" },
    ])
    expect(model.run).toEqual({ _tag: "Idle" })
    expect(Option.getOrUndefined(output)).toEqual({ _tag: "RunCompleted", text: "Hello world" })
  })

  it("projects and retains an interrupted normalized partial before terminal failure", () => {
    let model = Chat.initialModel("run-1")
    const interrupted = modelResponse(1, "ModelResponseInterrupted", [
      Response.makePart("reasoning", { text: "partial thought" }),
      Response.makePart("text", { text: "retained partial" }),
      { ...searchCall, providerExecuted: false },
    ])
    expect(Schema.is(RunEvent.RunEvent)(interrupted)).toBe(true)
    ;[model] = updateWith(model, runEvent(0, { _tag: "TurnStarted", turn: 0 }))
    ;[model] = updateWith(model, interrupted)
    ;[model] = updateWith(
      model,
      runEvent(2, {
        _tag: "RunFailed",
        error: Errors.AgentExecutionFailure.make({ message: "model terminated" }),
      }),
    )

    expect(model.entries).toEqual([
      {
        _tag: "ToolEntry",
        callId: "tool-1",
        name: "search",
        params: { query: "Baton" },
        phase: "called",
        outcome: { _tag: "Pending" },
        progress: [],
      },
      { _tag: "AssistantEntry", text: "retained partial", reasoning: "partial thought" },
    ])
    expect(model.run).toEqual({ _tag: "Failed", message: "model terminated" })
  })

  it("does not project removed ModelPart transport fragments", () => {
    const fragment = runEvent(0, {
      _tag: "ModelPart",
      turn: 0,
      modelCallId: "model-call-0",
      modelAttemptId: "attempt-0",
      attempt: 0,
      part: Response.makePart("text-delta", { id: "text-1", delta: "legacy" }),
    })
    const model = Chat.initialModel("run-1")

    expect(Schema.is(RunEvent.RunEvent)(fragment)).toBe(false)
    expect(updateWith(model, fragment)[0].entries).toEqual([])
  })

  it("projects waits and failures without synthetic status or ended frames", () => {
    let model = Chat.initialModel("run-1")
    let output: Option.Option<Chat.Output>
    ;[model, , output] = updateWith(
      model,
      runEvent(4, {
        _tag: "RunWaiting",
        wait: {
          waitId: "wait-1",
          reason: {
            _tag: "Approval",
            request: { approvalId: "wait-1", operation: "tool-1", capability: "test", input: {} },
          },
          status: "open",
          openedAt: "2026-08-03T00:00:00.000Z",
        },
      }),
    )
    expect(model.run._tag).toBe("AwaitingApproval")
    expect(Option.getOrUndefined(output)?._tag).toBe("ApprovalRequired")
    ;[model, , output] = updateWith(model, runEvent(5, { _tag: "RunFailed", error: { message: "failed" } }))
    expect(model.run).toEqual({ _tag: "Failed", message: "failed" })
    expect(Option.getOrUndefined(output)).toEqual({ _tag: "RunFailed", message: "failed" })

    const unchanged = updateWith(model, runEvent(5, { _tag: "RunCancelled" }))[0]
    expect(unchanged).toEqual(model)
  })
})
