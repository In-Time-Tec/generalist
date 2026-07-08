import * as Prose from "../../prose"

export const coreModelsReference = Prose.definePage({
  path: "/docs/reference/core-models",
  title: "Models and middleware",
  navTitle: "Models",
  group: "Reference",
  description: "ModelRegistry, ModelMiddleware, ModelResilience, and the Guardrail middleware combinators.",
  content: [
    Prose.lead(
      "Four namespaces of @batonfx/core cover the model side of a run: ModelRegistry selects models per run, ModelMiddleware transforms prompts and stream parts, ModelResilience retries transient failures, and Guardrail builds common middleware.",
    ),
    Prose.command("Install", "bun add @batonfx/core"),
    Prose.h2("model-registry", "ModelRegistry"),
    Prose.p(
      "A registry of named model registrations. ",
      Prose.code("provide(selection, effect)"),
      " looks up the registration matching ",
      Prose.code("ModelSelection = { provider, model, registrationKey? }"),
      " and provides its ",
      Prose.code("LanguageModel"),
      " layer to the wrapped effect, failing with ",
      Prose.code("LanguageModelNotRegistered"),
      " when nothing matches.",
    ),
    Prose.table(
      ["Export", "Notes"],
      [
        [
          [Prose.code("Registration")],
          [
            Prose.code("{ provider, model, registrationKey?, layer, metadata? }"),
            " where ",
            Prose.code("layer"),
            " provides the model environment",
          ],
        ],
        [
          [Prose.code("registrationFromLayer(input)")],
          ["Builds a ", Prose.code("Registration"), " from a plain ", Prose.code("LanguageModel"), " layer"],
        ],
        [
          [Prose.code("layer(initialRegistrations?, options?)")],
          [
            "Registry service layer; ",
            Prose.code("GovernanceOptions.maxConcurrentModelCalls"),
            " caps concurrent provided runs with a semaphore",
          ],
        ],
        [
          [Prose.code("layerFromRegistrationEffects(registrations, options?)")],
          "Registry layer from registration effects",
        ],
        [[Prose.code("combine(registries, options?)")], "Merges the registrations of several registry layers into one"],
        [
          [Prose.code("register"), " / ", Prose.code("registrations"), " / ", Prose.code("provide")],
          "Module-level call helpers over the service",
        ],
        [
          [Prose.code("memoryLayer"), " / ", Prose.code("testLayer")],
          ["Alias of ", Prose.code("layer"), "; layer from an explicit interface"],
        ],
      ],
    ),
    Prose.callout(
      "warning",
      "Registry layers are not model layers",
      "Provider helpers like ",
      Prose.code("Deterministic.withDeterministic()"),
      " return a ",
      Prose.code("ModelRegistry.Service"),
      " layer, not a ",
      Prose.code("LanguageModel"),
      " layer. Wrap the run in ",
      Prose.code("ModelRegistry.provide({ provider, model }, effect)"),
      " — never provide a registry layer where a LanguageModel is required.",
    ),
    Prose.h2("model-middleware", "ModelMiddleware"),
    Prose.p(
      "One of the four required run services: a ",
      Prose.code("ReadonlyArray<Middleware>"),
      " applied in array order. Both hooks are optional; omitted hooks are identity.",
    ),
    Prose.table(
      ["Hook", "Signature", "Contract"],
      [
        [
          [Prose.code("transformPrompt")],
          [Prose.code("(prompt, context: TurnContext) => Effect<Ai.Prompt.Prompt, AgentError>")],
          "Transforms the prompt for a turn before it is sent to the model",
        ],
        [
          [Prose.code("transformPart")],
          [Prose.code("(part, context: TurnContext) => Effect<Option<StreamPart>, AgentError>")],
          [
            Prose.code("Option.none()"),
            " drops the part. Tool-call parts may be transformed but must not be dropped — the loop fails the run with ",
            Prose.code("MiddlewareViolation"),
            " if one is",
          ],
        ],
      ],
    ),
    Prose.p(
      Prose.code("TurnContext"),
      " is ",
      Prose.code("{ agentName, turn }"),
      ". Layers: ",
      Prose.code("ModelMiddleware.identityLayer"),
      " (the empty chain, the default) and ",
      Prose.code("ModelMiddleware.layer(middleware)"),
      ".",
    ),
    Prose.h2("model-resilience", "ModelResilience"),
    Prose.p(
      "An optional seam wrapping model calls with retries. The interface is ",
      Prose.code('{ classify: (error) => "transient" | "terminal"; retrySchedule: Schedule }'),
      "; only transient-classified errors retry.",
    ),
    Prose.table(
      ["Export", "Notes"],
      [
        [
          [Prose.code("defaultClassify")],
          ["Transient when ", Prose.code("Ai.AiError.isAiError(error) && error.isRetryable")],
        ],
        [[Prose.code("none")], ["Classify everything terminal, ", Prose.code("Schedule.recurs(0)")]],
        [
          [Prose.code("make(input?)"), " / ", Prose.code("layer(input?)")],
          ["Fill defaults from ", Prose.code("defaultClassify"), " and ", Prose.code("none")],
        ],
        [
          [Prose.code("apply(model, resilience)")],
          [
            "Wraps a ",
            Prose.code("LanguageModel.Service"),
            "; streams that already emitted parts convert later failures into an ",
            Prose.code("error"),
            " part instead of retrying",
          ],
        ],
        [[Prose.code("testLayer(implementation)")], "Layer from an explicit interface"],
      ],
    ),
    Prose.h2("guardrail", "Guardrail"),
    Prose.p("Combinators that build ", Prose.code("ModelMiddleware.Middleware"), " values."),
    Prose.table(
      ["Combinator", "Behavior"],
      [
        [
          [Prose.code("validateInput(check)")],
          [
            "Fails the run with ",
            Prose.code("AgentError"),
            " when ",
            Prose.code("check"),
            " returns a rejection reason for the input prompt",
          ],
        ],
        [
          [Prose.code("redactInput({ pattern, replacement? })")],
          [
            "Redacts regex matches in text-bearing prompt fields before the model sees them; replacement defaults to ",
            Prose.code('"[redacted]"'),
          ],
        ],
        [
          [Prose.code("redactOutput({ pattern, replacement? })")],
          "Redacts matches in streamed text deltas before the loop folds or emits them",
        ],
        [
          [Prose.code("filterOutput(keep)")],
          "Drops streamed parts when keep returns false; tool-call parts always pass",
        ],
      ],
    ),
    Prose.p(
      "See ",
      Prose.link("/docs/guides/providers", "How to register real model providers"),
      ", ",
      Prose.link("/docs/guides/middleware", "How to add guardrails, middleware, and retries"),
      ", and ",
      Prose.link("/docs/guides/testing-evals", "How to test agents and run evals in CI"),
      ".",
    ),
  ],
})
