// @vitest-environment happy-dom

import { Chat, Connection } from "../src/index"
import { Wire } from "@batonfx/transport"
import { Response } from "effect/unstable/ai"
import type { Document, Html } from "foldkit/html"
import { html } from "foldkit/html"
import { Command, click, expect, placeholder, role, scene, type } from "foldkit/scene"
import type { SceneSimulation } from "foldkit/scene"
import { describe, test } from "vitest"

const sessionId = "foldkit-scene-session"

const eventFrame = (seq: number, event: Wire.EventType): Wire.LooseServerFrameType => ({ _tag: "Event", seq, event })

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
  eventFrame(3, { _tag: "ToolExecutionCompleted", turn: 0, call: toolCall, result: toolResult }),
  eventFrame(4, { _tag: "TurnCompleted", turn: 0 }),
  eventFrame(5, { _tag: "TurnStarted", turn: 1 }),
  eventFrame(6, {
    _tag: "ModelPart",
    turn: 1,
    part: Response.makePart("reasoning-delta", { id: "reasoning-1", delta: "Check the transport stream." }),
  }),
  eventFrame(7, {
    _tag: "ModelPart",
    turn: 1,
    part: Response.makePart("text-delta", { id: "answer-1", delta: "Final answer" }),
  }),
  eventFrame(8, { _tag: "TurnCompleted", turn: 1 }),
  eventFrame(9, { _tag: "Completed", turns: 2, text: "Final answer" }),
]

const reduceMessage = (model: Chat.Model, message: Chat.Message): Chat.Model => Chat.update(model, message)[0]

const withModel = <Model>(initialModel: Model) =>
  Object.assign(
    <M, Message, OutMessage = undefined>(simulation: SceneSimulation<M, Message, OutMessage>) =>
      ({ ...simulation, model: initialModel }) as unknown as SceneSimulation<M, Message, OutMessage>,
    { _phantomModel: undefined },
  )

const scriptedModel = (): Chat.Model => {
  let model = Chat.initialModel(null)
  model = reduceMessage(model, Chat.OpenedSession({ sessionId }))
  model = reduceMessage(model, Chat.ReceivedAgent({ incoming: Connection.ConnectionOpened() }))
  model = reduceMessage(model, Chat.ChangedDraft({ text: "Render this run" }))
  model = reduceMessage(model, Chat.SubmittedMessage())
  for (const frame of frames) {
    model = reduceMessage(model, Chat.ReceivedAgent({ incoming: frame }))
  }
  return model
}

const rowView = (item: Chat.ConversationItem): Html => {
  const h = html<Chat.Message>()
  switch (item._tag) {
    case "UserConversationItem":
      return h.section([h.Role("article"), h.AriaLabel("User message")], [item.entry.text])
    case "AssistantConversationItem":
      return h.section(
        [h.Role("article"), h.AriaLabel("Assistant message")],
        [item.entry.reasoning ?? "", item.entry.text],
      )
    case "ToolConversationItem":
      return h.section(
        [h.Role("article"), h.AriaLabel(`Tool ${item.entry.name}`), h.DataAttribute("status", item.status)],
        [item.entry.name, item.status, item.input, JSON.stringify(item.entry.outcome)],
      )
    case "StreamingConversationItem":
      return h.section([h.Role("article"), h.AriaLabel("Streaming assistant message")], [item.reasoning, item.text])
    case "WaitingConversationItem":
      return h.section([h.Role("status")], ["Thinking"])
    case "ApprovalConversationItem":
      return h.section([h.Role("article"), h.AriaLabel("Approval required")], [item.toolName])
    case "FailureConversationItem":
      return h.section([h.Role("alert")], [item.message])
  }
}

const view = (model: Chat.Model): Document => {
  const h = html<Chat.Message>()
  return {
    title: "Chat scene",
    body: h.main(
      [],
      [
        h.div([h.Role("log")], Chat.conversationItems(model).map(rowView)),
        h.form(
          [h.OnSubmit(Chat.SubmittedMessage())],
          [
            h.input([
              h.AriaLabel("Message"),
              h.Placeholder("Message"),
              h.Value(model.draft),
              h.OnInput((text) => Chat.ChangedDraft({ text })),
            ]),
            h.button([h.Type("submit")], ["Send"]),
          ],
        ),
      ],
    ),
  }
}

describe("Chat Scene", () => {
  test("renders scripted stream rows for user, tool execution, and assistant completion", () => {
    scene(
      { update: Chat.update, view },
      withModel(scriptedModel()),
      expect(role("article", { name: "User message" })).toContainText("Render this run"),
      expect(role("article", { name: "Tool lookup" })).toContainText("lookup"),
      expect(role("article", { name: "Tool lookup" })).toContainText("output-available"),
      expect(role("article", { name: "Tool lookup" })).toContainText('"answer":"transport binding"'),
      expect(role("article", { name: "Assistant message" })).toContainText("Check the transport stream."),
      expect(role("article", { name: "Assistant message" })).toContainText("Final answer"),
    )
  })

  test("send message dispatches the Baton send command", () => {
    const model = reduceMessage(Chat.initialModel(null), Chat.OpenedSession({ sessionId }))
    scene(
      { update: Chat.update, view },
      withModel(model),
      type(placeholder("Message"), "hello baton"),
      click(role("button", { name: "Send" })),
      Command.expectExact(Chat.SendUserMessage({ sessionId, text: "hello baton" })),
      Command.resolve(Chat.SendUserMessage({ sessionId, text: "hello baton" }), Chat.SentUserMessage()),
      expect(role("article", { name: "User message" })).toContainText("hello baton"),
    )
  })
})
