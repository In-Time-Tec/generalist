import executor from "../../snippets/guides/define-tools/executor.ts?raw"
import progressHandler from "../../snippets/guides/define-tools/progress-handler.ts?raw"
import runAgent from "../../snippets/guides/define-tools/run-agent.ts?raw"
import runAgentExpected from "../../snippets/guides/define-tools/run-agent.expected.txt?raw"
import searchTool from "../../snippets/guides/define-tools/search-tool.ts?raw"
import spillLargeOutputs from "../../snippets/guides/define-tools/spill-large-outputs.ts?raw"
import * as Prose from "../../prose"

export const defineTools = Prose.definePage({
  path: "/docs/guides/define-tools",
  title: "How to define tools and toolkits",
  navTitle: "Define tools",
  group: "Guides",
  description:
    "Define tools with Ai.Tool.make, implement handlers behind your own services, and turn a handled toolkit into the ToolExecutor layer.",
  content: [
    Prose.p(
      "Batonfx separates tool advertisement from tool execution: the model sees the toolkit attached to the agent, and the ",
      Prose.code("ToolExecutor"),
      " service decides how each call actually runs. This guide defines a tool, implements its handler behind a service you own, builds the executor layer, and proves the loop calls it. ",
      Prose.link("/docs/learn/agent-loop", "The agent loop"),
      " explains how tool results feed the next turn.",
    ),
    Prose.h2("describe-the-tool", "1. Describe the tool for the model"),
    Prose.p(
      "Give ",
      Prose.code("Ai.Tool.make"),
      " the parameter and success Schemas, and put the real work behind a service so the external call stays swappable in tests. ",
      Prose.code("dependencies"),
      " declares that service requirement on the handler; ",
      Prose.code('failureMode: "return"'),
      " reports handler failures back to the model as failed tool results instead of failing the run.",
    ),
    Prose.codeBlock({ label: "search-tool.ts", source: searchTool }),
    Prose.h2("build-the-executor", "2. Build the ToolExecutor layer"),
    Prose.p(
      "Attach handlers with ",
      Prose.code("toolkit.toLayer"),
      ", then turn the handled toolkit into the executor layer with ",
      Prose.code("ToolExecutor.fromToolkit"),
      ". The ",
      Prose.code("Layer.unwrap"),
      " dance resolves the handled toolkit once and provides your service to it:",
    ),
    Prose.codeBlock({ label: "executor.ts", source: executor }),
    Prose.callout(
      "info",
      "Every run needs an executor",
      "The executor is one of the four required layers. Provide ",
      Prose.code("ToolExecutor.fromToolkit"),
      " for real handlers, or ",
      Prose.code("ToolExecutor.testLayer"),
      " to script outcomes in tests. See ",
      Prose.link("/docs/learn/seams-as-services", "Seams as services"),
      ".",
    ),
    Prose.h2("run-the-agent", "3. Run the agent against the toolkit"),
    Prose.p(
      "Attach the toolkit to the agent and provide the four layers. The scripted model makes this deterministic: it requests ",
      Prose.code("search_docs"),
      " on turn 0 and answers from the result on turn 1, with zero credentials:",
    ),
    Prose.codeBlock({ label: "run-agent.ts", source: runAgent, expectedOutput: runAgentExpected }),
    Prose.h2("report-progress", "4. Report progress and honor cancellation"),
    Prose.p(
      "Inside a handler, resolve ",
      Prose.code("ToolContext.ToolContext"),
      " to emit progress updates (they surface as ",
      Prose.code("ToolProgress"),
      " events on the run stream), and pass ",
      Prose.code("context.signal"),
      " to abortable work so interrupting the run cancels the underlying request:",
    ),
    Prose.codeBlock({ label: "progress-handler.ts", source: progressHandler }),
    Prose.h2("spill-large-outputs", "5. Bound large tool outputs"),
    Prose.p(
      "When a tool can return more than you want in context, set ",
      Prose.code("RunOptions.toolOutputMaxBytes"),
      " and provide a ",
      Prose.code("ToolOutputStore"),
      ". Successful results over the limit are replaced by an inline envelope, ",
      Prose.code("{ truncated, bytes, maxBytes, preview }"),
      ", plus ",
      Prose.code("outputPaths"),
      " pointing at the spilled content:",
    ),
    Prose.codeBlock({ label: "spill-large-outputs.ts", source: spillLargeOutputs }),
    Prose.p(
      Prose.code("ToolOutput.layerMemory"),
      " keeps spilled outputs in process memory; a host with real storage implements ",
      Prose.code("ToolOutputStore"),
      " with one ",
      Prose.code("put"),
      " method. Without a store in context, results pass through unchanged.",
    ),
    Prose.h2("next-steps", "Next steps"),
    Prose.bullets(
      [
        "Gate a tool behind a human decision: ",
        Prose.link("/docs/guides/approvals", "How to require human approval for a tool"),
        ".",
      ],
      [
        "Allow, deny, or ask by pattern: ",
        Prose.link("/docs/guides/permissions", "How to gate tools with permission rules"),
        ".",
      ],
      [
        "Script executors and models in CI: ",
        Prose.link("/docs/guides/testing-evals", "How to test agents and run evals in CI"),
        ".",
      ],
    ),
  ],
})
