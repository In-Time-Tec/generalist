import { code, command, definePage, h2, lead, link, p, table } from "../../../prose"

export const transportReference = definePage({
  path: "/docs/reference/transport",
  title: "tenetkit/transport",
  navTitle: "transport",
  group: "Reference",
  description: "Runtime RunEvent wire codecs, SSE and WebSocket handlers, snapshots, and reconnecting clients.",
  content: [
    lead(
      "tenetkit/transport exposes Runtime-owned runs over SSE and WebSocket without executing agents, persisting events, or inventing another lifecycle.",
    ),
    command("Install", "bun add tenetkit/runtime tenetkit/transport"),
    p("Published on npm at 0.14.0. Requires ", code("tenetkit/runtime"), "."),
    h2("exports", "Exports map"),
    table(
      ["Subpath", "Contents"],
      [
        [[code(".")], "Client, Errors, Snapshot, Sse, Wire, and Ws namespaces"],
        [[code("./wire")], [code("producerCodec"), ", ", code("observerCodec"), ", and command schemas"]],
        [[code("./snapshot")], [code("Snapshot.get(runId)"), " finite inspection resource"]],
        [[code("./sse")], [code("streamSuccess"), ", ", code("respond"), ", and cursor parsing"]],
        [[code("./ws")], [code("handle"), " for Attach and Cancel commands"]],
        [[code("./client")], [code("layerWebSocket"), " and reconnecting observer clients"]],
        [[code("./errors")], "Transport boundary errors"],
      ],
    ),
    h2("replay", "Replay and snapshots"),
    p(
      "A cursor is exclusive: cursor n requests persisted RunEvents with sequence greater than n. Model output appears as normalized ",
      code("ModelResponseCommitted"),
      " or ",
      code("ModelResponseInterrupted"),
      " events, never provider fragments. SSE IDs and WebSocket reconnect cursors are the Runtime event sequence. An expired cursor fails typed; recover through ",
      code("Snapshot.get"),
      ", whose RunInspection is separate from the event stream.",
    ),
    h2("wire", "Wire codecs"),
    p(
      code("Wire.producerCodec"),
      " encodes the canonical Runtime schema. ",
      code("Wire.observerCodec"),
      " validates stable run identity and cursor fields while retaining unknown future event tags for forward-compatible observers.",
    ),
    h2("connections", "SSE, WebSocket, and clients"),
    p(
      code("Sse.respond"),
      " streams Runtime history and live events. Last-Event-ID takes precedence over the cursor query parameter. ",
      code("Ws.handle"),
      " accepts Attach and explicit Cancel only. Closing an observer never cancels its Run.",
    ),
    p(
      "Runtime owns subscriber capacity and lag failures. The WebSocket client reconnects from the last delivered semantic or lifecycle RunEvent sequence; a lag close carries that sequence so replay resumes without transport-owned state. Disposable ",
      code("Runtime.previews"),
      " are process-local observers and are not part of SSE, WebSocket, cursors, snapshots, or replay.",
    ),
    p(
      "See ",
      link("/docs/reference/runtime", "tenetkit/runtime"),
      " for Run ownership and ",
      link("/docs/reference/foldkit", "tenetkit/foldkit"),
      " for the UI projection.",
    ),
  ],
})
