import { bullets, code, definePage, h2, link, p, strong } from "../../prose"
export const comparisons = definePage({
  path: "/docs/learn/comparisons",
  title: "When to use Generalist",
  navTitle: "When to use Generalist",
  group: "Learn",
  description:
    "The workloads Generalist is built for, the workloads it deliberately is not, and how to tell in one read which side yours falls on.",
  content: [
    p(
      "Generalist is a TypeScript framework for building AI agents on Effect, and it is scoped on purpose: agents as plain values, runs as typed event streams, every seam an Effect service. This page states plainly which workloads that scope serves and which it does not, so you can decide in one read.",
    ),
    h2("reach-for-generalist", "Reach for Generalist when"),
    bullets(
      [
        strong("The agent lives inside your process."),
        " CLIs, scripts, servers, and tests that need a tool-calling agent with no external infrastructure. ",
        code("Agent.stream"),
        " emits a closed ten-event union you fold, persist, or forward (",
        link("/docs/learn/agent-loop", "The agent loop"),
        ").",
      ],
      [
        strong("A human has to approve tool calls."),
        " An approval-gated tool suspends the run as ",
        code("AgentSuspended"),
        " on the error channel, carrying a resume token. Suspension is a value in the type signature, not a callback to wire (",
        link("/docs/learn/suspension", "Suspension as a typed error"),
        ").",
      ],
      [
        strong("Agent behavior must be assertable in CI."),
        " Every behavior-bearing seam ships a deterministic test layer, and a scripted model runs the full loop with zero API keys; ",
        link("/docs/start/quickstart", "the quickstart"),
        " ends with exactly such an eval, exit code 0 on success.",
      ],
      [
        strong("You are streaming a run to a browser."),
        " generalist/server exposes Host Sessions and their durable event cursor over SSE and WebSocket, with a client generated from the same HttpApi (",
        link("/docs/guides/serve-transport", "Serve over a transport"),
        ").",
      ],
      [
        strong("Your codebase is Effect."),
        " Agents compose with the services, layers, typed errors, and streams you already have; nothing is bolted on.",
      ],
    ),
    h2("reach-elsewhere", "Reach elsewhere when"),
    bullets(
      [
        strong("A single model call with tools is enough."),
        " Use ",
        code("effect/unstable/ai"),
        " directly: it is Generalist's own substrate, and it resolves tool calls within one generation. Generalist starts paying for itself when a model call becomes an agent: multiple turns, policies, approvals, an observable stream.",
      ],
      [
        strong("Runs must survive deploys, crashes, or multi-day waits."),
        " Add ",
        code("generalist/runtime"),
        ", which hosts the same core agents as durable, addressable runs on SQLite, PostgreSQL, or MySQL (",
        link("/docs/learn/native-runtime", "where durability lives"),
        ").",
      ],
      [
        strong("You need multi-step orchestration across services."),
        " Generalist owns one agent's turns, nothing wider. Orchestration belongs to your application or to a durable runtime above it.",
      ],
      [
        strong("Effect is not in your stack."),
        " Generalist's extension mechanism is Effect services and layers; without Effect you would be fighting the framework's one idea.",
      ],
    ),
    h2("the-shape-of-the-decision", "The shape of the decision"),
    p(
      "Count the turns and decide whether execution state must survive the process. One model call: use Effect AI directly. For a process-local agent loop, use generalist. For addressable runs that need replay or recovery, add generalist/runtime. The fastest way to test the core fit is ",
      link("/docs/start/quickstart", "the quickstart"),
      ", which builds a tool-calling agent and a CI eval in about five minutes, no API key required.",
    ),
  ],
})
