import * as Prose from "../../prose"

export const comparisons = Prose.definePage({
  path: "/docs/learn/comparisons",
  title: "When to use Batonfx",
  navTitle: "When to use Batonfx",
  group: "Learn",
  description:
    "The workloads Batonfx is built for, the workloads it deliberately is not, and how to tell in one read which side yours falls on.",
  content: [
    Prose.p(
      "Batonfx is a TypeScript framework for building AI agents on Effect, and it is scoped on purpose: agents as plain values, runs as typed event streams, every seam an Effect service. This page states plainly which workloads that scope serves and which it does not, so you can decide in one read.",
    ),
    Prose.h2("reach-for-batonfx", "Reach for Batonfx when"),
    Prose.bullets(
      [
        Prose.strong("The agent lives inside your process."),
        " CLIs, scripts, servers, and tests that need a tool-calling agent with no external infrastructure — ",
        Prose.code("Agent.stream"),
        " emits a closed nine-event union you fold, persist, or forward (",
        Prose.link("/docs/learn/agent-loop", "The agent loop"),
        ").",
      ],
      [
        Prose.strong("A human has to approve tool calls."),
        " An approval-gated tool suspends the run as ",
        Prose.code("AgentSuspended"),
        " on the error channel, carrying a resume token — suspension is a value in the type signature, not a callback to wire (",
        Prose.link("/docs/learn/suspension", "Suspension as a typed error"),
        ").",
      ],
      [
        Prose.strong("Agent behavior must be assertable in CI."),
        " Every behavior-bearing seam ships a deterministic test layer, and a scripted model runs the full loop with zero API keys — ",
        Prose.link("/docs/start/quickstart", "the quickstart"),
        " ends with exactly such an eval, exit code 0 on success.",
      ],
      [
        Prose.strong("You are streaming a run to a browser."),
        " The in-memory session registry serves the event stream over SSE and WebSocket, with a headless FoldKit chat model on the client (",
        Prose.link("/docs/guides/serve-transport", "Serve over a transport"),
        ").",
      ],
      [
        Prose.strong("Your codebase is Effect."),
        " Agents compose with the services, layers, typed errors, and streams you already have; nothing is bolted on.",
      ],
    ),
    Prose.h2("reach-elsewhere", "Reach elsewhere when"),
    Prose.bullets(
      [
        Prose.strong("A single model call with tools is enough."),
        " Use ",
        Prose.code("effect/unstable/ai"),
        " directly — it is Batonfx's own substrate, and it resolves tool calls within one generation. Batonfx starts paying for itself when a model call becomes an agent: multiple turns, policies, approvals, an observable stream.",
      ],
      [
        Prose.strong("Runs must survive deploys, crashes, or multi-day waits."),
        " Batonfx is single-process and persists nothing. That workload is ",
        Prose.link("https://relayfx-docs.up.railway.app", "Relayfx"),
        ", which runs the same agents inside durable executions on your Postgres (",
        Prose.link("/docs/learn/baton-and-relay", "where durability lives"),
        ").",
      ],
      [
        Prose.strong("You need multi-step orchestration across services."),
        " Batonfx owns one agent's turns, nothing wider. Orchestration belongs to your application or to a durable runtime above it.",
      ],
      [
        Prose.strong("Effect is not in your stack."),
        " Batonfx's extension mechanism is Effect services and layers; without Effect you would be fighting the framework's one idea.",
      ],
    ),
    Prose.h2("the-shape-of-the-decision", "The shape of the decision"),
    Prose.p(
      "Count the turns and count the processes. One turn, one process: use the primitives. Many turns, one process: Batonfx. Many turns, and the run must outlive the process: Batonfx inside Relayfx. The fastest way to test the fit is ",
      Prose.link("/docs/start/quickstart", "the quickstart"),
      " — a tool-calling agent and a CI eval in about five minutes, no API key required.",
    ),
  ],
})
