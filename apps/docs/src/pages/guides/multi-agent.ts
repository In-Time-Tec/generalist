import agentAsTool from "../../snippets/guides/multi-agent/agent-as-tool.ts?raw"
import agentAsToolExpected from "../../snippets/guides/multi-agent/agent-as-tool.expected.txt?raw"
import fanOut from "../../snippets/guides/multi-agent/fan-out.ts?raw"
import fanOutExpected from "../../snippets/guides/multi-agent/fan-out.expected.txt?raw"
import supervisor from "../../snippets/guides/multi-agent/supervisor.ts?raw"
import supervisorExpected from "../../snippets/guides/multi-agent/supervisor.expected.txt?raw"
import { bullets, callout, code, codeBlock, definePage, h2, link, p } from "../../prose"
export const multiAgent = definePage({
  path: "/docs/guides/multi-agent",
  title: "How to coordinate multiple agents",
  navTitle: "Coordinate multiple agents",
  group: "Guides",
  description:
    "Fan out child runs with Handoff.fanOut, route through a transfer-tool supervisor, and expose any agent as a tool with AgentTool.asTool.",
  content: [
    p(
      "Baton's multi-agent support is same-process and non-durable: it composes ",
      code("Agent.generate"),
      ", toolkits, and the ",
      code("ToolExecutor"),
      " seam rather than adding a new runtime. Durable, addressable, cross-process child executions belong to a host runtime; see ",
      link("/docs/learn/baton-and-relay", "Baton and Relay"),
      ".",
    ),
    h2("fan-out-child-runs", "1. Fan out child runs"),
    p(
      code("Handoff.fanOut"),
      " runs isolated child agents concurrently with ",
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
      code("ToolExecutor.fromToolkit"),
      ". The transfer tool is a routing convention: the supervisor's model still decides when to call it.",
    ),
    codeBlock({ label: "supervisor.ts", source: supervisor, expectedOutput: supervisorExpected }),
    callout(
      "info",
      "Children inherit the parent's services",
      "Child runs execute in the current Effect context: the same model, executor, approvals, and middleware the parent run sees. To give a child a different model, provide a different layer around its handler.",
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
    codeBlock({ label: "agent-as-tool.ts", source: agentAsTool, expectedOutput: agentAsToolExpected }),
    bullets(
      [
        "At the tool boundary, child run failures become failed tool results with a string message, so the parent's model can recover.",
      ],
      [
        "Child suspension is not collapsed: a child's ",
        code("AgentSuspended"),
        " propagates through the executor's ",
        code("Suspend"),
        " outcome, and the parent run suspends with the child's token (",
        link("/docs/learn/suspension", "Suspension as a typed error"),
        ").",
      ],
    ),
    p(
      "The runnable version of this page is ",
      link("https://github.com/In-Time-Tec/batonfx/tree/main/examples/multi-agent", "examples/multi-agent"),
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
