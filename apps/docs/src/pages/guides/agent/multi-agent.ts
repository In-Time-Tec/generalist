import agentAsTool from "virtual:source/src/snippets/guides/agent/multi-agent/as-tool.ts"
import agentAsToolExpected from "virtual:source/src/snippets/guides/agent/multi-agent/as-tool.expected.txt"
import fanOut from "virtual:source/src/snippets/guides/agent/multi-agent/fan-out.ts"
import fanOutExpected from "virtual:source/src/snippets/guides/agent/multi-agent/fan-out.expected.txt"
import supervisor from "virtual:source/src/snippets/guides/agent/multi-agent/supervisor.ts"
import supervisorExpected from "virtual:source/src/snippets/guides/agent/multi-agent/supervisor.expected.txt"
import { bullets, callout, code, codeBlock, definePage, h2, link, p, table } from "../../../prose"

const childChannels = `Parent Agent.generate
│
├── Channel 1: Effect Context (inherited by nested child effect)
│   ├── LanguageModel.LanguageModel
│   ├── ToolExecutor / Approvals
│   └── ModelMiddleware and other required services
│
└── AgentTool handler ──▶ Child Agent.generate({ prompt })
    │
    └── Channel 2: run options / orchestration (not implicitly inherited)
        ├── omitted sessionId means no Session
        └── transport runId, queue, and scheduling remain transport-owned`

export const multiAgent = definePage({
  path: "/docs/guides/multi-agent",
  title: "How to coordinate multiple agents",
  navTitle: "Coordinate multiple agents",
  group: "Guides",
  description:
    "Fan out child runs with Handoff.fanOut, route through a transfer-tool supervisor, and expose any agent as a tool with AgentTool.asTool.",
  content: [
    p(
      "tenetkit multi-agent helpers are same-process and non-durable: they compose ",
      code("Agent.generate"),
      ", toolkits, and the ",
      code("ToolExecutor"),
      " seam rather than adding a second execution model. For durable, addressable parent and child Runs, use tenetkit/runtime; see ",
      link("/docs/learn/native-runtime", "Core and Runtime"),
      ".",
    ),
    h2("two-channels", "Context services and run identity are separate channels"),
    p(
      "A nested child effect evaluates in the current Effect Context, so its service requirements remain ambient. That does not copy values out of the parent's ",
      code("RunOptions"),
      ": child Session identity is an argument to the child call, while transport identity and scheduling remain owned by the transport that launched the parent.",
    ),
    codeBlock({ label: "Parent and child channels", language: "text", source: childChannels }),
    table(
      ["Value or service", "Owner", "What the child receives"],
      [
        [
          [code("LanguageModel.LanguageModel")],
          "Effect Context",
          [
            "An unpinned child uses the ambient service; a child with ",
            code("agent.model"),
            " resolves it through the ambient ModelRegistry",
          ],
        ],
        [[code("ToolExecutor")], "Effect Context", "The ambient optional executor"],
        [[code("Approvals")], "Effect Context", "The ambient optional approval service"],
        [[code("ModelMiddleware")], "Effect Context", "The ambient optional middleware service"],
        [
          [code("sessionId")],
          ["Child ", code("RunOptions")],
          "Not inherited; omission leaves the child ephemeral, while requesting the active parent's ID fails before model execution",
        ],
        [
          [code("runId")],
          "Transport",
          "Not inherited; a core child invocation does not join the parent's transport run",
        ],
        [
          "Queue position",
          "Transport",
          "Not inherited; the child tool effect does not enter the parent's transport queue",
        ],
        [
          "Scheduling and run permits",
          "Transport",
          "No separate schedule or permit; the scoped child runs while the parent continues to hold its permit",
        ],
      ],
    ),
    h2("fan-out-child-runs", "1. Fan out child runs"),
    p(
      code("Handoff.fanOut"),
      " runs registered child agents concurrently with ",
      code("Effect.forEach"),
      " semantics: bounded concurrency (default 4) and results in input order. It is not a tool boundary, so child failures propagate to the caller as run errors.",
    ),
    codeBlock({ label: "fan-out.ts", source: fanOut, expectedOutput: fanOutExpected }),
    h2("route-through-a-supervisor", "2. Route through a supervisor"),
    p(
      code("Handoff.supervisor"),
      " builds one ",
      code("transfer_to_<specialist>"),
      " tool per specialist, an agent whose toolkit advertises them, and a handled toolkit for ",
      code("ToolExecutor.layerToolkit"),
      ". The transfer tool is a routing convention: the supervisor's model still decides when to call it.",
    ),
    codeBlock({ label: "supervisor.ts", source: supervisor, expectedOutput: supervisorExpected }),
    callout(
      "info",
      "Registrations close services",
      "Register each specialist with Handoff.register(agent, layer) before passing it to fan-out or a supervisor. The registration provides the agent's required services and maps layer-construction failures to RegistrationError; run options remain explicit and are forwarded unchanged.",
    ),
    h2("expose-an-agent-as-a-tool", "3. Expose an agent as a tool"),
    p(
      code("AgentTool.asTool"),
      " is the primitive under both handoff helpers: it wraps an agent in a handled toolkit containing one tool. Defaults are the agent's name, ",
      code("{ prompt: string }"),
      " parameters, and ",
      code("result.text"),
      " as the output. Override any of them.",
    ),
    p(
      "Inside the handler the child invocation is ",
      code("Agent.generate(summarizer, { prompt })"),
      ". The runnable example supplies the model, toolkit handler, executor, approvals, and middleware with the surrounding ",
      code("Effect.provide"),
      ". Because the child call omits ",
      code("sessionId"),
      ", it has no Session and uses a fresh chat. It does not share the parent's transcript or enter its transport queue.",
    ),
    codeBlock({ label: "agent-as-tool.ts", source: agentAsTool, expectedOutput: agentAsToolExpected }),
    bullets(
      [
        "At the tool boundary, child run failures become failed tool results with a string message, so the parent's model can recover.",
      ],
      [
        "Child suspension is collapsed into a failed tool result: a child's ",
        code("AgentSuspended"),
        " does not suspend the parent or create a second suspension protocol (",
        link("/docs/learn/suspension", "Suspension as a typed error"),
        ").",
      ],
    ),
    p(
      "The runnable version of this page is ",
      link("https://github.com/In-Time-Tec/tenetkit/tree/main/examples/multi-agent", "examples/multi-agent"),
      "; contracts for ",
      code("Handoff"),
      " and ",
      code("AgentTool"),
      " are in ",
      link("/docs/reference/core-context", "the context seams reference"),
      ".",
    ),
  ],
})
