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
      code("provide(selection, effect)"),
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
          [code("registrationFromLayer(input)")],
          ["Builds a ", code("Registration"), " from a plain ", code("LanguageModel"), " layer"],
        ],
        [
          [code("layer(initialRegistrations?, options?)")],
          [
            "Registry service layer; ",
            code("GovernanceOptions.maxConcurrentModelCalls"),
            " caps concurrent provided runs with a semaphore",
          ],
        ],
        [[code("layerFromRegistrationEffects(registrations, options?)")], "Registry layer from registration effects"],
        [[code("combine(registries, options?)")], "Merges the registrations of several registry layers into one"],
        [
          [code("register"), " / ", code("registrations"), " / ", code("provide")],
          "Module-level call helpers over the service",
        ],
        [
          [code("memoryLayer"), " / ", code("testLayer")],
          ["Alias of ", code("layer"), "; layer from an explicit interface"],
        ],
      ],
    ),
    callout(
      "warning",
      "Registry layers are not model layers",
      "Provider helpers like ",
      code("Deterministic.withDeterministic()"),
      " return a ",
      code("ModelRegistry.Service"),
      " layer, not a ",
      code("LanguageModel"),
      " layer. Wrap the run in ",
      code("ModelRegistry.provide({ provider, model }, effect)"),
      ". Never provide a registry layer where a LanguageModel is required.",
    ),
    h2("model-middleware", "ModelMiddleware"),
    p(
      "One of the four required run services: a ",
      code("ReadonlyArray<Middleware>"),
      " applied in array order. Both hooks are optional; omitted hooks are identity.",
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
      code("ModelMiddleware.identityLayer"),
      " (the empty chain, the default) and ",
      code("ModelMiddleware.layer(middleware)"),
      ".",
    ),
    h2("model-resilience", "ModelResilience"),
    p(
      "An optional seam wrapping model calls with retries. The interface is ",
      code('{ classify: (error) => "transient" | "terminal"; retrySchedule: Schedule }'),
      "; only transient-classified errors retry.",
    ),
    table(
      ["Export", "Notes"],
      [
        [[code("defaultClassify")], ["Transient when ", code("Ai.AiError.isAiError(error) && error.isRetryable")]],
        [[code("none")], ["Classify everything terminal, ", code("Schedule.recurs(0)")]],
        [
          [code("make(input?)"), " / ", code("layer(input?)")],
          ["Fill defaults from ", code("defaultClassify"), " and ", code("none")],
        ],
        [
          [code("apply(model, resilience)")],
          [
            "Wraps a ",
            code("LanguageModel.Service"),
            "; streams that already emitted parts convert later failures into an ",
            code("error"),
            " part instead of retrying",
          ],
        ],
        [[code("testLayer(implementation)")], "Layer from an explicit interface"],
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
