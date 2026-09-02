import { code, command, definePage, h2, lead, link, p, table } from "../../../prose"

export const transportReference = definePage({
  path: "/docs/reference/transport",
  title: "generalist/server",
  navTitle: "server",
  group: "Reference",
  description: "One typed HttpApi over a Host with HTTP, SSE, WebSocket, authentication, and OpenAPI.",
  content: [
    lead(
      "generalist/server exposes one Host through a schema-first Effect HttpApi and generates its client from that same contract.",
    ),
    command("Install", "bun add effect@4.0.0-rc.112 generalist"),
    h2("exports", "Exports"),
    table(
      ["Export", "Role"],
      [
        [[code("Server.api")], "HttpApi with sessions, runs, events, approvals, and operator groups"],
        [[code("Server.layer")], "Host-backed route implementation and /openapi.json"],
        [[code("Server.authBearer")], "Bearer Authentication Layer from a redacted Config"],
        [[code("Server.client")], "Typed HTTP, SSE, and WebSocket client"],
        [[code("Server.eventCodec")], "Shared HostEvent WebSocket codec"],
      ],
    ),
    h2("events", "Session events"),
    p(
      code("client.events.subscribe({ sessionId, cursor? })"),
      " follows SSE. ",
      code("client.events.connect({ sessionId, cursor? })"),
      " opens WebSocket. Both carry the same HostEvent and resume strictly after the last durable Session cursor. Last-Event-ID takes precedence over the SSE query cursor.",
    ),
    p(
      "Both routes resolve the Session before committing the response, so an unknown Session returns the typed ",
      code("SessionNotFound"),
      " body with HTTP 404 instead of opening a stream. After SSE headers are committed, a cursor, lag, or Runtime failure is sent as one terminal ",
      code("effect/httpapi/stream/failure"),
      " event containing the encoded ",
      code("ApiError"),
      "; the generated client exposes it as the stream failure.",
    ),
    h2("commands", "Commands and inspection"),
    p(
      "The client creates and lists Sessions, starts named configured Agents, lists, inspects, and cancels Runs, resolves durable approvals, and calls the Runtime operator surface. Operator mutations return a typed 403 unless the host opts in with ",
      code("operator: true"),
      ". Closing a stream never cancels execution.",
    ),
    p(
      "See ",
      link("/docs/reference/runtime", "generalist/runtime"),
      " for Run ownership and ",
      link("/docs/reference/foldkit", "generalist/unstable/foldkit"),
      " for the UI projection.",
    ),
  ],
})
