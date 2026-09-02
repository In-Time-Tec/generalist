import evalSource from "virtual:source/src/snippets/quickstart/eval.ts"
import evalExpected from "virtual:source/src/snippets/quickstart/eval.expected.txt"
import { bullets, code, codeBlock, definePage, h2, link, p } from "../../prose"
export const introduction = definePage({
  path: "/docs/start/introduction",
  title: "What is Generalist",
  navTitle: "What is Generalist",
  group: "Start",
  description:
    "Generalist is a TypeScript framework for building AI agents on Effect: agents are plain values, runs are typed event streams, and every seam is an Effect service with a deterministic test layer.",
  content: [
    p(
      "Generalist is a TypeScript framework for building AI agents on Effect, built on ",
      code("effect/unstable/ai"),
      ", and it covers what an agent needs beyond a model call: turn iteration, permissions, human approval as typed suspension, steering, and deterministic test seams. An agent is a plain value: a name, instructions, a toolkit, and a turn policy. Run it directly through generalist for process-local work, or use generalist/runtime for addressable runs, durable waits, canonical event replay, and database-backed recovery.",
    ),
    p(
      "Every capability is an Effect service. A run always needs a language model; local tools add their Effect AI handler layer; placement, approvals, middleware, permissions, memory, skills, compaction, and steering are optional seams discovered at runtime. Absent means default behavior, and every behavior-bearing seam ships a test layer, so agents run deterministically in CI with zero credentials.",
    ),
    h2("a-complete-program", "A complete program"),
    p(
      "This runs an agent against the deterministic provider and asserts on its answer: no API key, exit code 0 on success.",
    ),
    codeBlock({ label: "eval.ts", source: evalSource, expectedOutput: evalExpected }),
    h2("when-to-use-generalist", "When to use Generalist"),
    bullets(
      "Process-local agents: CLIs, scripts, servers, and tests can run generalist without external infrastructure.",
      "Human-in-the-loop flows: approval-gated tools suspend the run as a typed error carrying a resume token.",
      "Hosted agents: generalist/server exposes Host Sessions and Runs through one typed HttpApi with HTTP, SSE, WebSocket, bearer authentication, and OpenAPI.",
      "Deterministic CI: scripted models and test layers on every seam make agent behavior assertable.",
    ),
    h2("non-goals", "Non-goals"),
    p(
      "Generalist is not a general-purpose workflow engine, project scaffold, or hosted platform. generalist/runtime owns agent-run durability and storage adapters; wider application orchestration and deployment remain yours.",
    ),
    h2("where-runtime-fits", "Where generalist/runtime fits"),
    p(
      "generalist/runtime composes the core agent loop into finite, addressable runs. It owns idempotent admission, persisted RunEvents, waits and signals, cancellation, inspection, and recovery. Use its memory layer for local development, SQLite for durable single-process execution, or PostgreSQL/MySQL for durable multi-worker execution. ",
      link("/docs/learn/native-runtime", "Core and Runtime: where durability lives"),
      " covers the package boundary in depth.",
    ),
    h2("next-steps", "Next steps"),
    bullets(
      ["Install the packages: ", link("/docs/start/installation", "Installation"), "."],
      ["Build a tool-calling agent and a CI eval in five minutes: ", link("/docs/start/quickstart", "Quickstart"), "."],
      ["Understand the loop itself: ", link("/docs/learn/agent-loop", "The agent loop"), "."],
    ),
  ],
})
