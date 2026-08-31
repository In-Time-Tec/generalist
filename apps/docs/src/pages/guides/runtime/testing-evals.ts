import evalInCi from "virtual:source/src/snippets/guides/runtime/testing-evals/eval-in-ci.ts"
import evalInCiExpected from "virtual:source/src/snippets/guides/runtime/testing-evals/eval-in-ci.expected.txt"
import scriptedLoopTest from "virtual:source/src/snippets/guides/runtime/testing-evals/scripted-loop-test.ts"
import scriptedLoopTestExpected from "virtual:source/src/snippets/guides/runtime/testing-evals/scripted-loop-test.expected.txt"
import { bullets, code, codeBlock, command, definePage, h2, link, p, table } from "../../../prose"
export const testingEvals = definePage({
  path: "/docs/guides/testing-evals",
  title: "How to test agents and run evals in CI",
  navTitle: "Test agents and run evals",
  group: "Guides",
  description:
    "Pin loop behavior with scripted models and layerTests, then gate CI on a deterministic eval, with no API keys anywhere.",
  content: [
    p(
      "Every behavior-bearing seam in Generalist is an Effect service with an in-memory ",
      code("layerTest"),
      ", so a full tool-calling loop runs in CI with zero credentials (",
      link("/docs/learn/seams-as-services", "Seams as services"),
      "). Keep the primary pass/fail deterministic; add LLM-judge jobs outside the default CI path if you want them.",
    ),
    h2("script-the-model", "1. Script the model and pin the loop"),
    p(
      "A scripted ",
      code("TestModel.make"),
      " fixture decides each turn: a tool call on the first request, the final answer on the second. Its normalized prompt capture proves the tool result was re-fed, while the handler assertion pins the tool arguments the model produced.",
    ),
    codeBlock({
      label: "scripted-loop-test.ts",
      source: scriptedLoopTest,
      expectedOutput: scriptedLoopTestExpected,
    }),
    p(
      "The same layers drop into any test runner: wrap the program in ",
      code("it.effect"),
      " from ",
      code("@effect/vitest"),
      " instead of ",
      code("Effect.runPromise"),
      " and assert with ",
      code("expect"),
      ".",
    ),
    h2("swap-any-seam", "2. Swap any seam with its layerTest"),
    table(
      ["Seam", "Test construction"],
      [
        [[code("Ai.LanguageModel")], [code("TestModel.layer"), " or a stateful ", code("TestModel.make"), " fixture"]],
        [[code("ToolExecutor")], [code("ToolExecutor.layerTest({ execute })")]],
        [
          [code("Approvals")],
          [
            code("Approvals.layerAutoApprove"),
            ", ",
            code("Approvals.layerDenyAll"),
            ", or ",
            code("Approvals.layerTest"),
            " returning ",
            code("Pending"),
            " tokens",
          ],
        ],
        [[code("ModelMiddleware")], [code("ModelMiddleware.layerIdentity")]],
        [[code("ModelRegistry")], [code("Deterministic.layer"), " registration"]],
        [
          [code("Steering"), ", ", code("ModelResilience"), ", ", code("Connection"), ", …"],
          ["every optional seam ships its own ", code("layerTest(implementation)")],
        ],
      ],
    ),
    h2("gate-ci-on-a-deterministic-eval", "3. Gate CI on a deterministic eval"),
    p(
      "For an eval binary, select the deterministic registration through the same ",
      code("ModelRegistry.withModel"),
      " pattern used for real providers. Swapping in OpenRouter later changes the selection and the layer, nothing else (",
      link("/docs/guides/providers", "How to register real model providers"),
      "). This is ",
      link("https://github.com/In-Time-Tec/generalist/tree/main/examples/eval-in-ci", "examples/eval-in-ci"),
      " verbatim.",
    ),
    codeBlock({ label: "eval.ts", source: evalInCi, expectedOutput: evalInCiExpected }),
    command("Terminal", "bun run eval.ts"),
    bullets(
      [
        "On success the script prints ",
        code("eval passed"),
        " and exits 0; on a mismatch ",
        code("Effect.die"),
        " rejects the promise and the process exits non-zero, which is exactly what a CI step needs.",
      ],
      [
        "Never provide ",
        code("Deterministic.layer()"),
        " where a ",
        code("LanguageModel"),
        " is required: it registers a model in the ",
        code("ModelRegistry"),
        "; ",
        code("ModelRegistry.withModel"),
        " supplies the actual model per run.",
      ],
    ),
    p(
      "If you have not built the loop this page tests, start with ",
      link("/docs/start/quickstart", "the quickstart"),
      "; its final step is this eval.",
    ),
  ],
})
