import { code, command, definePage, h2, lead, link, p, table } from "../../../prose"

export const foldkitReference = definePage({
  path: "/docs/reference/foldkit",
  title: "tenetkit/foldkit",
  navTitle: "foldkit",
  group: "Reference",
  description: "FoldKit connection and headless Chat projections over Runtime RunEvents.",
  content: [
    lead(
      "tenetkit/foldkit adapts Runtime RunEvents and explicit commands to FoldKit's Elm architecture without owning run lifecycle state.",
    ),
    command("Install", "bun add foldkit@0.122.0 tenetkit/runtime tenetkit/transport tenetkit/foldkit"),
    p("Published on npm at 0.14.0. Depends on Runtime and transport; foldkit is a peer dependency."),
    h2("exports", "Exports"),
    table(
      ["Namespace", "Role"],
      [
        [[code("Connection")], "Scoped Run connection, reconnect status, event stream, and explicit commands"],
        [[code("Chat")], "Headless model, update function, commands, subscriptions, outputs, and view projections"],
      ],
    ),
    h2("connection", "Connection"),
    p(
      code("Connection.layerWebSocket"),
      " uses the transport reconnecting client. A scoped session observes one run from an exclusive cursor and sends explicit Runtime commands. ",
      code("Connection.layerTest"),
      " provides a deterministic seam for tests.",
    ),
    h2("chat", "Chat"),
    p(
      code("Chat.update(model, action)"),
      " folds connection status and canonical RunEvents into semantic assistant and tool entries, explicit run state, approvals, and terminal output. Assistant entries come from normalized ",
      code("ModelResponseCommitted"),
      " and ",
      code("ModelResponseInterrupted"),
      " events; Chat does not assemble or own provider fragments. ",
      code("Chat.subscriptions"),
      " owns scoped durable observation; command failures return through typed Chat actions. ",
      code("Chat.Model"),
      " has no authoritative streaming-text field. A host that explicitly consumes ",
      code("Runtime.previews"),
      " must keep that disposable state outside Chat.",
    ),
    p(
      "See ",
      link("/docs/reference/runtime", "tenetkit/runtime"),
      " and ",
      link("/docs/reference/transport", "tenetkit/transport"),
      ".",
    ),
  ],
})
