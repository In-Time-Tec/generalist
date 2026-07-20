import { describe, expect, it } from "@effect/vitest"
import { Cause, Effect, Exit, Layer, Option, Schema, Stream } from "effect"
import { Prompt, Response } from "effect/unstable/ai"
import { Errors, Wire } from "@batonfx/transport"
import { Chat, Connection } from "../src/index"

const eventFrame = (seq: number, event: Wire.EventType): Wire.LooseServerFrameType => ({ _tag: "Event", seq, event })

const updateWith = (model: Chat.Model, incoming: Connection.Incoming) =>
  Chat.update(model, Chat.ReceivedAgent({ incoming }))

const provideTestLayer =
  <R, E, RIn>(testLayer: Layer.Layer<R, E, RIn>) =>
  <A, E2, R2>(effect: Effect.Effect<A, E2, R | R2>) =>
    Layer.build(testLayer).pipe(Effect.flatMap((context) => Effect.provide(effect, context)))

describe("Chat", () => {
  it("folds a full run into display entries and a completion output", () => {
    let model = Chat.initialModel("s-chat")
    let output: Option.Option<Chat.Output> = Option.none()

    ;[model, , output] = updateWith(model, eventFrame(0, { _tag: "TurnStarted", turn: 0 }))
    expect(model.run).toEqual({ _tag: "Running", turn: 0 })
    expect(model.streaming).toEqual({ turn: 0, text: "", reasoning: "" })
    expect(Option.isNone(output)).toBe(true)
    ;[model] = updateWith(
      model,
      eventFrame(1, {
        _tag: "ModelPart",
        turn: 0,
        part: Response.makePart("text-delta", { id: "text-1", delta: "Hello " }),
      }),
    )
    ;[model] = updateWith(
      model,
      eventFrame(2, {
        _tag: "ModelPart",
        turn: 0,
        part: Response.makePart("text-delta", { id: "text-1", delta: "world" }),
      }),
    )

    const call = Response.makePart("tool-call", {
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
        phase: "called",
        outcome: { _tag: "Pending" },
        progress: [],
      },
    ])
    const pendingTool = model.entries[0]
    if (pendingTool?._tag !== "ToolEntry") throw new Error("expected pending tool entry")
    expect(Chat.toolStatusOf(pendingTool)).toBe("input-streaming")

    const result = Response.makePart("tool-result", {
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
      phase: "executing",
      outcome: { _tag: "Completed", isFailure: false, result: { ok: true } },
    })
    const completedTool = model.entries[0]
    if (completedTool?._tag !== "ToolEntry") throw new Error("expected completed tool entry")
    expect(Chat.toolStatusOf(completedTool)).toBe("output-available")
    ;[model] = updateWith(model, eventFrame(5, { _tag: "TurnCompleted", turn: 0 }))
    expect(model.streaming).toBeNull()
    expect(model.entries[1]).toEqual({ _tag: "AssistantEntry", text: "Hello world", reasoning: null })
    ;[model, , output] = updateWith(model, eventFrame(6, { _tag: "Completed", turns: 1, text: "Done" }))
    expect(model.run).toEqual({ _tag: "Idle" })
    expect(Option.getOrUndefined(output)).toEqual({ _tag: "RunCompleted", text: "Done" })
  })

  it("drops replayed frames whose seq is not newer than lastSeq", () => {
    const model = { ...Chat.initialModel("s-chat"), lastSeq: 5, entries: [Chat.UserEntry({ text: "already" })] }
    const [next, commands, output] = updateWith(model, eventFrame(5, { _tag: "TurnStarted", turn: 1 }))

    expect(next).toEqual(model)
    expect(commands).toEqual([])
    expect(Option.isNone(output)).toBe(true)
  })

  it("applies authoritative snapshots before ordinary sequence deduplication", () => {
    const initial = Chat.initialModel("s-chat")
    const [fromInitial] = updateWith(initial, {
      _tag: "Snapshot",
      seq: -1,
      transcript: Prompt.make("persisted history"),
    })
    expect(fromInitial.entries).toEqual([Chat.UserEntry({ text: "persisted history" })])

    const future = { ...fromInitial, lastSeq: 5 }
    const [recovered] = updateWith(future, {
      _tag: "Snapshot",
      seq: 2,
      transcript: Prompt.make("authoritative history"),
    })
    expect(recovered.lastSeq).toBe(2)
    expect(recovered.entries).toEqual([Chat.UserEntry({ text: "authoritative history" })])
  })

  it("surfaces framework failures from terminal frames and session status", () => {
    const failure = {
      _tag: "@batonfx/core/FrameworkFailure" as const,
      stage: "placement" as const,
      tool: "lookup",
      message: "worker unavailable",
    }
    const failedFrame = Schema.decodeUnknownSync(Wire.LooseServerFrame)({
      _tag: "Failed",
      seq: 0,
      error: failure,
    })
    const [failedModel, , failedOut] = updateWith(Chat.initialModel("s-chat"), failedFrame)

    expect(failedModel.run).toEqual({ _tag: "Failed", message: "lookup placement: worker unavailable" })
    expect(Option.getOrUndefined(failedOut)).toEqual({
      _tag: "RunFailed",
      message: "lookup placement: worker unavailable",
    })

    const statusFrame = Schema.decodeUnknownSync(Wire.LooseServerFrame)({
      _tag: "SessionStatus",
      seq: 1,
      status: { _tag: "Failed", error: failure },
    })
    const [statusModel, , statusOut] = updateWith(Chat.initialModel("s-chat"), statusFrame)

    expect(statusModel.run).toEqual({ _tag: "Failed", message: "lookup placement: worker unavailable" })
    expect(Option.getOrUndefined(statusOut)).toEqual({
      _tag: "RunFailed",
      message: "lookup placement: worker unavailable",
    })
  })

  it("surfaces approval suspension and emits approval commands", () => {
    let model = Chat.initialModel("s-chat")
    let output: Option.Option<Chat.Output> = Option.none()
    ;[model, , output] = updateWith(
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
          tool_call_batch: [
            {
              type: "tool-call",
              id: "call-approval",
              name: "lookup",
              params: { q: "baton" },
              providerExecuted: false,
              metadata: {},
            },
          ],
        },
      }),
    )

    expect(model.run).toEqual({
      _tag: "AwaitingApproval",
      token: "approval-token",
      toolName: "lookup",
      params: { q: "baton" },
    })
    expect(Option.getOrUndefined(output)).toEqual({ _tag: "ApprovalRequired" })

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

  it("submitting a message emits the send command", () => {
    let model = Chat.initialModel("s-chat")
    ;[model] = Chat.update(model, Chat.ChangedDraft({ text: "hello" }))
    const [next, commands] = Chat.update(model, Chat.SubmittedMessage())

    expect(next.draft).toBe("")
    expect(next.entries).toEqual([Chat.UserEntry({ text: "hello" })])
    expect(commands).toHaveLength(1)
    expect(commands[0]).toMatchObject({ name: "SendUserMessage", args: { sessionId: "s-chat", text: "hello" } })
  })

  it.effect("preserves a typed command failure as a structured action", () => {
    const error = Connection.SendFailed.make({ reason: "command rejected" })
    const command: Chat.ChatCommand = Chat.CancelRun({ sessionId: "s-chat" })

    return Effect.gen(function* () {
      const action = yield* command.effect

      expect(action).toEqual(Chat.FailedAgentCommand({ operation: "cancel", error, reason: "command rejected" }))
      expect(Schema.is(Chat.Action)(action)).toBe(true)
    }).pipe(
      provideTestLayer(
        Connection.testLayer({
          frames: () => Stream.empty,
          send: () => Effect.fail(error),
        }),
      ),
    )
  })

  it.effect("retains transport command error tags and fields", () => {
    const error = Errors.TransportError.make({ message: "socket closed" })
    return Effect.gen(function* () {
      const action = yield* Chat.SendUserMessage({ sessionId: "s-chat", text: "hello" }).effect

      expect(action).toEqual(Chat.FailedAgentCommand({ operation: "send", error, reason: "socket closed" }))
    }).pipe(
      provideTestLayer(
        Connection.testLayer({
          frames: () => Stream.empty,
          send: () => Effect.fail(error),
        }),
      ),
    )
  })

  it.effect("labels approval command failures", () => {
    const error = Connection.SendFailed.make({ reason: "approval rejected" })
    return Effect.gen(function* () {
      const action = yield* Chat.ResolveApproval({
        sessionId: "s-chat",
        token: "approval-token",
        approved: false,
        reason: null,
      }).effect

      expect(action).toEqual(
        Chat.FailedAgentCommand({ operation: "resolveApproval", error, reason: "approval rejected" }),
      )
    }).pipe(
      provideTestLayer(
        Connection.testLayer({
          frames: () => Stream.empty,
          send: () => Effect.fail(error),
        }),
      ),
    )
  })

  it.effect("keeps command defects and interruption out of UI actions", () => {
    const commandExit = (send: Connection.Interface["send"]) =>
      Chat.CancelRun({ sessionId: "s-chat" }).effect.pipe(
        provideTestLayer(
          Connection.testLayer({
            frames: () => Stream.empty,
            send,
          }),
        ),
        Effect.exit,
      )

    return Effect.gen(function* () {
      const defectExit = yield* commandExit(() => Effect.die("command defect"))
      const interruptExit = yield* commandExit(() => Effect.interrupt)

      expect(Exit.isFailure(defectExit) && Cause.hasDies(defectExit.cause)).toBe(true)
      expect(Exit.isFailure(interruptExit) && Cause.hasInterrupts(interruptExit.cause)).toBe(true)
    })
  })

  it.effect("preserves unexpected reasons in a composite command cause", () => {
    const error = Connection.SendFailed.make({ reason: "command rejected" })
    const cause = Cause.combine(Cause.fail(error), Cause.die("command defect"))
    return Effect.gen(function* () {
      const exit = yield* Effect.exit(Chat.CancelRun({ sessionId: "s-chat" }).effect)

      expect(Exit.isFailure(exit) && Cause.hasDies(exit.cause)).toBe(true)
      expect(Exit.isFailure(exit) && Cause.hasFails(exit.cause)).toBe(false)
    }).pipe(
      provideTestLayer(
        Connection.testLayer({
          frames: () => Stream.empty,
          send: () => Effect.failCause(cause),
        }),
      ),
    )
  })
})
