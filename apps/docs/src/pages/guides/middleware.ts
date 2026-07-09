import customMiddleware from "../../snippets/guides/middleware/custom-middleware.ts?raw"
import customMiddlewareExpected from "../../snippets/guides/middleware/custom-middleware.expected.txt?raw"
import piiScrub from "../../snippets/guides/middleware/pii-scrub.ts?raw"
import piiScrubExpected from "../../snippets/guides/middleware/pii-scrub.expected.txt?raw"
import resilience from "../../snippets/guides/middleware/resilience.ts?raw"
import validateInput from "../../snippets/guides/middleware/validate-input.ts?raw"
import validateInputExpected from "../../snippets/guides/middleware/validate-input.expected.txt?raw"
import { bullets, callout, code, codeBlock, definePage, h2, link, p } from "../../prose"
export const middleware = definePage({
  path: "/docs/guides/middleware",
  title: "How to add guardrails, middleware, and retries",
  navTitle: "Add guardrails and middleware",
  group: "Guides",
  description:
    "Transform prompts and stream parts with ModelMiddleware, enforce policies with Guardrail combinators, and retry transient model failures with ModelResilience.",
  content: [
    p(
      code("ModelMiddleware"),
      " is optional. When absent, Baton uses the same identity behavior as ",
      code("ModelMiddleware.identityLayer"),
      ". A middleware has two optional hooks: ",
      code("transformPrompt"),
      " rewrites the composed prompt before each model call, and ",
      code("transformPart"),
      " rewrites or drops each streamed part before the loop folds, emits, or persists it. Guardrails are middleware combinators, not a separate subsystem.",
    ),
    h2("write-a-middleware", "1. Write a middleware"),
    p(
      "To drop a part, return ",
      code("Option.none()"),
      ". A dropped part never reaches the event stream or the transcript: the loop behaves as if the model never produced it.",
    ),
    codeBlock({
      label: "custom-middleware.ts",
      source: customMiddleware,
      expectedOutput: customMiddlewareExpected,
    }),
    bullets(
      [
        "The chain is applied in array order: ",
        code("ModelMiddleware.layer([first, second])"),
        " runs ",
        code("first"),
        " before ",
        code("second"),
        " for both hooks.",
      ],
      [
        "Both hooks receive a ",
        code("TurnContext"),
        " with ",
        code("agentName"),
        " and ",
        code("turn"),
        ", and fail with ",
        code("AgentError"),
        " to abort the run.",
      ],
    ),
    callout(
      "warning",
      "Tool calls may not be dropped",
      "Tool-call parts may be transformed but never dropped. Dropping one desynchronizes the loop from the model, so the run fails with ",
      code("MiddlewareViolation"),
      "; see ",
      link("/docs/reference/core-events", "AgentEvent and errors"),
      ".",
    ),
    h2("block-input-with-a-guardrail", "2. Block bad input with a guardrail"),
    p(
      code("Guardrail.validateInput"),
      " turns a check into a ",
      code("transformPrompt"),
      " middleware that fails the run before the prompt reaches the provider. Baton keeps detectors out of core, so plug in whatever compliance dependency your host already uses.",
    ),
    codeBlock({ label: "validate-input.ts", source: validateInput, expectedOutput: validateInputExpected }),
    p(
      "The other combinators follow the same shape: ",
      code("Guardrail.redactInput"),
      " and ",
      code("Guardrail.redactOutput"),
      " replace pattern matches in text-bearing fields, and ",
      code("Guardrail.filterOutput"),
      " drops streamed non-tool-call parts by predicate.",
    ),
    h2("retry-transient-failures", "3. Retry transient model failures"),
    p(
      code("ModelResilience"),
      " is an optional seam that classifies model-call failures and retries only the ",
      code("transient"),
      " ones on a schedule. The default classifier treats retryable ",
      code("AiError"),
      " values as transient and everything else as terminal.",
    ),
    codeBlock({ label: "resilience.ts", source: resilience }),
    bullets(
      [
        "Streaming retries stop as soon as any part has been emitted, so a half-consumed stream is never silently replayed into the same turn.",
      ],
      ["Without the layer the default is ", code("ModelResilience.none"), ": every failure is terminal."],
    ),
    h2("recipe-pii-scrub", "Recipe: scrub PII in both directions"),
    p(
      "Combining ",
      code("redactInput"),
      " and ",
      code("redactOutput"),
      " scrubs sensitive text before the provider sees the prompt and before streamed deltas reach consumers. The scripted model below echoes its input, which makes both redactions visible in one answer.",
    ),
    codeBlock({ label: "pii-scrub.ts", source: piiScrub, expectedOutput: piiScrubExpected }),
    p(
      "To keep long transcripts inside the context window (a prompt-shaping concern that lives one level above middleware), see ",
      link("/docs/guides/compaction", "How to stay inside the context window"),
      ". Signatures for every type on this page are in ",
      link("/docs/reference/core-models", "Models and middleware"),
      ".",
    ),
  ],
})
