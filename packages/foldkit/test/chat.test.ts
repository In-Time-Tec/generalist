import { describe, expect, it } from "@effect/vitest"
import { Effect, Option, Schema, Stream } from "effect"
import * as Ai from "effect/unstable/ai"
import { Wire } from "@batonfx/transport"
import { Chat, Connection } from "../src/index"

const eventFrame = (seq: number, event: Wire.EventType): Wire.LooseServerFrameType => ({ _tag: "Event", seq, event })

const updateWith = (model: Chat.Model, incoming: Connection.Incoming) =>
  Chat.update(model, Chat.ReceivedAgent({ incoming }))

describe("Chat", () => {
  it("folds a full run into display entries and a completion out-message", () => {
    let model = Chat.initialModel("s-chat")
    let out: Option.Option<Chat.OutMessage> = Option.none()

    ;[model, , out] = updateWith(model, eventFrame(0, { _tag: "TurnStarted", turn: 0 }))
    expect(model.run).toEqual({ _tag: "Running", turn: 0 })
    expect(model.streaming).toEqual({ turn: 0, text: "", reasoning: "" })
    expect(Option.isNone(out)).toBe(true)
    ;[model] = updateWith(
      model,
      eventFrame(1, {
        _tag: "ModelPart",
        turn: 0,
        part: Ai.Response.makePart("text-delta", { id: "text-1", delta: "Hello " }),
      }),
    )
    ;[model] = updateWith(
      model,
      eventFrame(2, {
        _tag: "ModelPart",
        turn: 0,
        part: Ai.Response.makePart("text-delta", { id: "text-1", delta: "world" }),
      }),
    )

    const call = Ai.Response.makePart("tool-call", {
      id: "call-1",
      name: "lookup",
      params: { q: "baton" },
      providerExecuted: false,
    })
    ;[model] = updateWith(model, eventFrame(3, { _tag: "ModelPart", turn: 0, part: call }))
    expect(model.entries).toEqual([
      {
        _tag: "ToolEntry",
        callId: "call-1",
        name: "lookup",
        params: { q: "baton" },
        outcome: { _tag: "Pending" },
        progress: [],
      },
    ])

    const result = Ai.Response.makePart("tool-result", {
      id: "call-1",
      name: "lookup",
      result: { ok: true },
      encodedResult: { ok: true },
      isFailure: false,
      providerExecuted: false,
      preliminary: false,
    })
    ;[model] = updateWith(model, eventFrame(4, { _tag: "ToolExecutionCompleted", turn: 0, call, result }))
    expect(model.entries[0]).toMatchObject({
      _tag: "ToolEntry",
      outcome: { _tag: "Completed", isFailure: false, result: { ok: true } },
    })
    ;[model] = updateWith(model, eventFrame(5, { _tag: "TurnCompleted", turn: 0 }))
    expect(model.streaming).toBeNull()
    expect(model.entries[1]).toEqual({ _tag: "AssistantEntry", text: "Hello world", reasoning: null })
    ;[model, , out] = updateWith(model, eventFrame(6, { _tag: "Completed", turns: 1, text: "Done" }))
    expect(model.run).toEqual({ _tag: "Idle" })
    expect(Option.getOrUndefined(out)).toEqual({ _tag: "RunCompleted", text: "Done" })
  })

  it("drops replayed frames whose seq is not newer than lastSeq", () => {
    const model = { ...Chat.initialModel("s-chat"), lastSeq: 5, entries: [Chat.UserEntry({ text: "already" })] }
    const [next, commands, out] = updateWith(model, eventFrame(5, { _tag: "TurnStarted", turn: 1 }))

    expect(next).toEqual(model)
    expect(commands).toEqual([])
    expect(Option.isNone(out)).toBe(true)
  })

  it("surfaces approval suspension and emits approval commands", () => {
    let model = Chat.initialModel("s-chat")
    let out: Option.Option<Chat.OutMessage> = Option.none()
    ;[model, , out] = updateWith(
      model,
      Schema.decodeUnknownSync(Wire.LooseServerFrame)({
        _tag: "Suspended",
        seq: 0,
        suspension: {
          _tag: "@batonfx/core/AgentSuspended",
          token: "approval-token",
          reason: "approval",
          tool_call_id: "call-approval",
          tool_name: "lookup",
          tool_params: { q: "baton" },
        },
      }),
    )

    expect(model.run).toEqual({
      _tag: "AwaitingApproval",
      token: "approval-token",
      toolName: "lookup",
      params: { q: "baton" },
    })
    expect(Option.getOrUndefined(out)).toEqual({ _tag: "ApprovalRequired" })

    const [, commands] = Chat.update(model, Chat.ClickedApprove())
    expect(commands).toHaveLength(1)
    expect(commands[0]?.name).toBe("ResolveApproval")
    expect(commands[0]?.args).toEqual({
      sessionId: "s-chat",
      token: "approval-token",
      approved: true,
      reason: null,
    })
  })

  it.effect("converts command send failures into FailedAgentCommand messages", () =>
    Effect.gen(function* () {
      let model = Chat.initialModel("s-chat")
      ;[model] = Chat.update(model, Chat.ChangedDraft({ text: "hello" }))
      const [next, commands] = Chat.update(model, Chat.SubmittedMessage())

      expect(next.draft).toBe("")
      expect(next.entries).toEqual([Chat.UserEntry({ text: "hello" })])
      expect(commands).toHaveLength(1)
      const message = yield* commands[0]!.effect

      expect(message).toEqual({ _tag: "FailedAgentCommand", reason: "offline" })
    }).pipe(
      Effect.provide(
        Connection.testLayer({
          frames: () => Stream.empty,
          send: () => Effect.fail(new Connection.SendFailed({ reason: "offline" })),
        }),
      ),
    ),
  )
})
