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
  description: "Admit exact Runtime runs and expose their canonical RunEvents through SSE and WebSocket.",
  content: [
    p(
      code("tenetkit/runtime"),
      " owns run admission, execution, replay, waits, and cancellation. ",
      code("tenetkit/transport"),
      " only projects those Runtime-owned RunEvents through ",
      code("SSE.respond"),
      " and ",
      code("WebSocket.handle"),
      ".",
    ),
    command("Terminal", "bun add effect@4.0.0-rc.112 tenetkit@0.44.0"),
    h2("run-in-memory", "1. Run an agent in memory"),
    p(
      code("Runtime.layerMemory"),
      " resolves pinned executable manifests. The in-memory process claims admitted work through the provided ",
      code("RunStore"),
      " and executes it with ",
      code("RunExecutor"),
      ". ",
      code("Runtime.start"),
      " atomically admits an exact executable and its immutable registrations, returning a receipt containing the stable ",
      code("runId"),
      ". ",
      code("Runtime.events"),
      " replays semantic and lifecycle events after an optional exclusive cursor, then follows live events. Provider fragments never enter this durable stream.",
    ),
    codeBlock({ label: "session-frames.ts", source: sessionFrames, expectedOutput: sessionFramesExpected }),
    bullets(
      [code("sequence"), " is 0-based and monotonic per run. SSE IDs and WebSocket cursors use the same value."],
      [
        code("ModelResponseCommitted"),
        " references the exact Session entry containing the complete normalized response for a successful model operation; ",
        code("ModelResponseInterrupted"),
        " references normalized output retained before cancellation or failure. Runtime stores the content once in Session, and transport resolves that reference into the observer view. Neither persisted event contains response content or provider deltas.",
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
      ["A cursor is exclusive: cursor n requests events whose sequence is greater than n."],
      [
        "The session ID groups messages for agent context; the run ID addresses execution, replay, inspection, and control.",
      ],
    ),
    h2("resolve-waits", "2. Resolve approval waits"),
    p(
      "An approval suspension becomes a ",
      code("RunWaiting"),
      " event. Resume the same run with ",
      code("Runtime.respond({ runId, waitId, resolution })"),
      ". Responses are idempotent and Runtime verifies that the wait is still open.",
    ),
    codeBlock({ label: "approval-resume.ts", source: approvalResume, expectedOutput: approvalResumeExpected }),
    p(
      "WebSocket is intentionally an observer and cancellation transport. Resolve approvals through an authenticated application command route that calls ",
      code("Runtime.respond"),
      ".",
    ),
    h2("serve-the-routes", "3. Serve the routes"),
    p(
      "SSE is downstream-only, so hosts pair the event stream with ordinary command routes. This router serves WebSocket at ",
      code("/ws"),
      ", SSE at ",
      code("/runs/:id/events"),
      ", and admission and cancellation commands beside them.",
    ),
    codeBlock({ label: "http-routes.ts", source: httpRoutes }),
    p("Launch the layer with your platform HTTP server, then admit and observe a run:"),
    codeBlock({ label: "Terminal", language: "bash", source: curlSession }),
    h2("cursors-and-backpressure", "4. Cursors and backpressure"),
    bullets(
      [
        code("SSE.respond"),
        " reads the exclusive resume cursor from ",
        code("Last-Event-ID"),
        ", falling back to ",
        code("?cursor="),
        ".",
      ],
      [
        "A lagging subscriber fails with ",
        code("SubscriberLagged"),
        " while the run and other subscribers continue. WebSocket closes a lagging observer with code ",
        code("4000"),
        ".",
      ],
      [code("Snapshot.get(runId)"), " is a finite inspection resource, separate from the event stream."],
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
      link("/docs/reference/transport", "the tenetkit/transport reference"),
      ", and Runtime ownership is documented in ",
      link("/docs/reference/runtime", "the tenetkit/runtime reference"),
      ".",
    ),
  ],
})
