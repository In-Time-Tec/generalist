import { Chat } from "../src/index"
import { Wire } from "@batonfx/transport"
import { Response } from "effect/unstable/ai"
import { Command, expectOutMessage, message, model, story } from "foldkit/story"
import type { StorySimulation } from "foldkit/story"
import { describe, expect, test } from "vitest"

const sessionId = "foldkit-story-session"

const eventFrame = (seq: number, event: Wire.EventType): Wire.LooseServerFrameType => ({ _tag: "Event", seq, event })

const receivedFrame = (frame: Wire.LooseServerFrameType) => Chat.ReceivedAgent({ incoming: frame })

const withModel = <Model>(initialModel: Model) =>
  Object.assign(
    <M, Action, Output = undefined>(simulation: StorySimulation<M, Action, Output>) =>
      ({ ...simulation, model: initialModel }) as unknown as StorySimulation<M, Action, Output>,
    { _phantomModel: undefined },
  )

const toolCall = Response.makePart("tool-call", {
  id: "lookup-1",
  name: "lookup",
  params: { query: "baton foldkit" },
  providerExecuted: false,
})

const toolResult = Response.makePart("tool-result", {
  id: "lookup-1",
  name: "lookup",
  result: { answer: "transport binding" },
  encodedResult: { answer: "transport binding" },
  isFailure: false,
  providerExecuted: false,
  preliminary: false,
})

const frames: ReadonlyArray<Wire.LooseServerFrameType> = [
  eventFrame(0, { _tag: "TurnStarted", turn: 0 }),
  eventFrame(1, { _tag: "ModelPart", turn: 0, part: toolCall }),
  eventFrame(2, { _tag: "ToolExecutionStarted", turn: 0, call: toolCall }),
  eventFrame(3, { _tag: "ToolProgress", turn: 0, toolCallId: "lookup-1", message: "looking up" }),
  eventFrame(4, { _tag: "ToolExecutionCompleted", turn: 0, call: toolCall, result: toolResult }),
  eventFrame(5, { _tag: "TurnCompleted", turn: 0 }),
  eventFrame(6, { _tag: "TurnStarted", turn: 1 }),
  eventFrame(7, {
    _tag: "ModelPart",
    turn: 1,
    part: Response.makePart("reasoning-delta", { id: "reasoning-1", delta: "Check the transport stream." }),
  }),
  eventFrame(8, {
    _tag: "ModelPart",
    turn: 1,
    part: Response.makePart("text-delta", { id: "answer-1", delta: "Final answer" }),
  }),
  eventFrame(9, { _tag: "TurnCompleted", turn: 1 }),
  eventFrame(10, { _tag: "Completed", turns: 2, text: "Final answer" }),
]

describe("Chat Story", () => {
  test("scripted agent frames drive tool call, execution, and completion state", () => {
    story(
      Chat.update,
      withModel(Chat.initialModel(null)),
      message(Chat.OpenedSession({ sessionId })),
      model((currentModel) => {
        expect(currentModel.sessionId).toBe(sessionId)
        expect(currentModel.connection).toBe("connecting")
      }),
      message(Chat.ChangedDraft({ text: "Render this run" })),
      message(Chat.SubmittedMessage()),
      Command.expectExact(Chat.SendUserMessage({ sessionId, text: "Render this run" })),
      Command.resolve(Chat.SendUserMessage({ sessionId, text: "Render this run" }), Chat.SentUserMessage()),
      message(receivedFrame(frames[0]!)),
      message(receivedFrame(frames[1]!)),
      model((currentModel) => {
        const tool = currentModel.entries[1]
        if (tool?._tag !== "ToolEntry") throw new Error("expected tool call entry")
        expect(Chat.toolStatusOf(tool)).toBe("input-streaming")
      }),
      message(receivedFrame(frames[2]!)),
      model((currentModel) => {
        const tool = currentModel.entries[1]
        if (tool?._tag !== "ToolEntry") throw new Error("expected executing tool entry")
        expect(Chat.toolStatusOf(tool)).toBe("input-available")
      }),
      ...frames.slice(3).map((frame) => message(receivedFrame(frame))),
      expectOutMessage(Chat.RunCompleted({ text: "Final answer" })),
      model((currentModel) => {
        expect(currentModel.run).toEqual(Chat.Idle())
        expect(currentModel.streaming).toBeNull()
        expect(Chat.conversationItems(currentModel).map((item) => item._tag)).toEqual([
          "UserConversationItem",
          "ToolConversationItem",
          "AssistantConversationItem",
        ])

        const tool = currentModel.entries[1]
        if (tool?._tag !== "ToolEntry") throw new Error("expected completed tool entry")
        expect(tool.progress).toEqual(["looking up"])
        expect(Chat.toolStatusOf(tool)).toBe("output-available")

        const assistant = currentModel.entries[2]
        expect(assistant).toEqual(
          Chat.AssistantEntry({ text: "Final answer", reasoning: "Check the transport stream." }),
        )
      }),
    )
  })
})
