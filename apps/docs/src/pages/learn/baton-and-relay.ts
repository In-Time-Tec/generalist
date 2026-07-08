import toolWait from "../../snippets/learn/baton-and-relay/tool-wait.ts?raw"
import toolWaitExpected from "../../snippets/learn/baton-and-relay/tool-wait.expected.txt?raw"
import * as Prose from "../../prose"

export const batonAndRelay = Prose.definePage({
  path: "/docs/learn/baton-and-relay",
  title: "Batonfx and Relayfx: where durability lives",
  navTitle: "Batonfx & Relayfx",
  group: "Learn",
  description:
    "Batonfx is the agent; Relayfx is the durable race it runs in. Where the boundary sits, the seams that form it, and how to choose.",
  content: [
    Prose.p(
      Prose.strong("Batonfx is the agent; Relayfx is the durable race it runs in."),
      " Batonfx owns one model turn at a time: the loop, its events, its seams. ",
      Prose.link("https://relayfx-docs.up.railway.app", "Relayfx"),
      " owns everything that must survive between turns: durable executions, event-log storage, waits that outlive processes, and addressable runs. The two compose because the boundary between them is written into Batonfx's types.",
    ),
    Prose.h2("what-batonfx-does-not-do", "What Batonfx deliberately does not do"),
    Prose.p(
      "Batonfx is standalone and non-durable, and depends on ",
      Prose.code("effect"),
      " only. The ownership rule is mechanical: if code needs durable runtime schema, event-log storage, database state, or execution addressability, it belongs in a durable runtime; if it is the process-local agent primitive over ",
      Prose.code("effect/unstable/ai"),
      ", it belongs in Batonfx. So Batonfx has no tables, no migrations, no wait rows, no execution ids of its own. A run lives and dies with its process. That refusal is what keeps the framework small enough to embed anywhere, including inside a durable runtime.",
    ),
    Prose.h2("the-seam-in-the-code", "The seam is in the code, not the marketing"),
    Prose.p("Four concrete surfaces form the handoff points a durable host builds on:"),
    Prose.bullets(
      [
        Prose.code("TurnCompleted.transcript"),
        ": every completed turn (and every suspension, via a trailing event) carries the full chat history, the durable-chat export point",
      ],
      [
        Prose.code("AgentSuspended"),
        ": the typed suspension whose token and tool-call-shaped fields are exactly what a host persists to resume later",
      ],
      [
        Prose.code("ToolExecutor.Outcome.Suspend"),
        ": the outcome a host's executor returns to park a call on a durable wait instead of blocking a process",
      ],
      [
        "Swap-in layers for every seam: ",
        Prose.code("SessionStore"),
        ", ",
        Prose.code("Memory"),
        ", ",
        Prose.code("Permissions"),
        ", ",
        Prose.code("Compaction"),
        ", ",
        Prose.code("ToolOutputStore"),
        " are services a host reimplements durably without touching the loop",
      ],
    ),
    Prose.p(
      "The third surface is small enough to show whole. This executor stands in for a durable host: it records the call against a wait and suspends the run with a deterministic token:",
    ),
    Prose.codeBlock({ label: "tool-wait.ts", source: toolWait, expectedOutput: toolWaitExpected }),
    Prose.p(
      "One layer turned an in-process tool call into a parked, resumable one, and the trailing transcript arrived in the same breath. That is the entire integration contract.",
    ),
    Prose.h2("proof-relayfx-runs-batonfx", "Proof: Relayfx runs Batonfx in production"),
    Prose.p(
      "This is not a hypothetical embedding. Relayfx's runtime drives ",
      Prose.code("Baton.Agent.stream"),
      " inside its durable agent-loop service, providing its own ",
      Prose.code("ToolRuntime"),
      ", approvals, and session store as layers, and folding the ",
      Prose.code("AgentEvent"),
      " stream into durable execution events. Relayfx owns every sequence number, id, and cursor; Batonfx owns turn iteration. The adoption goes seam by seam: sessions, memory, permissions, steering, compaction, tool-output spill, and skills are adopted through durable Postgres-backed implementations of Batonfx's interfaces, while in-memory transport stays Batonfx-standalone. The suspension shape pays off exactly as designed: a ",
      Prose.code("tool-wait"),
      " becomes a durable wait row keyed by the tool call id, and resume re-enters with the persisted call.",
    ),
    Prose.h2("choosing", "Choosing"),
    Prose.table(
      ["Your situation", "Run"],
      [
        ["In-process CLI, tests, evals, or a UI prototype", "Batonfx alone"],
        ["Chat over SSE or WebSocket within one process", ["Batonfx with ", Prose.code("@batonfx/transport")]],
        ["Approvals resolved in the same process lifetime", "Batonfx alone"],
        ["Multi-day runs, crash recovery, addressable executions", "Batonfx inside Relayfx"],
        ["Waits that must survive deploys and restarts", "Batonfx inside Relayfx"],
        ["Audit-grade event history in your own Postgres", "Batonfx inside Relayfx"],
      ],
    ),
    Prose.p(
      "Start with Batonfx alone. Nothing you build is thrown away, because the durable host consumes the same agent value through the same seams. When runs need to outlive processes, the ",
      Prose.link("https://relayfx-docs.up.railway.app", "Relayfx docs"),
      " pick up where this page ends. For the mechanics behind the two surfaces that matter most here, see ",
      Prose.link("/docs/learn/suspension", "Suspension as a typed error"),
      " and ",
      Prose.link("/docs/learn/seams-as-services", "Seams as services"),
      ".",
    ),
  ],
})
