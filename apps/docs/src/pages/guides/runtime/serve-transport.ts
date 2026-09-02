import approvalResume from "virtual:source/src/snippets/guides/runtime/serve-transport/approval-resume.ts"
import approvalResumeExpected from "virtual:source/src/snippets/guides/runtime/serve-transport/approval-resume.expected.txt"
import curlSession from "virtual:source/src/snippets/guides/runtime/serve-transport/curl-session.sh"
import httpRoutes from "virtual:source/src/snippets/guides/runtime/serve-transport/http-routes.ts"
import sessionFrames from "virtual:source/src/snippets/guides/runtime/serve-transport/session-frames.ts"
import sessionFramesExpected from "virtual:source/src/snippets/guides/runtime/serve-transport/session-frames.expected.txt"
import { bullets, code, codeBlock, command, definePage, h2, link, p } from "../../../prose"

export const serveTransport = definePage({
  path: "/docs/guides/serve-transport",
  title: "How to serve an agent over SSE and WebSocket",
  navTitle: "Serve over SSE and WebSocket",
  group: "Guides",
  description: "Expose a Generalist Host through one typed HttpApi with HTTP, SSE, and WebSocket.",
  content: [
    p(
      code("generalist/server"),
      " mounts one schema-first HttpApi over a ",
      code("generalist/host"),
      ". The Host delegates execution and persistence to Runtime while Server owns only HTTP translation, authentication, SSE and WebSocket framing, and its generated client.",
    ),
    command("Terminal", "bun add effect@4.0.0-rc.112 generalist"),
    h2("run-in-memory", "1. Run an agent in memory"),
    p(
      code("Runtime.layerMemory"),
      " hosts Agents registered once at process startup. The in-memory process claims admitted work through the provided ",
      code("RunStore"),
      " and executes it with ",
      code("RunExecutor"),
      ". ",
      code("Generalist.create"),
      " registers configured Agents and returns the Host. ",
      code("host.runs.start"),
      " retains typed in-process inputs and outputs; the Server route uses ",
      code("host.runs.startByName"),
      " to decode serialized input through the selected Agent Schema.",
    ),
    codeBlock({ label: "session-frames.ts", source: sessionFrames, expectedOutput: sessionFramesExpected }),
    bullets(
      ["A Host Session assigns one durable cursor across the visible events from its root Run trees."],
      [
        code("ModelResponseCommitted"),
        " references the exact Runtime Session entry containing the complete normalized response for a successful model operation; ",
        code("ModelResponseInterrupted"),
        " references normalized output retained before cancellation or failure. Runtime stores the content once in Session. Host does not include these model-response records in its product event projection, and provider fragments never enter the durable stream.",
      ],
      [
        "Terminal lifecycle facts are ",
        code("RunCompleted"),
        ", ",
        code("RunFailed"),
        ", and ",
        code("RunCancelled"),
        ".",
      ],
      ["A Server cursor is exclusive: cursor n requests Host events after authoritative Session entry n."],
      ["The Host Session ID addresses streaming and lists root Runs; the Run ID addresses inspection and control."],
    ),
    h2("resolve-waits", "2. Resolve approval waits"),
    p(
      "A durable approval emits an approval token and suspends the Run. Resolve it with ",
      code("client.approvals.resolve({ runId, token, decision, operator })"),
      ". Runtime verifies the token, journals the operator identity, and rejects a stale decision.",
    ),
    codeBlock({ label: "approval-resume.ts", source: approvalResume, expectedOutput: approvalResumeExpected }),
    p(
      "WebSocket carries Host events and explicit cancellation only. Resolve approvals through the authenticated Server HTTP route.",
    ),
    h2("serve-the-routes", "3. Serve the routes"),
    p(
      code("Server.layer({ host, auth })"),
      " serves Sessions, named-Agent Run admission, inspection, cancellation, approvals, operator actions, Session SSE at ",
      code("/sessions/:id/events"),
      ", Session WebSocket at ",
      code("/sessions/:id/ws"),
      ", and OpenAPI at ",
      code("/openapi.json"),
      ".",
    ),
    codeBlock({ label: "http-routes.ts", source: httpRoutes }),
    p("Launch the layer with your platform HTTP server, then admit and observe a run:"),
    codeBlock({ label: "Terminal", language: "bash", source: curlSession }),
    h2("cursors-and-backpressure", "4. Cursors and backpressure"),
    bullets(
      [
        code("client.events.subscribe"),
        " resumes from the exclusive cursor in ",
        code("Last-Event-ID"),
        ", falling back to ",
        code("?cursor="),
        ".",
      ],
      [
        "A lagging subscriber fails without affecting the Run or other subscribers. The reconnecting client resumes from its last admitted Host cursor.",
      ],
      [code("client.runs.inspect({ runId })"), " is finite Run inspection, separate from the Session event stream."],
      [
        code("Runtime.previews({ runId })"),
        " is a bounded, append-only, lossy process-local observer with detectable sequence and offset gaps. It is not transported, persisted, cursor-addressed, checkpointed, or durably replayed.",
      ],
      [
        "Closing SSE or WebSocket never cancels the run. Cancellation is always explicit through ",
        code("Runtime.cancel"),
        ".",
      ],
    ),
    p(
      "The wire contract is in ",
      link("/docs/reference/transport", "the generalist/server reference"),
      ", and Runtime ownership is documented in ",
      link("/docs/reference/runtime", "the generalist/runtime reference"),
      ".",
    ),
  ],
})
