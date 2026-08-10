import { callout, code, command, definePage, h2, lead, link, p, table } from "../../prose"
export const coreModelsReference = definePage({
  path: "/docs/reference/core-models",
  title: "Models and middleware",
  navTitle: "Models",
  group: "Reference",
  description: "ModelRegistry, ModelMiddleware, ModelResilience, and the Guardrail middleware combinators.",
  content: [
    lead(
      "Four namespaces of @batonfx/core cover the model side of a run: ModelRegistry selects models per run, ModelMiddleware transforms prompts and stream parts, ModelResilience retries transient failures, and Guardrail builds common middleware.",
    ),
    command("Install", "bun add @batonfx/core"),
    h2("model-registry", "ModelRegistry"),
    p(
      "A registry of named model registrations. ",
      code("operate(selection, effect)"),
      " looks up the registration matching ",
      code("ModelSelection = { provider, model, registrationKey? }"),
      " and provides its ",
      code("LanguageModel"),
      " layer to the wrapped effect, failing with ",
      code("LanguageModelNotRegistered"),
      " when nothing matches.",
    ),
    table(
      ["Export", "Notes"],
      [
        [
          [code("Registration")],
          [
            code("{ provider, model, registrationKey?, layer, metadata? }"),
            " where ",
            code("layer"),
            " provides the model environment",
          ],
        ],
        [
          [code("registration(input)")],
          ["Builds a ", code("Registration"), " from a plain ", code("LanguageModel"), " layer"],
        ],
        [
          [code("layer(registrations?, options?)")],
          [
            "Registry service layer from registration effects; ",
            code("GovernanceOptions.maxConcurrentModelCalls"),
            " caps concurrent provided runs with a semaphore",
          ],
        ],
        [[code("layerCombined(registries, options?)")], "Merges the registrations of several registry layers into one"],
        [
          [code("register"), " / ", code("registrations"), " / ", code("operate")],
          "Module-level call helpers over the service",
        ],
        [
          [code("layerMemory"), " / ", code("layerTest")],
          ["In-memory registry layer; layer from an explicit interface"],
        ],
      ],
    ),
    callout(
      "warning",
      "Registry layers are not model layers",
      "Provider helpers like ",
      code("Deterministic.layer()"),
      " return a ",
      code("ModelRegistry.ModelRegistry"),
      " layer, not a ",
      code("LanguageModel"),
      " layer. Wrap the run in ",
      code("ModelRegistry.operate({ provider, model }, effect)"),
      ". Never provide a registry layer where a LanguageModel is required.",
    ),
    h2("model-middleware", "ModelMiddleware"),
    p(
      "Optional prompt/stream interceptor: a ",
      code("ReadonlyArray<Middleware>"),
      " applied in array order. When no layer is provided, Baton uses the empty identity chain. Both hooks are optional; omitted hooks are identity.",
    ),
    table(
      ["Hook", "Signature", "Contract"],
      [
        [
          [code("transformPrompt")],
          [code("(prompt, context: TurnContext) => Effect<Ai.Prompt.Prompt, AgentError>")],
          "Transforms the prompt for a turn before it is sent to the model",
        ],
        [
          [code("transformPart")],
          [code("(part, context: TurnContext) => Effect<Option<StreamPart>, AgentError>")],
          [
            code("Option.none()"),
            " drops the part. Tool-call parts may be transformed but must not be dropped: the loop fails the run with ",
            code("MiddlewareViolation"),
            " if one is",
          ],
        ],
      ],
    ),
    p(
      code("TurnContext"),
      " is ",
      code("{ agentName, turn }"),
      ". Layers: ",
      code("ModelMiddleware.layerIdentity"),
      " (the empty chain, the default) and ",
      code("ModelMiddleware.layer(middleware)"),
      ".",
    ),
    h2("model-resilience", "ModelResilience"),
    p(
      "The agent loop wraps model calls with a default bounded retry policy, and this seam can replace or disable it. The interface is ",
      code(
        '{ resolve: (input) => AiError; classify: (error) => "transient" | "terminal"; retrySchedule: Schedule; invalidToolCallCorrectionLimit: number; streamIdleTimeout?: Duration.Input }',
      ),
      "; only transient-classified errors retry. Invalid-tool correction limits are safe integers from 0 through 2, and generic InvalidOutputError values never enter that correction path. Direct custom models using correction with schema-backed tools attach their provider-exact compiler through ModelRegistry.withToolJsonSchemaCompiler. OpenAI, OpenAI-compatible, Anthropic, and Amazon Bedrock register compilers; OpenRouter rejects schema-backed correction before transport because its pinned adapter cannot preserve the permissive projection's compiled request schema.",
    ),
    table(
      ["Export", "Notes"],
      [
        [
          [code("defaultClassify")],
          ["Transient for retryable ", code("AiError"), " values and pre-output stream termination failures"],
        ],
        [
          [code("defaultResolveFailure")],
          [
            "Keeps typed ",
            code("AiError"),
            " values and bounds unknown error-part payloads as terminal unknown errors",
          ],
        ],
        [
          [code("defaultPolicy")],
          [
            "Retry provider rate limits, internal failures, and transport failures twice with 2s and 4s backoff, bounded by a 30s schedule window",
          ],
        ],
        [[code("none")], ["Resolve unknown parts safely, classify everything terminal, ", code("Schedule.recurs(0)")]],
        [
          [code("make(input?)"), " / ", code("layer(input?)")],
          [
            "Use ",
            code("defaultClassify"),
            " with the default policy's schedule and resolver; provide ",
            code("none"),
            " to disable retries",
          ],
        ],
        [
          [code("apply(model, resilience)")],
          [
            "Wraps a ",
            code("LanguageModel.Service"),
            "; provider error parts retry before replayable output, while later failures become one ",
            code("error"),
            " part; consumer-visible reasoning, text, or tool-call output is an absolute retry barrier",
          ],
        ],
        [[code("layerTest(implementation)")], "Layer from an explicit interface"],
      ],
    ),
    h2("guardrail", "Guardrail"),
    p("Combinators that build ", code("ModelMiddleware.Middleware"), " values."),
    table(
      ["Combinator", "Behavior"],
      [
        [
          [code("validateInput(check)")],
          [
            "Fails the run with ",
            code("AgentError"),
            " when ",
            code("check"),
            " returns a rejection reason for the input prompt",
          ],
        ],
        [
          [code("redactInput({ pattern, replacement? })")],
          [
            "Redacts regex matches in text-bearing prompt fields before the model sees them; replacement defaults to ",
            code('"[redacted]"'),
          ],
        ],
        [
          [code("redactOutput({ pattern, replacement? })")],
          "Redacts matches in streamed text deltas before the loop folds or emits them",
        ],
        [[code("filterOutput(keep)")], "Drops streamed parts when keep returns false; tool-call parts always pass"],
      ],
    ),
    p(
      "See ",
      link("/docs/guides/providers", "How to register real model providers"),
      ", ",
      link("/docs/guides/middleware", "How to add guardrails, middleware, and retries"),
      ", and ",
      link("/docs/guides/testing-evals", "How to test agents and run evals in CI"),
      ".",
    ),
  ],
})
