import evalSource from "../../snippets/quickstart/eval.ts?raw"
import evalExpected from "../../snippets/quickstart/eval.expected.txt?raw"
import * as Prose from "../../prose"

export const introduction = Prose.definePage({
  path: "/docs/start/introduction",
  title: "What is Batonfx",
  navTitle: "What is Batonfx",
  group: "Start",
  description:
    "Batonfx is a TypeScript framework for building AI agents on Effect: agents are plain values, runs are typed event streams, and every seam is an Effect service with a deterministic test layer.",
  content: [
    Prose.p(
      "Batonfx is a TypeScript framework for building AI agents on Effect. It is standalone and non-durable, built on ",
      Prose.code("effect/unstable/ai"),
      ", and it covers what an agent needs beyond a model call: turn iteration, permissions, human approval as typed suspension, steering, and deterministic test seams. An agent is a plain value: a name, instructions, a toolkit, and a turn policy. A run is an Effect stream of typed events (the model call, each tool execution, each turn boundary) that you fold, observe, or forward to a browser. There is no runtime process to operate and no storage Batonfx owns: durability, persistence, and identity stay with the host application.",
    ),
    Prose.p(
      "Every capability is an Effect service. Four layers are required on every run: the language model, the tool executor, approvals, and model middleware. Everything else (permissions, memory, skills, compaction, steering) is an optional seam discovered at runtime. Absent means default behavior, and every behavior-bearing seam ships a test layer, so agents run deterministically in CI with zero credentials.",
    ),
    Prose.h2("a-complete-program", "A complete program"),
    Prose.p(
      "This runs an agent against the deterministic provider and asserts on its answer: no API key, exit code 0 on success.",
    ),
    Prose.codeBlock({ label: "eval.ts", source: evalSource, expectedOutput: evalExpected }),
    Prose.h2("when-to-use-batonfx", "When to use Batonfx"),
    Prose.bullets(
      "In-process agents: CLIs, scripts, servers, and tests that need a tool-calling loop without external infrastructure.",
      "Human-in-the-loop flows: approval-gated tools suspend the run as a typed error carrying a resume token.",
      "Streaming chat: an in-memory session registry serves the event stream over SSE and WebSocket, with a headless FoldKit chat model for the browser.",
      "Deterministic CI: scripted models and test layers on every seam make agent behavior assertable.",
    ),
    Prose.h2("non-goals", "Non-goals"),
    Prose.p(
      "Batonfx will not grow a workflow engine, a database, a project scaffold, or a hosted platform. Multi-step orchestration, persistence, and deployment belong to your application, or to Relayfx when they must be durable. A framework that owns only the agent stays small enough to read, swap, and leave.",
    ),
    Prose.h2("where-relayfx-fits", "Where Relayfx fits"),
    Prose.p(
      "Batonfx deliberately does not own durable state: no event-log storage, no database schema, no addressable executions. That is the domain of ",
      Prose.link("https://relayfx-docs.up.railway.app", "Relayfx"),
      ", the durable agent runtime that composes Batonfx for turn iteration inside crash-proof executions on your own Postgres. Batonfx is the agent; Relayfx is the durable race it runs in. Use Batonfx alone for process-local agents; run it inside Relayfx when runs must survive restarts and multi-day waits. ",
      Prose.link("/docs/learn/baton-and-relay", "Baton and Relay: where durability lives"),
      " covers the split in depth.",
    ),
    Prose.h2("next-steps", "Next steps"),
    Prose.bullets(
      ["Install the packages: ", Prose.link("/docs/start/installation", "Installation"), "."],
      [
        "Build a tool-calling agent and a CI eval in five minutes: ",
        Prose.link("/docs/start/quickstart", "Quickstart"),
        ".",
      ],
      ["Understand the loop itself: ", Prose.link("/docs/learn/agent-loop", "The agent loop"), "."],
    ),
  ],
})
