import { code, command, definePage, h2, lead, link, p, table } from "../../../prose"

export const foldkitReference = definePage({
  path: "/docs/reference/foldkit",
  title: "generalist/unstable/foldkit",
  navTitle: "foldkit",
  group: "Reference",
  description: "FoldKit connection and headless Chat projections over Runtime RunEvents.",
  content: [
    lead(
      "generalist/unstable/foldkit adapts Server HostEvents and explicit commands to FoldKit's Elm architecture without owning run lifecycle state.",
    ),
    command("Install", "bun add effect@4.0.0-rc.112 generalist foldkit@0.148.2"),
    p(code("generalist/unstable/foldkit"), " is an import subpath; foldkit is its optional peer dependency."),
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
      " uses the Server reconnecting client. A scoped connection observes one Host Session from an exclusive cursor and sends explicit cancellation. ",
      code("Connection.layerTest"),
      " provides a deterministic seam for tests.",
    ),
    h2("chat", "Chat"),
    p(
      code("Chat.update(model, action)"),
      " folds connection status and HostEvents into tool entries, explicit run state, approvals, and terminal output. Host filters model-response records, so the Server projection does not reconstruct assistant response entries. ",
      code("Chat.subscriptions"),
      " owns scoped durable observation; command failures return through typed Chat actions. ",
      code("Chat.Model"),
      " has no authoritative streaming-text field. A host that explicitly consumes ",
      code("Runtime.previews"),
      " must keep that disposable state outside Chat.",
    ),
    p(
      "See ",
      link("/docs/reference/runtime", "generalist/runtime"),
      " and ",
      link("/docs/reference/transport", "generalist/server"),
      ".",
    ),
  ],
})
