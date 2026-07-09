import executor from "../../snippets/guides/define-tools/executor.ts?raw"
import progressHandler from "../../snippets/guides/define-tools/progress-handler.ts?raw"
import runAgent from "../../snippets/guides/define-tools/run-agent.ts?raw"
import runAgentExpected from "../../snippets/guides/define-tools/run-agent.expected.txt?raw"
import searchTool from "../../snippets/guides/define-tools/search-tool.ts?raw"
import spillLargeOutputs from "../../snippets/guides/define-tools/spill-large-outputs.ts?raw"
import { bullets, callout, code, codeBlock, definePage, h2, link, p } from "../../prose"
export const defineTools = definePage({
  path: "/docs/guides/define-tools",
  title: "How to define tools and toolkits",
  navTitle: "Define tools",
  group: "Guides",
  description:
    "Define tools with Tool.make, implement handlers behind your own services, and turn a handled toolkit into the ToolExecutor layer.",
  content: [
    p(
      "Batonfx separates tool advertisement from tool execution: the model sees the toolkit attached to the agent, and the ",
      code("ToolExecutor"),
      " service decides how each call actually runs. This guide defines a tool, implements its handler behind a service you own, builds the executor layer, and proves the loop calls it. ",
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
    h2("build-the-executor", "2. Build the ToolExecutor layer"),
    p(
      "Attach handlers with ",
      code("toolkit.toLayer"),
      ", then turn the handled toolkit into the executor layer with ",
      code("ToolExecutor.fromToolkit"),
      ". The ",
      code("Layer.unwrap"),
      " dance resolves the handled toolkit once and provides your service to it:",
    ),
    codeBlock({ label: "executor.ts", source: executor }),
    callout(
      "info",
      "Every run needs an executor",
      "The executor is one of the four required layers. Provide ",
      code("ToolExecutor.fromToolkit"),
      " for real handlers, or ",
      code("ToolExecutor.testLayer"),
      " to script outcomes in tests. See ",
      link("/docs/learn/seams-as-services", "Seams as services"),
      ".",
    ),
    h2("run-the-agent", "3. Run the agent against the toolkit"),
    p(
      "Attach the toolkit to the agent and provide the four layers. The scripted model makes this deterministic: it requests ",
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
      code("ToolOutputStore"),
      ". Successful results over the limit are replaced by an inline envelope, ",
      code("{ truncated, bytes, maxBytes, preview }"),
      ", plus ",
      code("outputPaths"),
      " pointing at the spilled content:",
    ),
    codeBlock({ label: "spill-large-outputs.ts", source: spillLargeOutputs }),
    p(
      code("ToolOutput.layerMemory"),
      " keeps spilled outputs in process memory; a host with real storage implements ",
      code("ToolOutputStore"),
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
