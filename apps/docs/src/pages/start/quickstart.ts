import step1 from "../../snippets/quickstart/step-1.sh?raw"
import step2 from "../../snippets/quickstart/step-2.ts?raw"
import step2Expected from "../../snippets/quickstart/step-2.expected.txt?raw"
import step3 from "../../snippets/quickstart/step-3.ts?raw"
import step3Expected from "../../snippets/quickstart/step-3.expected.txt?raw"
import step4 from "../../snippets/quickstart/step-4.ts?raw"
import step4Expected from "../../snippets/quickstart/step-4.expected.txt?raw"
import step5 from "../../snippets/quickstart/step-5.ts?raw"
import step5Expected from "../../snippets/quickstart/step-5.expected.txt?raw"
import evalSource from "../../snippets/quickstart/eval.ts?raw"
import evalExpected from "../../snippets/quickstart/eval.expected.txt?raw"
import { bullets, callout, code, codeBlock, definePage, h2, lead, link, p } from "../../prose"
export const quickstart = definePage({
  path: "/docs/start/quickstart",
  title: "Quickstart: your first agent",
  navTitle: "Quickstart",
  group: "Start",
  description:
    "Build a tool-calling weather agent and a CI eval in about five minutes, with zero API keys, using a scripted model and the deterministic provider.",
  content: [
    lead(
      "In this quickstart we build a tool-calling weather agent and a CI eval, with zero API keys. About five minutes.",
    ),
    p("You will learn how to:"),
    bullets(
      "Define an Agent value",
      "Provide the model and tool handler layers this run needs",
      "Watch the event stream",
      "Run a deterministic eval",
    ),
    h2("step-1-create-the-project", "Step 1: Create the project"),
    codeBlock({ label: "Terminal", language: "bash", source: step1 }),
    p(
      "The install summary lists ",
      code("tenetkit@0.14.0"),
      " and ",
      code("tenetkit/ai@0.14.0"),
      ". npm and pnpm work the same way; ",
      link("/docs/start/installation", "Installation"),
      " has the variants.",
    ),
    h2("step-2-define-the-agent", "Step 2: Define the agent"),
    p("Replace ", code("index.ts"), " with a tool and an agent, then run ", code("bun run index.ts"), ":"),
    codeBlock({ label: "index.ts", source: step2, expectedOutput: step2Expected }),
    p("Notice nothing is running yet: an Agent is a plain value, not a service."),
    h2("step-3-script-a-model", "Step 3: Script a model"),
    p(
      "Add a scripted model layer above the log. It calls our tool on the first model call and answers on the second. That is the whole loop with zero credentials:",
    ),
    codeBlock({ label: "index.ts", source: step3, expectedOutput: step3Expected }),
    p(
      "Run it again and the file still only prints values: the model layer is as inert as the agent until a run provides it.",
    ),
    h2("step-4-provide-the-layers-and-run", "Step 4: Provide the layers and run"),
    p(
      "Replace the log line with the layer stack and a program that runs the agent, then run ",
      code("bun run index.ts"),
      ":",
    ),
    codeBlock({ label: "index.ts", source: step4, expectedOutput: step4Expected }),
    callout(
      "info",
      "The base run is small",
      "A TenetKit run always needs a model. A tool-calling run also needs the Effect AI handler layer for its toolkit. ToolExecutor, approvals, middleware, permissions, memory, skills, compaction, and steering are optional seams: absent means default behavior. ",
      link("/docs/learn/seams-as-services", "Seams as services"),
      " explains the two-tier model.",
    ),
    bullets(
      [
        code("Ai.LanguageModel.LanguageModel"),
        ": the model, either a direct layer like ours or supplied per run by ",
        code("ModelRegistry.operate"),
        ".",
      ],
      [
        code("toolkit.toLayer({ ...handlers })"),
        ": required only when the active toolkit has in-process tools to execute.",
      ],
      [
        code("ToolExecutor.ToolExecutor"),
        ": optional override for durable waits, client tools, remote workers, MCP, or sandboxes.",
      ],
      [code("Approvals.Approvals"), ": optional; only needed for tools that declare ", code("needsApproval"), "."],
      [code("ModelMiddleware.ModelMiddleware"), ": optional; absent means identity."],
    ),
    h2("step-5-watch-the-loop", "Step 5: Watch the loop"),
    p(
      code("Agent.generate"),
      " is a fold over the primitive: ",
      code("Agent.stream"),
      ". Replace the ",
      code("program"),
      " definition to print every semantic and lifecycle event tag, filtering the tentative provider parts that only direct process-local observers need, then run ",
      code("bun run index.ts"),
      ":",
    ),
    codeBlock({ label: "index.ts", source: step5, expectedOutput: step5Expected }),
    p(
      "Two turns, in order: the first normalized response commits a tool call, the tool runs, its result is fed back, and the second normalized response commits the answer. ",
      code("Completed"),
      " carries the final text. ",
      link("/docs/learn/agent-loop", "The agent loop"),
      " explains the turn contract behind this sequence.",
    ),
    h2("step-6-make-it-an-eval", "Step 6: Make it an eval"),
    p("Create ", code("eval.ts"), " using the deterministic provider, then run ", code("bun run eval.ts"), ":"),
    codeBlock({ label: "eval.ts", source: evalSource, expectedOutput: evalExpected }),
    callout(
      "info",
      "The ModelRegistry.operate pattern",
      code("Deterministic.layer"),
      " registers a model in the ModelRegistry; ",
      code("ModelRegistry.operate(selection, effect)"),
      " supplies the actual LanguageModel per run. Swapping to a real model is the same shape with ",
      code("layer"),
      " (see ",
      link("/docs/guides/providers", "How to register real model providers"),
      "). The registry layer is never a LanguageModel layer by itself.",
    ),
    h2("success", "You have built an agent and an eval"),
    p(
      "You have built a tool-calling agent and a deterministic eval. ",
      code("bun run index.ts"),
      " prints the jacket answer and the event sequence ending in ",
      code("Completed"),
      "; ",
      code("bun run eval.ts"),
      " prints ",
      code("eval passed"),
      " and exits 0, all without an API key.",
    ),
    h2("next-steps", "Next steps"),
    bullets(
      ["Connect a real model: ", link("/docs/guides/providers", "How to register real model providers"), "."],
      [
        "Build the full app with approvals and a live UI: ",
        link("/docs/start/research-agent", "Tutorial: a research agent"),
        ".",
      ],
      ["Understand what just happened: ", link("/docs/learn/agent-loop", "The agent loop"), "."],
    ),
  ],
})
