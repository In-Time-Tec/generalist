import evalInCi from "../../snippets/guides/testing-evals/eval-in-ci.ts?raw"
import evalInCiExpected from "../../snippets/guides/testing-evals/eval-in-ci.expected.txt?raw"
import scriptedLoopTest from "../../snippets/guides/testing-evals/scripted-loop-test.ts?raw"
import scriptedLoopTestExpected from "../../snippets/guides/testing-evals/scripted-loop-test.expected.txt?raw"
import * as Prose from "../../prose"

export const testingEvals = Prose.definePage({
  path: "/docs/guides/testing-evals",
  title: "How to test agents and run evals in CI",
  navTitle: "Test agents and run evals",
  group: "Guides",
  description:
    "Pin loop behavior with scripted models and testLayers, then gate CI on a deterministic eval — no API keys anywhere.",
  content: [
    Prose.p(
      "Every behavior-bearing seam in Baton is an Effect service with an in-memory ",
      Prose.code("testLayer"),
      ", so a full tool-calling loop runs in CI with zero credentials (",
      Prose.link("/docs/learn/seams-as-services", "Seams as services"),
      "). Keep the primary pass/fail deterministic; add LLM-judge jobs outside the default CI path if you want them.",
    ),
    Prose.h2("script-the-model", "1. Script the model and pin the loop"),
    Prose.p(
      "A scripted ",
      Prose.code("Ai.LanguageModel.make"),
      " layer decides each turn: a tool call on the first call, the final answer on the second. The ",
      Prose.code("ToolExecutor"),
      " test layer records what the loop asked it to execute, so the assertions pin both the answer and the tool arguments the model produced.",
    ),
    Prose.codeBlock({
      label: "scripted-loop-test.ts",
      source: scriptedLoopTest,
      expectedOutput: scriptedLoopTestExpected,
    }),
    Prose.p(
      "The same layers drop into any test runner — wrap the program in ",
      Prose.code("it.effect"),
      " from ",
      Prose.code("@effect/vitest"),
      " instead of ",
      Prose.code("Effect.runPromise"),
      " and assert with ",
      Prose.code("expect"),
      ".",
    ),
    Prose.h2("swap-any-seam", "2. Swap any seam with its testLayer"),
    Prose.table(
      ["Seam", "Test construction"],
      [
        [[Prose.code("Ai.LanguageModel")], ["scripted ", Prose.code("Ai.LanguageModel.make"), " layer, as above"]],
        [[Prose.code("ToolExecutor")], [Prose.code("ToolExecutor.testLayer({ execute })")]],
        [
          [Prose.code("Approvals")],
          [
            Prose.code("Approvals.autoApprove"),
            ", ",
            Prose.code("Approvals.denyAll"),
            ", or ",
            Prose.code("Approvals.testLayer"),
            " returning ",
            Prose.code("Pending"),
            " tokens",
          ],
        ],
        [[Prose.code("ModelMiddleware")], [Prose.code("ModelMiddleware.identityLayer")]],
        [[Prose.code("ModelRegistry")], [Prose.code("Deterministic.withDeterministic"), " registration"]],
        [
          [Prose.code("Steering"), ", ", Prose.code("ModelResilience"), ", ", Prose.code("Connection"), ", …"],
          ["every optional seam ships its own ", Prose.code("testLayer(implementation)")],
        ],
      ],
    ),
    Prose.h2("gate-ci-on-a-deterministic-eval", "3. Gate CI on a deterministic eval"),
    Prose.p(
      "For an eval binary, select the deterministic registration through the same ",
      Prose.code("ModelRegistry.provide"),
      " pattern used for real providers — swapping in OpenRouter later changes the selection and the layer, nothing else (",
      Prose.link("/docs/guides/providers", "How to register real model providers"),
      "). This is ",
      Prose.link("https://github.com/In-Time-Tec/batonfx/tree/main/examples/eval-in-ci", "examples/eval-in-ci"),
      " verbatim.",
    ),
    Prose.codeBlock({ label: "eval.ts", source: evalInCi, expectedOutput: evalInCiExpected }),
    Prose.command("Terminal", "bun run eval.ts"),
    Prose.bullets(
      [
        "On success the script prints ",
        Prose.code("eval passed"),
        " and exits 0; on a mismatch ",
        Prose.code("Effect.die"),
        " rejects the promise and the process exits non-zero — exactly what a CI step needs.",
      ],
      [
        "Never provide ",
        Prose.code("Deterministic.withDeterministic()"),
        " where a ",
        Prose.code("LanguageModel"),
        " is required: it registers a model in the ",
        Prose.code("ModelRegistry"),
        "; ",
        Prose.code("ModelRegistry.provide"),
        " supplies the actual model per run.",
      ],
    ),
    Prose.p(
      "If you have not built the loop this page tests, start with ",
      Prose.link("/docs/start/quickstart", "the quickstart"),
      " — its final step is this eval.",
    ),
  ],
})
