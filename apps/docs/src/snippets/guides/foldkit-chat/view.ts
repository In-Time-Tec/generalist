import { Chat } from "@batonfx/foldkit"
import type { Document, Html } from "foldkit/html"
import { html } from "foldkit/html"
import { GotChatAction, type Message, type Model } from "./model"

const entryView = (entry: Chat.ChatEntry): Html => {
  const h = html<Message>()
  switch (entry._tag) {
    case "UserEntry":
      return h.div([h.Class("entry entry-user")], [entry.text])
    case "AssistantEntry":
      return h.div([h.Class("entry entry-assistant")], [entry.text])
    case "ToolEntry":
      return h.div([h.Class("entry entry-tool")], [`${entry.name}: ${Chat.toolStatusOf(entry)}`])
  }
}

const streamingView = (streaming: Chat.Model["streaming"]): Html => {
  const h = html<Message>()
  return streaming === null ? h.div([], []) : h.div([h.Class("entry entry-streaming")], [streaming.text])
}

const approvalView = (run: Chat.RunState): Html => {
  const h = html<Message>()
  if (run._tag !== "AwaitingApproval") return h.div([], [])
  return h.div(
    [h.Class("approval")],
    [
      h.p([], [`The agent wants to run ${run.toolName}.`]),
      h.button([h.Type("button"), h.OnClick(GotChatAction({ action: Chat.ClickedApprove() }))], ["Approve"]),
      h.button([h.Type("button"), h.OnClick(GotChatAction({ action: Chat.ClickedDeny({ reason: null }) }))], ["Deny"]),
    ],
  )
}

const promptView = (model: Model): Html => {
  const h = html<Message>()
  return h.form(
    [h.OnSubmit(GotChatAction({ action: Chat.SubmittedMessage() })), h.Class("prompt")],
    [
      h.input([
        h.Value(model.chat.draft),
        h.Placeholder("Ask something"),
        h.OnInput((value) => GotChatAction({ action: Chat.ChangedDraft({ text: value }) })),
      ]),
      h.button([h.Type("submit")], ["Send"]),
      h.button([h.Type("button"), h.OnClick(GotChatAction({ action: Chat.ClickedCancel() }))], ["Cancel"]),
    ],
  )
}

export const view = (model: Model): Document => {
  const h = html<Message>()
  return {
    title: "Baton chat",
    body: h.main(
      [h.Class("chat")],
      [
        h.p([h.Class("connection")], [`connection: ${model.chat.connection}`]),
        h.div([h.Class("entries")], model.chat.entries.map(entryView)),
        streamingView(model.chat.streaming),
        approvalView(model.chat.run),
        promptView(model),
      ],
    ),
  }
}
