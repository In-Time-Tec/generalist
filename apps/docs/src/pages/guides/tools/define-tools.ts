import executor from "virtual:source/src/snippets/guides/tools/define-tools/executor.ts"
import progressHandler from "virtual:source/src/snippets/guides/tools/define-tools/progress-handler.ts"
import runAgent from "virtual:source/src/snippets/guides/tools/define-tools/run-agent.ts"
import runAgentExpected from "virtual:source/src/snippets/guides/tools/define-tools/run-agent.expected.txt"
import searchTool from "virtual:source/src/snippets/guides/tools/define-tools/search-tool.ts"
import spillLargeOutputs from "virtual:source/src/snippets/guides/tools/define-tools/spill-large-outputs.ts"
import { bullets, callout, code, codeBlock, definePage, h2, link, p } from "../../../prose"
export const defineTools = definePage({
  path: "/docs/guides/define-tools",
  title: "How to define tools and toolkits",
  navTitle: "Define tools",
  group: "Guides",
  description:
    "Define tools with Tool.make, implement handlers behind your own services, and provide the Effect AI toolkit handler layer.",
  content: [
    p(
      "TenetKit uses Effect AI tools directly: the model sees the toolkit attached to the agent, and ordinary in-process execution comes from ",
      code("toolkit.toLayer"),
      ". This guide defines a tool, implements its handler behind a service you own, provides the handler layer, and proves the loop calls it. ",
      link("/docs/learn/agent-loop", "The agent loop"),
      " explains how tool results feed the next turn.",
    ),
    h2("describe-the-tool", "1. Describe the tool for the model"),
    p(
      "Give ",
      code("Tool.make"),
      " the parameter and success Schemas, and put the real work behind a service so the external call stays swappable in tests. ",
      code("dependencies"),
      " declares that service requirement on the handler; ",
      code('failureMode: "return"'),
      " reports handler failures back to the model as failed tool results instead of failing the run.",
    ),
    codeBlock({ label: "search-tool.ts", source: searchTool }),
    h2("build-the-handler-layer", "2. Build the handler layer"),
    p("Attach handlers with ", code("toolkit.toLayer"), " and provide your service layer to it:"),
    codeBlock({ label: "executor.ts", source: executor }),
    callout(
      "info",
      "Use ToolExecutor only for placement overrides",
      "Most tools need only the ",
      code("toolkit.toLayer"),
      " handler layer. Provide ",
      code("ToolExecutor"),
      " when a host needs to route a tool call to a client, remote worker, MCP server, sandbox, or durable wait. See ",
      link("/docs/learn/seams-as-services", "Seams as services"),
      ".",
    ),
    h2("run-the-agent", "3. Run the agent against the toolkit"),
    p(
      "Attach the toolkit to the agent and provide the model plus the handler layer. The scripted model makes this deterministic: it requests ",
      code("search_docs"),
      " on turn 0 and answers from the result on turn 1, with zero credentials:",
    ),
    codeBlock({ label: "run-agent.ts", source: runAgent, expectedOutput: runAgentExpected }),
    h2("report-progress", "4. Report progress and honor cancellation"),
    p(
      "Inside a handler, resolve ",
      code("ToolContext.ToolContext"),
      " to emit progress updates (they surface as ",
      code("ToolProgress"),
      " events on the run stream), and pass ",
      code("context.signal"),
      " to abortable work so interrupting the run cancels the underlying request:",
    ),
    codeBlock({ label: "progress-handler.ts", source: progressHandler }),
    h2("spill-large-outputs", "5. Bound large tool outputs"),
    p(
      "When a tool can return more than you want in context, set ",
      code("RunOptions.toolOutputMaxBytes"),
      " and provide a ",
      code("Store"),
      ". Successful results over the limit are replaced by a bounded ",
      code("Output"),
      " value, ",
      code("{ inline: { truncated, bytes, maxBytes, preview }, outputPaths }"),
      " pointing at the spilled content:",
    ),
    codeBlock({ label: "spill-large-outputs.ts", source: spillLargeOutputs }),
    p(
      code("ToolOutput.layerMemory"),
      " keeps spilled outputs in process memory; a host with real storage implements ",
      code("Store"),
      " with one ",
      code("put"),
      " method. Without a store in context, results pass through unchanged.",
    ),
    h2("next-steps", "Next steps"),
    bullets(
      [
        "Gate a tool behind a human decision: ",
        link("/docs/guides/approvals", "How to require human approval for a tool"),
        ".",
      ],
      [
        "Allow, deny, or ask by pattern: ",
        link("/docs/guides/permissions", "How to gate tools with permission rules"),
        ".",
      ],
      [
        "Script executors and models in CI: ",
        link("/docs/guides/testing-evals", "How to test agents and run evals in CI"),
        ".",
      ],
    ),
  ],
})
