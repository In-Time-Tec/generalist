import { Chat } from "../src/index"
import { Wire } from "@batonfx/transport"
import * as Ai from "effect/unstable/ai"
import * as Story from "foldkit/story"
import { describe, expect, test } from "vitest"

const sessionId = "foldkit-story-session"

const eventFrame = (seq: number, event: Wire.EventType): Wire.LooseServerFrameType => ({ _tag: "Event", seq, event })

const receivedFrame = (frame: Wire.LooseServerFrameType) => Chat.ReceivedAgent({ incoming: frame })

const toolCall = Ai.Response.makePart("tool-call", {
  id: "lookup-1",
  name: "lookup",
  params: { query: "baton foldkit" },
  providerExecuted: false,
})

const toolResult = Ai.Response.makePart("tool-result", {
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
    part: Ai.Response.makePart("reasoning-delta", { id: "reasoning-1", delta: "Check the transport stream." }),
  }),
  eventFrame(8, {
    _tag: "ModelPart",
    turn: 1,
    part: Ai.Response.makePart("text-delta", { id: "answer-1", delta: "Final answer" }),
  }),
  eventFrame(9, { _tag: "TurnCompleted", turn: 1 }),
  eventFrame(10, { _tag: "Completed", turns: 2, text: "Final answer" }),
]

describe("Chat Story", () => {
  test("scripted agent frames drive tool call, execution, and completion state", () => {
    Story.story(
      Chat.update,
      Story.with(Chat.initialModel(null)),
      Story.message(Chat.OpenedSession({ sessionId })),
      Story.model((model) => {
        expect(model.sessionId).toBe(sessionId)
        expect(model.connection).toBe("connecting")
      }),
      Story.message(Chat.ChangedDraft({ text: "Render this run" })),
      Story.message(Chat.SubmittedMessage()),
      Story.Command.expectExact(Chat.SendUserMessage({ sessionId, text: "Render this run" })),
      Story.Command.resolve(Chat.SendUserMessage({ sessionId, text: "Render this run" }), Chat.SentUserMessage()),
      Story.message(receivedFrame(frames[0]!)),
      Story.message(receivedFrame(frames[1]!)),
      Story.model((model) => {
        const tool = model.entries[1]
        if (tool?._tag !== "ToolEntry") throw new Error("expected tool call entry")
        expect(Chat.toolStatusOf(tool)).toBe("input-streaming")
      }),
      Story.message(receivedFrame(frames[2]!)),
      Story.model((model) => {
        const tool = model.entries[1]
        if (tool?._tag !== "ToolEntry") throw new Error("expected executing tool entry")
        expect(Chat.toolStatusOf(tool)).toBe("input-available")
      }),
      ...frames.slice(3).map((frame) => Story.message(receivedFrame(frame))),
      Story.expectOutMessage(Chat.RunCompleted({ text: "Final answer" })),
      Story.model((model) => {
        expect(model.run).toEqual(Chat.Idle())
        expect(model.streaming).toBeNull()
        expect(Chat.conversationItems(model).map((item) => item._tag)).toEqual([
          "UserConversationItem",
          "ToolConversationItem",
          "AssistantConversationItem",
        ])

        const tool = model.entries[1]
        if (tool?._tag !== "ToolEntry") throw new Error("expected completed tool entry")
        expect(tool.progress).toEqual(["looking up"])
        expect(Chat.toolStatusOf(tool)).toBe("output-available")

        const assistant = model.entries[2]
        expect(assistant).toEqual(
          Chat.AssistantEntry({ text: "Final answer", reasoning: "Check the transport stream." }),
        )
      }),
    )
  })
})
