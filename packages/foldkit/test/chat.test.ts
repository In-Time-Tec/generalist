import { describe, expect, it } from "vitest"
import { Option } from "effect"
import { Prompt, Response } from "effect/unstable/ai"
import { ExecutableManifest, RunEvent } from "@batonfx/runtime"
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
    occurredAt: "2026-08-03T00:00:00.000Z",
    ...fields,
  }) as RunEvent.RunEvent

const updateWith = (model: Chat.Model, incoming: Connection.Incoming) =>
  Chat.update(model, Chat.ReceivedAgent({ incoming }))

describe("Chat RunEvent projection", () => {
  it("folds canonical model events and the single persisted terminal event", () => {
    let model = Chat.initialModel("run-1")
    let output: Option.Option<Chat.Output> = Option.none()

    ;[model] = updateWith(model, runEvent(0, { _tag: "TurnStarted", turn: 0 }))
    ;[model] = updateWith(
      model,
      runEvent(1, {
        _tag: "ModelPart",
        turn: 0,
        modelCallId: "model-call-0",
        modelAttemptId: "attempt-0",
        attempt: 0,
        part: Response.makePart("text-delta", { id: "text-1", delta: "Hello" }),
      }),
    )
    ;[model] = updateWith(model, runEvent(2, { _tag: "TurnCompleted", turn: 0, transcript: Prompt.empty }))
    ;[model, , output] = updateWith(
      model,
      runEvent(3, {
        _tag: "RunCompleted",
        result: { text: "Hello", turns: 1, transcript: Prompt.empty },
      }),
    )

    expect(model.lastSeq).toBe(3)
    expect(model.entries).toEqual([{ _tag: "AssistantEntry", text: "Hello", reasoning: null }])
    expect(model.run).toEqual({ _tag: "Idle" })
    expect(Option.getOrUndefined(output)).toEqual({ _tag: "RunCompleted", text: "Hello" })
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
