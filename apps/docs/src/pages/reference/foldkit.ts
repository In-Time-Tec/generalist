import * as Prose from "../../prose"

export const foldkitReference = Prose.definePage({
  path: "/docs/reference/foldkit",
  title: "@batonfx/foldkit",
  navTitle: "foldkit",
  group: "Reference",
  description: "The AgentConnection service and the headless Chat submodel for FoldKit apps.",
  content: [
    Prose.lead(
      "@batonfx/foldkit adapts the transport protocol to FoldKit's Elm architecture: Connection owns the WebSocket, Chat is a headless submodel that folds wire frames into renderable state.",
    ),
    Prose.command("Install", "bun add effect@4.0.0-beta.93 foldkit@0.122.0 @batonfx/transport @batonfx/foldkit"),
    Prose.p(
      "Published on npm at 0.1.1. Depends on ",
      Prose.code("@batonfx/transport"),
      "; peer dependencies are ",
      Prose.code("effect >=4.0.0-beta.88 <4.0.1"),
      " and ",
      Prose.code("foldkit >=0.122.0 <1"),
      ".",
    ),
    Prose.h2("exports", "Exports map"),
    Prose.table(
      ["Subpath", "Contents"],
      [[[Prose.code(".")], ["Namespaces ", Prose.code("Chat"), " and ", Prose.code("Connection")]]],
    ),
    Prose.h2("connection", "Connection"),
    Prose.p(
      "The ",
      Prose.code("AgentConnection"),
      " service: ",
      Prose.code("frames({ sessionId, afterSeq? })"),
      " streams incoming values and ",
      Prose.code("send(frame)"),
      " writes a ",
      Prose.code("Wire.ClientFrameType"),
      ", failing with ",
      Prose.code("SendFailed{ reason }"),
      ".",
    ),
    Prose.table(
      ["Incoming member", "Meaning"],
      [
        [[Prose.code("Wire.LooseServerFrameType")], "Any of the six server frames"],
        [[Prose.code("ConnectionOpened")], "The socket opened"],
        [[Prose.code("ConnectionLost")], "The socket is reconnecting or closed"],
        [[Prose.code("ConnectionFailed")], [Prose.code("{ reason }"), " — the frame stream failed"]],
      ],
    ),
    Prose.table(
      ["Export", "Notes"],
      [
        [
          [Prose.code("layerWebSocket({ url })")],
          [
            "Built on the transport's reconnecting client; requires ",
            Prose.code("Socket.WebSocketConstructor"),
            ". Reattaches with the last delivered ",
            Prose.code("seq"),
            " after reconnects",
          ],
        ],
        [[Prose.code("testLayer(implementation)")], "Layer from an explicit interface"],
      ],
    ),
    Prose.h2("chat-model", "Chat.Model"),
    Prose.table(
      ["Field", "Type", "Notes"],
      [
        [[Prose.code("sessionId")], [Prose.code("string | null")], "Session bound by OpenedSession"],
        [
          [Prose.code("connection")],
          [Prose.code('"disconnected" | "connecting" | "open" | "reconnecting"')],
          "Socket state",
        ],
        [[Prose.code("lastSeq")], [Prose.code("number")], "Last applied frame seq; duplicate frames are ignored"],
        [[Prose.code("run")], [Prose.code("RunState")], "Current run lifecycle"],
        [[Prose.code("entries")], [Prose.code("ReadonlyArray<ChatEntry>")], "Settled conversation entries"],
        [
          [Prose.code("streaming")],
          [Prose.code("{ turn, text, reasoning } | null")],
          "In-flight assistant text, flushed to an entry on TurnCompleted",
        ],
        [[Prose.code("draft")], [Prose.code("string")], "Prompt input value"],
      ],
    ),
    Prose.p(Prose.code("Chat.initialModel(sessionId?)"), " builds the empty model."),
    Prose.h3("run-state", "RunState"),
    Prose.table(
      ["State", "Fields"],
      [
        [[Prose.code("Idle")], "none"],
        [[Prose.code("Running")], [Prose.code("turn")]],
        [
          [Prose.code("AwaitingApproval")],
          [Prose.code("token"), ", ", Prose.code("toolName"), ", ", Prose.code("params")],
        ],
        [[Prose.code("Failed")], [Prose.code("message")]],
      ],
    ),
    Prose.h3("chat-entry", "ChatEntry"),
    Prose.table(
      ["Entry", "Fields"],
      [
        [[Prose.code("UserEntry")], [Prose.code("text")]],
        [[Prose.code("AssistantEntry")], [Prose.code("text"), ", ", Prose.code("reasoning: string | null")]],
        [
          [Prose.code("ToolEntry")],
          [
            Prose.code("callId"),
            ", ",
            Prose.code("name"),
            ", ",
            Prose.code("params"),
            ", ",
            Prose.code('phase: "called" | "executing"'),
            ", ",
            Prose.code("outcome: Pending | Completed{ isFailure, result }"),
            ", ",
            Prose.code("progress: Array<string>"),
          ],
        ],
      ],
    ),
    Prose.h2("chat-messages", "Chat.Message"),
    Prose.p(
      "Route these through your app's message wrapper into ",
      Prose.code("Chat.update(model, message)"),
      ", which returns ",
      Prose.code("[Model, Array<ChatCommand>, Option<OutMessage>]"),
      ".",
    ),
    Prose.table(
      ["Message", "Fields", "Meaning"],
      [
        [
          [Prose.code("ReceivedAgent")],
          [Prose.code("incoming: Connection.Incoming")],
          "A wire frame or connection status; the fold that drives everything else",
        ],
        [[Prose.code("OpenedSession")], [Prose.code("sessionId")], "Bind the session and reset the model"],
        [[Prose.code("ChangedDraft")], [Prose.code("text")], "Update the prompt draft"],
        [
          [Prose.code("SubmittedMessage")],
          "none",
          ["Append a UserEntry and dispatch the ", Prose.code("SendUserMessage"), " command"],
        ],
        [[Prose.code("ClickedCancel")], "none", ["Dispatch the ", Prose.code("CancelRun"), " command"]],
        [
          [Prose.code("ClickedApprove")],
          "none",
          ["Resolve the pending approval as Approved (only in ", Prose.code("AwaitingApproval"), ")"],
        ],
        [[Prose.code("ClickedDeny")], [Prose.code("reason: string | null")], "Resolve the pending approval as Denied"],
        [
          [Prose.code("SentUserMessage"), " / ", Prose.code("ResolvedApproval"), " / ", Prose.code("CancelledRun")],
          "none",
          "Command completions; no model change",
        ],
        [
          [Prose.code("FailedAgentCommand")],
          [Prose.code("reason")],
          ["Command failure; sets ", Prose.code("run"), " to Failed"],
        ],
      ],
    ),
    Prose.p(
      Prose.code("OutMessage"),
      " surfaces run milestones to the host app: ",
      Prose.code("RunCompleted{ text }"),
      ", ",
      Prose.code("ApprovalRequired"),
      ", ",
      Prose.code("RunFailed{ message }"),
      ".",
    ),
    Prose.h2("commands-subscriptions", "Commands and subscriptions"),
    Prose.table(
      ["Export", "Notes"],
      [
        [
          [Prose.code("SendUserMessage"), " / ", Prose.code("ResolveApproval"), " / ", Prose.code("CancelRun")],
          [
            "FoldKit commands over ",
            Prose.code("AgentConnection.send"),
            "; failures become ",
            Prose.code("FailedAgentCommand"),
          ],
        ],
        [
          [Prose.code("subscriptions")],
          [
            "Keyed on ",
            Prose.code("sessionId"),
            "; streams ",
            Prose.code("connection.frames"),
            " from ",
            Prose.code("model.lastSeq"),
            " and wraps each value in ",
            Prose.code("ReceivedAgent"),
            ". Lift with ",
            Prose.code("Subscription.lift"),
          ],
        ],
      ],
    ),
    Prose.h2("view-helpers", "View helpers"),
    Prose.table(
      ["Export", "Notes"],
      [
        [
          [Prose.code("conversationItems(model)")],
          [
            "Projects the model into a keyed, aligned ",
            Prose.code("ConversationItem"),
            " list: entries, the streaming item, a waiting placeholder, the approval card, and the failure item",
          ],
        ],
        [
          [Prose.code("promptInputStatusOf(run)")],
          [Prose.code('"idle" | "submitted" | "streaming" | "error"'), " for prompt inputs"],
        ],
        [
          [Prose.code("toolStatusOf(entry)")],
          [
            Prose.code('"input-streaming" | "input-available" | "output-available" | "output-error"'),
            " for tool cards",
          ],
        ],
      ],
    ),
    Prose.callout(
      "info",
      "Tool-wait suspensions are not resolvable here",
      "The adapter resolves approval suspensions only; a ",
      Prose.code("tool-wait"),
      " suspension folds to a Failed run state, since resolving it requires a host-side executor.",
    ),
    Prose.p(
      "See ",
      Prose.link("/docs/guides/foldkit-chat", "How to build a chat UI with FoldKit"),
      " and ",
      Prose.link("/docs/guides/serve-transport", "How to serve an agent over SSE and WebSocket"),
      ".",
    ),
  ],
})
