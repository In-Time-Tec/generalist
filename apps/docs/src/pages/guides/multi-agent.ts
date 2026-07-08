import agentAsTool from "../../snippets/guides/multi-agent/agent-as-tool.ts?raw"
import agentAsToolExpected from "../../snippets/guides/multi-agent/agent-as-tool.expected.txt?raw"
import fanOut from "../../snippets/guides/multi-agent/fan-out.ts?raw"
import fanOutExpected from "../../snippets/guides/multi-agent/fan-out.expected.txt?raw"
import supervisor from "../../snippets/guides/multi-agent/supervisor.ts?raw"
import supervisorExpected from "../../snippets/guides/multi-agent/supervisor.expected.txt?raw"
import * as Prose from "../../prose"

export const multiAgent = Prose.definePage({
  path: "/docs/guides/multi-agent",
  title: "How to coordinate multiple agents",
  navTitle: "Coordinate multiple agents",
  group: "Guides",
  description:
    "Fan out child runs with Handoff.fanOut, route through a transfer-tool supervisor, and expose any agent as a tool with AgentTool.asTool.",
  content: [
    Prose.p(
      "Baton's multi-agent support is same-process and non-durable: it composes ",
      Prose.code("Agent.generate"),
      ", toolkits, and the ",
      Prose.code("ToolExecutor"),
      " seam rather than adding a new runtime. Durable, addressable, cross-process child executions belong to a host runtime — see ",
      Prose.link("/docs/learn/baton-and-relay", "Baton and Relay"),
      ".",
    ),
    Prose.h2("fan-out-child-runs", "1. Fan out child runs"),
    Prose.p(
      Prose.code("Handoff.fanOut"),
      " runs isolated child agents concurrently with ",
      Prose.code("Effect.forEach"),
      " semantics: bounded concurrency (default 4) and results in input order. It is not a tool boundary, so child failures propagate to the caller as run errors.",
    ),
    Prose.codeBlock({ label: "fan-out.ts", source: fanOut, expectedOutput: fanOutExpected }),
    Prose.h2("route-through-a-supervisor", "2. Route through a supervisor"),
    Prose.p(
      Prose.code("Handoff.supervisor"),
      " builds one ",
      Prose.code("transfer_to_<specialist>"),
      " tool per specialist, an agent whose toolkit advertises them, and a handled toolkit for ",
      Prose.code("ToolExecutor.fromToolkit"),
      ". The transfer tool is a routing convention — the supervisor's model still decides when to call it.",
    ),
    Prose.codeBlock({ label: "supervisor.ts", source: supervisor, expectedOutput: supervisorExpected }),
    Prose.callout(
      "info",
      "Children inherit the parent's services",
      "Child runs execute in the current Effect context: the same model, executor, approvals, and middleware the parent run sees. To give a child a different model, provide a different layer around its handler.",
    ),
    Prose.h2("expose-an-agent-as-a-tool", "3. Expose an agent as a tool"),
    Prose.p(
      Prose.code("AgentTool.asTool"),
      " is the primitive under both handoff helpers: it wraps an agent in a handled toolkit containing one tool. Defaults are the agent's name, ",
      Prose.code("{ prompt: string }"),
      " parameters, and ",
      Prose.code("result.text"),
      " as the output — override any of them.",
    ),
    Prose.codeBlock({ label: "agent-as-tool.ts", source: agentAsTool, expectedOutput: agentAsToolExpected }),
    Prose.bullets(
      [
        "At the tool boundary, child run failures become failed tool results with a string message, so the parent's model can recover.",
      ],
      [
        "Child suspension is not collapsed: a child's ",
        Prose.code("AgentSuspended"),
        " propagates through the executor's ",
        Prose.code("Suspend"),
        " outcome, and the parent run suspends with the child's token (",
        Prose.link("/docs/learn/suspension", "Suspension as a typed error"),
        ").",
      ],
    ),
    Prose.p(
      "The runnable version of this page is ",
      Prose.link("https://github.com/In-Time-Tec/batonfx/tree/main/examples/multi-agent", "examples/multi-agent"),
      "; contracts for ",
      Prose.code("Handoff"),
      " and ",
      Prose.code("AgentTool"),
      " are in ",
      Prose.link("/docs/reference/core-context", "the context seams reference"),
      ".",
    ),
  ],
})
