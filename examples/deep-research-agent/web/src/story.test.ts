// @vitest-environment happy-dom

import { AgentEvent } from "@batonfx/core"
import { Chat } from "@batonfx/foldkit"
import { Wire } from "@batonfx/transport"
import { Response } from "effect/unstable/ai"
import { Story } from "foldkit"
import { describe, expect, test } from "vitest"
import { GotChatMessage, OpenedSession, SessionReady, init, type Model, update } from "./main"

const sessionId = "deep-research-story"

const eventFrame = (seq: number, event: Wire.EventType): Wire.LooseServerFrameType => ({ _tag: "Event", seq, event })

const agentMessage = (incoming: Wire.LooseServerFrameType) =>
  GotChatMessage({ message: Chat.ReceivedAgent({ incoming }) })

const readyModel = (): Model => {
  const [model] = update(init()[0], OpenedSession({ sessionId }))
  return { ...model, session: SessionReady(), chat: { ...model.chat, connection: "open" } }
}

const submittedQuestionModel = (): Model => {
  const [drafted] = update(
    readyModel(),
    GotChatMessage({ message: Chat.ChangedDraft({ text: "What makes Baton standalone?" }) }),
  )
  const [submitted, commands] = update(drafted, GotChatMessage({ message: Chat.SubmittedMessage() }))
  expect(commands).toHaveLength(1)
  expect(commands[0]?.name).toBe("SendUserMessage")
  expect(submitted.chat.entries).toEqual([Chat.UserEntry({ text: "What makes Baton standalone?" })])
  return submitted
}

const toolCall = Response.makePart("tool-call", {
  id: "search-1",
  name: "web_search",
  params: { query: "What makes Baton standalone?" },
  providerExecuted: false,
})

const toolResult = Response.makePart("tool-result", {
  id: "search-1",
  name: "web_search",
  result: {
    results: [{ title: "Baton docs", url: "https://baton.test/docs", snippet: "Baton streams transport frames." }],
  },
  encodedResult: {
    results: [{ title: "Baton docs", url: "https://baton.test/docs", snippet: "Baton streams transport frames." }],
  },
  isFailure: false,
  providerExecuted: false,
  preliminary: false,
})

const completionFrames: ReadonlyArray<Wire.LooseServerFrameType> = [
  eventFrame(0, { _tag: "TurnStarted", turn: 0 }),
  eventFrame(1, { _tag: "ModelPart", turn: 0, part: toolCall }),
  eventFrame(2, { _tag: "ToolExecutionStarted", turn: 0, call: toolCall }),
  eventFrame(3, { _tag: "ToolExecutionCompleted", turn: 0, call: toolCall, result: toolResult }),
  eventFrame(4, { _tag: "TurnCompleted", turn: 0 }),
  eventFrame(5, { _tag: "TurnStarted", turn: 1 }),
  eventFrame(6, {
    _tag: "ModelPart",
    turn: 1,
    part: Response.makePart("reasoning-delta", { id: "reasoning-1", delta: "Compare transport frames." }),
  }),
  eventFrame(7, {
    _tag: "ModelPart",
    turn: 1,
    part: Response.makePart("text-delta", { id: "assistant", delta: "Final cited answer" }),
  }),
  eventFrame(8, { _tag: "TurnCompleted", turn: 1 }),
  eventFrame(9, { _tag: "Completed", turns: 2, text: "Final cited answer\n\nSources:\n[1] Baton docs" }),
]

describe("deep-research-agent web update", () => {
  test("projects a successful Baton transport event stream into the chat model", () => {
    Story.story(
      update,
      Story.with(submittedQuestionModel()),
      ...completionFrames.map((frame) => Story.message(agentMessage(frame))),
      Story.model((model) => {
        expect(model.chat.run._tag).toBe("Idle")
        expect(model.chat.connection).toBe("open")
        expect(model.chat.streaming).toBeNull()
        expect(model.chat.entries.map((entry) => entry._tag)).toEqual(["UserEntry", "ToolEntry", "AssistantEntry"])

        const user = model.chat.entries[0]
        const tool = model.chat.entries[1]
        const assistant = model.chat.entries[2]
        if (user?._tag !== "UserEntry" || tool?._tag !== "ToolEntry" || assistant?._tag !== "AssistantEntry") {
          throw new Error("successful transport stream projected an unexpected chat entry shape")
        }

        expect(user).toEqual(Chat.UserEntry({ text: "What makes Baton standalone?" }))
        expect(tool).toEqual(
          Chat.ToolEntry({
            callId: "search-1",
            name: "web_search",
            params: { query: "What makes Baton standalone?" },
            phase: "executing",
            outcome: {
              _tag: "Completed",
              isFailure: false,
              result: {
                results: [
                  {
                    title: "Baton docs",
                    url: "https://baton.test/docs",
                    snippet: "Baton streams transport frames.",
                  },
                ],
              },
            },
            progress: [],
          }),
        )
        expect(assistant).toEqual(
          Chat.AssistantEntry({ text: "Final cited answer", reasoning: "Compare transport frames." }),
        )
      }),
    )
  })

  test("clicking stop dispatches the existing Baton cancel command", () => {
    Story.story(
      update,
      Story.with({
        ...readyModel(),
        chat: { ...readyModel().chat, run: Chat.Running({ turn: 0 }) },
      }),
      Story.message(GotChatMessage({ message: Chat.ClickedCancel() })),
      Story.Command.expectExact(Chat.CancelRun({ sessionId })),
      Story.Command.resolve(Chat.CancelRun({ sessionId }), Chat.CancelledRun(), (message) =>
        GotChatMessage({ message }),
      ),
      Story.model((model) => {
        expect(model.chat.run).toEqual(Chat.Running({ turn: 0 }))
      }),
    )
  })

  test("projects transport failures into a failed run state", () => {
    Story.story(
      update,
      Story.with({
        ...readyModel(),
        chat: {
          ...readyModel().chat,
          run: Chat.Running({ turn: 0 }),
          entries: [
            Chat.UserEntry({ text: "What makes Baton standalone?" }),
            Chat.ToolEntry({
              callId: "search-1",
              name: "web_search",
              params: { query: "What makes Baton standalone?" },
              phase: "called",
              outcome: { _tag: "Pending" },
              progress: [],
            }),
          ],
        },
      }),
      Story.message(
        agentMessage({
          _tag: "Failed",
          seq: 9,
          error: new AgentEvent.AgentError({ message: "model unavailable", turn: 0 }),
        }),
      ),
      Story.model((model) => {
        expect(model.chat.run).toEqual({ _tag: "Failed", message: "model unavailable" })
        expect(model.chat.connection).toBe("open")
      }),
    )
  })
})
