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
import * as Prose from "../../prose"

export const quickstart = Prose.definePage({
  path: "/docs/start/quickstart",
  title: "Quickstart: your first agent",
  navTitle: "Quickstart",
  group: "Start",
  description:
    "Build a tool-calling weather agent and a CI eval in about five minutes — with zero API keys, using a scripted model and the deterministic provider.",
  content: [
    Prose.lead(
      "In this quickstart we build a tool-calling weather agent and a CI eval — with zero API keys. About five minutes.",
    ),
    Prose.p("You will learn how to:"),
    Prose.bullets(
      "Define an Agent value",
      "Provide the four layers every run needs",
      "Watch the event stream",
      "Run a deterministic eval",
    ),
    Prose.h2("step-1-create-the-project", "Step 1 — Create the project"),
    Prose.codeBlock({ label: "Terminal", language: "bash", source: step1 }),
    Prose.p(
      "The install summary lists ",
      Prose.code("@batonfx/core@0.1.1"),
      " and ",
      Prose.code("@batonfx/providers@0.1.1"),
      ". npm and pnpm work the same way — ",
      Prose.link("/docs/start/installation", "Installation"),
      " has the variants.",
    ),
    Prose.h2("step-2-define-the-agent", "Step 2 — Define the agent"),
    Prose.p(
      "Replace ",
      Prose.code("index.ts"),
      " with a tool and an agent, then run ",
      Prose.code("bun run index.ts"),
      ":",
    ),
    Prose.codeBlock({ label: "index.ts", source: step2, expectedOutput: step2Expected }),
    Prose.p("Notice nothing is running yet — an Agent is a plain value, not a service."),
    Prose.h2("step-3-script-a-model", "Step 3 — Script a model"),
    Prose.p(
      "Add a scripted model layer above the log. It calls our tool on the first model call and answers on the second — the whole loop with zero credentials:",
    ),
    Prose.codeBlock({ label: "index.ts", source: step3, expectedOutput: step3Expected }),
    Prose.p(
      "Run it again and the file still only prints values: the model layer is as inert as the agent until a run provides it.",
    ),
    Prose.h2("step-4-provide-the-four-layers-and-run", "Step 4 — Provide the four layers and run"),
    Prose.p(
      "Replace the log line with the layer stack and a program that runs the agent, then run ",
      Prose.code("bun run index.ts"),
      ":",
    ),
    Prose.codeBlock({ label: "index.ts", source: step4, expectedOutput: step4Expected }),
    Prose.callout(
      "info",
      "The 4 required layers",
      "Every Batonfx run needs exactly four services; this is the single most-repeated wiring in every Batonfx program. Everything else — permissions, memory, skills, compaction, steering — is optional: absent means default behavior. ",
      Prose.link("/docs/learn/seams-as-services", "Seams as services"),
      " explains the two-tier model.",
    ),
    Prose.bullets(
      [
        Prose.code("Ai.LanguageModel.LanguageModel"),
        " — the model: a direct layer like ours, or supplied per run by ",
        Prose.code("ModelRegistry.provide"),
        ".",
      ],
      [
        Prose.code("ToolExecutor.ToolExecutor"),
        " — even for agents with no tools; ",
        Prose.code("ToolExecutor.fromToolkit(agent.toolkit)"),
        " or a test layer.",
      ],
      [Prose.code("Approvals.Approvals"), " — ", Prose.code("Approvals.autoApprove"), " when nothing needs approval."],
      [
        Prose.code("ModelMiddleware.ModelMiddleware"),
        " — ",
        Prose.code("ModelMiddleware.identityLayer"),
        " when you have none.",
      ],
    ),
    Prose.h2("step-5-watch-the-loop", "Step 5 — Watch the loop"),
    Prose.p(
      Prose.code("Agent.generate"),
      " is a fold over the primitive: ",
      Prose.code("Agent.stream"),
      ". Replace the ",
      Prose.code("program"),
      " definition to print every event tag, then run ",
      Prose.code("bun run index.ts"),
      ":",
    ),
    Prose.codeBlock({ label: "index.ts", source: step5, expectedOutput: step5Expected }),
    Prose.p(
      "Two turns, in order: the first turn calls the tool and completes; the tool result is fed back; the second turn answers; ",
      Prose.code("Completed"),
      " carries the final text. ",
      Prose.link("/docs/learn/agent-loop", "The agent loop"),
      " explains the turn contract behind this sequence.",
    ),
    Prose.h2("step-6-make-it-an-eval", "Step 6 — Make it an eval"),
    Prose.p(
      "Create ",
      Prose.code("eval.ts"),
      " using the deterministic provider, then run ",
      Prose.code("bun run eval.ts"),
      ":",
    ),
    Prose.codeBlock({ label: "eval.ts", source: evalSource, expectedOutput: evalExpected }),
    Prose.callout(
      "info",
      "The ModelRegistry.provide pattern",
      Prose.code("Deterministic.withDeterministic"),
      " registers a model in the ModelRegistry; ",
      Prose.code("ModelRegistry.provide(selection, effect)"),
      " supplies the actual LanguageModel per run. Swapping to a real model is the same shape with ",
      Prose.code("withOpenRouter"),
      " — see ",
      Prose.link("/docs/guides/providers", "How to register real model providers"),
      ". The registry layer is never a LanguageModel layer by itself.",
    ),
    Prose.h2("success", "You have built an agent and an eval"),
    Prose.p(
      "You have built a tool-calling agent and a deterministic eval. ",
      Prose.code("bun run index.ts"),
      " prints the jacket answer and the event sequence ending in ",
      Prose.code("Completed"),
      "; ",
      Prose.code("bun run eval.ts"),
      " prints ",
      Prose.code("eval passed"),
      " and exits 0 — all without an API key.",
    ),
    Prose.h2("next-steps", "Next steps"),
    Prose.bullets(
      ["Connect a real model — ", Prose.link("/docs/guides/providers", "How to register real model providers"), "."],
      [
        "Build the full app with approvals and a live UI — ",
        Prose.link("/docs/start/research-agent", "Tutorial: a research agent"),
        ".",
      ],
      ["Understand what just happened — ", Prose.link("/docs/learn/agent-loop", "The agent loop"), "."],
    ),
  ],
})
