import customMiddleware from "../../snippets/guides/middleware/custom-middleware.ts?raw"
import customMiddlewareExpected from "../../snippets/guides/middleware/custom-middleware.expected.txt?raw"
import piiScrub from "../../snippets/guides/middleware/pii-scrub.ts?raw"
import piiScrubExpected from "../../snippets/guides/middleware/pii-scrub.expected.txt?raw"
import resilience from "../../snippets/guides/middleware/resilience.ts?raw"
import validateInput from "../../snippets/guides/middleware/validate-input.ts?raw"
import validateInputExpected from "../../snippets/guides/middleware/validate-input.expected.txt?raw"
import * as Prose from "../../prose"

export const middleware = Prose.definePage({
  path: "/docs/guides/middleware",
  title: "How to add guardrails, middleware, and retries",
  navTitle: "Add guardrails and middleware",
  group: "Guides",
  description:
    "Transform prompts and stream parts with ModelMiddleware, enforce policies with Guardrail combinators, and retry transient model failures with ModelResilience.",
  content: [
    Prose.p(
      Prose.code("ModelMiddleware"),
      " is one of the four required layers on every run, and its default is the identity chain ",
      Prose.code("ModelMiddleware.identityLayer"),
      ". A middleware has two optional hooks: ",
      Prose.code("transformPrompt"),
      " rewrites the composed prompt before each model call, and ",
      Prose.code("transformPart"),
      " rewrites or drops each streamed part before the loop folds, emits, or persists it. Guardrails are middleware combinators, not a separate subsystem.",
    ),
    Prose.h2("write-a-middleware", "1. Write a middleware"),
    Prose.p(
      "To drop a part, return ",
      Prose.code("Option.none()"),
      ". A dropped part never reaches the event stream or the transcript — the loop behaves as if the model never produced it.",
    ),
    Prose.codeBlock({
      label: "custom-middleware.ts",
      source: customMiddleware,
      expectedOutput: customMiddlewareExpected,
    }),
    Prose.bullets(
      [
        "The chain is applied in array order: ",
        Prose.code("ModelMiddleware.layer([first, second])"),
        " runs ",
        Prose.code("first"),
        " before ",
        Prose.code("second"),
        " for both hooks.",
      ],
      [
        "Both hooks receive a ",
        Prose.code("TurnContext"),
        " with ",
        Prose.code("agentName"),
        " and ",
        Prose.code("turn"),
        ", and fail with ",
        Prose.code("AgentError"),
        " to abort the run.",
      ],
    ),
    Prose.callout(
      "warning",
      "Tool calls may not be dropped",
      "Tool-call parts may be transformed but never dropped. Dropping one desynchronizes the loop from the model, so the run fails with ",
      Prose.code("MiddlewareViolation"),
      " — see ",
      Prose.link("/docs/reference/core-events", "AgentEvent and errors"),
      ".",
    ),
    Prose.h2("block-input-with-a-guardrail", "2. Block bad input with a guardrail"),
    Prose.p(
      Prose.code("Guardrail.validateInput"),
      " turns a check into a ",
      Prose.code("transformPrompt"),
      " middleware that fails the run before the prompt reaches the provider. Baton keeps detectors out of core, so plug in whatever compliance dependency your host already uses.",
    ),
    Prose.codeBlock({ label: "validate-input.ts", source: validateInput, expectedOutput: validateInputExpected }),
    Prose.p(
      "The other combinators follow the same shape: ",
      Prose.code("Guardrail.redactInput"),
      " and ",
      Prose.code("Guardrail.redactOutput"),
      " replace pattern matches in text-bearing fields, and ",
      Prose.code("Guardrail.filterOutput"),
      " drops streamed non-tool-call parts by predicate.",
    ),
    Prose.h2("retry-transient-failures", "3. Retry transient model failures"),
    Prose.p(
      Prose.code("ModelResilience"),
      " is an optional seam that classifies model-call failures and retries only the ",
      Prose.code("transient"),
      " ones on a schedule. The default classifier treats retryable ",
      Prose.code("AiError"),
      " values as transient and everything else as terminal.",
    ),
    Prose.codeBlock({ label: "resilience.ts", source: resilience }),
    Prose.bullets(
      [
        "Streaming retries stop as soon as any part has been emitted — a half-consumed stream is never silently replayed into the same turn.",
      ],
      ["Without the layer the default is ", Prose.code("ModelResilience.none"), ": every failure is terminal."],
    ),
    Prose.h2("recipe-pii-scrub", "Recipe: scrub PII in both directions"),
    Prose.p(
      "Combining ",
      Prose.code("redactInput"),
      " and ",
      Prose.code("redactOutput"),
      " scrubs sensitive text before the provider sees the prompt and before streamed deltas reach consumers. The scripted model below echoes its input, which makes both redactions visible in one answer.",
    ),
    Prose.codeBlock({ label: "pii-scrub.ts", source: piiScrub, expectedOutput: piiScrubExpected }),
    Prose.p(
      "To keep long transcripts inside the context window — a prompt-shaping concern that lives one level above middleware — see ",
      Prose.link("/docs/guides/compaction", "How to stay inside the context window"),
      ". Signatures for every type on this page are in ",
      Prose.link("/docs/reference/core-models", "Models and middleware"),
      ".",
    ),
  ],
})
