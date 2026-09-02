import agentAsTool from "virtual:source/src/snippets/guides/agent/multi-agent/as-tool.ts"
import agentAsToolExpected from "virtual:source/src/snippets/guides/agent/multi-agent/as-tool.expected.txt"
import fanOut from "virtual:source/src/snippets/guides/agent/multi-agent/fan-out.ts"
import fanOutExpected from "virtual:source/src/snippets/guides/agent/multi-agent/fan-out.expected.txt"
import supervisor from "virtual:source/src/snippets/guides/agent/multi-agent/supervisor.ts"
import supervisorExpected from "virtual:source/src/snippets/guides/agent/multi-agent/supervisor.expected.txt"
import { bullets, callout, code, codeBlock, definePage, h2, link, p, table } from "../../../prose"

const childChannels = `Parent Agent.run
│
├── Channel 1: Effect Context (inherited by nested child effect)
│   ├── LanguageModel.LanguageModel
│   ├── ToolExecutor / Approvals
│   └── ModelMiddleware and other required services
│
└── AgentTool handler ──▶ Child Agent.run(prompt)
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
    "Fan out typed child Agents, delegate durable work from a parent model, route through a supervisor, and expose one Agent as a tool.",
  content: [
    p(
      code("Agent.fanOut"),
      " runs typed children in the current process. ",
      code("AgentTool.fanOut"),
      " gives the parent model the same fan-out shape and, under generalist/runtime, admits addressable child Runs through the existing durable child-group journal. See ",
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
            "The child inherits the ambient model by default; pass a model layer as the ",
            code("model"),
            " option of ",
            code("AgentTool.asTool"),
            " or ",
            code("Handoff.target"),
            " to give the child its own model",
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
      code("Agent.fanOut"),
      " runs ",
      code("Agent.child(agent, input)"),
      " values concurrently with ",
      code("Effect.forEach"),
      " semantics: explicit bounded concurrency and typed Exit results in input order. Collect keeps one failed Exit in the result; fail-fast interrupts sibling fibers and fails the effect.",
    ),
    codeBlock({ label: "fan-out.ts", source: fanOut, expectedOutput: fanOutExpected }),
    p(
      code("AgentTool.fanOut({ name, description, agents, maxChildren })"),
      " declares a model-callable fan-out without a static handler. A Runtime reserves each durable child's share from the parent budget, reports children from ",
      code("runtime.inspect(parentRunId)"),
      ", and reattaches the parent to the same group after restart. Collect encodes child failures for the model; fail-fast requests sibling cancellation and fails the parent.",
    ),
    h2("route-through-a-supervisor", "2. Route through a supervisor"),
    p(
      code("Handoff.supervisor"),
      " builds one ",
      code("handoff_to_<specialist>"),
      " tool per specialist, an agent whose toolkit advertises them, and a handled toolkit for ",
      code("ToolExecutor.layerToolkit"),
      ". The handoff tool is a routing convention: the supervisor's model still decides when to call it.",
    ),
    codeBlock({ label: "supervisor.ts", source: supervisor, expectedOutput: supervisorExpected }),
    callout(
      "info",
      "Handoff registrations close services",
      "Register each Handoff specialist with Handoff.register(agent, layer) before passing it to a supervisor. The registration provides the agent's required services and maps layer-construction failures to RegistrationError; run options remain explicit and are forwarded unchanged.",
    ),
    p(
      "Specialists inherit the model provided to the supervisor's run. To route one specialist to a different model, pass a closed model layer — for example a provider's ",
      code("layerModel"),
      " over its ",
      code("layerConfig"),
      " client — as the ",
      code("model"),
      " option of ",
      code("Handoff.target(agent, { model })"),
      ". The supervisor keeps the ambient model; only that specialist's turns run on the override. See ",
      link("/docs/guides/providers", "How to provide model providers"),
      ".",
    ),
    h2("expose-an-agent-as-a-tool", "3. Expose an agent as a tool"),
    p(
      code("AgentTool.asTool"),
      " is the primitive under both handoff helpers: it wraps an agent in a handled toolkit containing one tool. Defaults are the agent's name, ",
      code("{ prompt: string }"),
      " parameters, and ",
      code("result"),
      " as the output. Override any of them.",
    ),
    p(
      "Inside the handler the child invocation is ",
      code("Agent.run(summarizer, prompt)"),
      ". The runnable example supplies the model, toolkit handler, executor, permissions, approvals, and middleware with the surrounding ",
      code("Effect.provide"),
      ". Because the child call omits ",
      code("sessionId"),
      ", it has no Session and uses a fresh chat. It does not share the parent's transcript or enter its transport queue. Pass ",
      code("asTool(child, { model: childModelLayer })"),
      " to run the child on a different model than the parent.",
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
      link("https://github.com/In-Time-Tec/generalist/tree/main/examples/multi-agent", "examples/multi-agent"),
      "; contracts for ",
      code("Agent"),
      ", ",
      code("Handoff"),
      " and ",
      code("AgentTool"),
      " are in ",
      link("/docs/reference/core-context", "the context seams reference"),
      ".",
    ),
  ],
})
