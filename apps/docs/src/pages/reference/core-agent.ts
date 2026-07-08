import * as Prose from "../../prose"

export const coreAgentReference = Prose.definePage({
  path: "/docs/reference/core-agent",
  title: "Agent and run functions",
  navTitle: "Agent",
  group: "Reference",
  description: "Agent.make, the four run functions, RunOptions, RunServices, RunError, Resume, and Result.",
  content: [
    Prose.lead(
      "The Agent namespace of @batonfx/core defines the agent value, the four run functions, and every option and service a run consumes.",
    ),
    Prose.command("Install", "bun add @batonfx/core"),
    Prose.h2("agent-make", "Agent.make"),
    Prose.p(
      "An ",
      Prose.code("Agent<Tools>"),
      " is a plain value ",
      Prose.code("{ name, instructions?, toolkit, policy }"),
      ", not a service. ",
      Prose.code("Agent.make(options)"),
      " fills defaults:",
    ),
    Prose.table(
      ["Option", "Type", "Default"],
      [
        [[Prose.code("name")], [Prose.code("string")], "required"],
        [[Prose.code("instructions")], [Prose.code("string")], "none"],
        [[Prose.code("toolkit")], [Prose.code("Ai.Toolkit.Toolkit<Tools>")], [Prose.code("Ai.Toolkit.empty")]],
        [[Prose.code("policy")], [Prose.code("TurnPolicy.TurnPolicy")], [Prose.code("TurnPolicy.defaultPolicy")]],
      ],
    ),
    Prose.h2("run-functions", "Run functions"),
    Prose.table(
      ["Function", "Signature", "Notes"],
      [
        [
          [Prose.code("Agent.stream")],
          [Prose.code("(agent, options: RunOptions) => Stream<AgentEvent.Event, RunError, RunServices>")],
          "The text primitive; everything else derives from it",
        ],
        [
          [Prose.code("Agent.streamObject")],
          [
            Prose.code(
              '(agent, options: ObjectRunOptions<S>) => Stream<AgentEvent.Event, RunError, RunServices | S["DecodingServices"]>',
            ),
          ],
          [Prose.code("stream"), " plus one terminal structured-output turn before ", Prose.code("Completed")],
        ],
        [
          [Prose.code("Agent.generate")],
          [Prose.code("(agent, options: RunOptions) => Effect<Result, RunError, RunServices>")],
          [Prose.code("stream"), " folded to its ", Prose.code("Completed"), " event"],
        ],
        [
          [Prose.code("Agent.generateObject")],
          [
            Prose.code(
              '(agent, options: ObjectRunOptions<S>) => Effect<ObjectResult<S["Type"]>, RunError, RunServices | S["DecodingServices"]>',
            ),
          ],
          [
            Prose.code("streamObject"),
            " folded to its ",
            Prose.code("StructuredOutput"),
            " and ",
            Prose.code("Completed"),
            " events",
          ],
        ],
      ],
    ),
    Prose.h2("run-options", "RunOptions"),
    Prose.table(
      ["Field", "Type", "Notes"],
      [
        [
          [Prose.code("prompt")],
          [Prose.code("Ai.Prompt.RawInput")],
          ["User input for the first turn; ignored when ", Prose.code("resume"), " is set"],
        ],
        [
          [Prose.code("history")],
          [Prose.code("Ai.Prompt.RawInput"), " (optional)"],
          [
            "Prior transcript, used verbatim as the initial chat history; no system message is prepended. Mutually exclusive with ",
            Prose.code("persistence"),
          ],
        ],
        [
          [Prose.code("system")],
          [Prose.code("string"), " (optional)"],
          ["Overrides the derived system message when ", Prose.code("history"), " is not set"],
        ],
        [
          [Prose.code("resume")],
          [Prose.code("Resume"), " (optional)"],
          ["Re-entry after ", Prose.code("AgentSuspended"), ": execute this call first"],
        ],
        [
          [Prose.code("sessionId")],
          [Prose.code("string"), " (optional)"],
          "Opaque host-assigned identity for this run/session",
        ],
        [
          [Prose.code("toolOutputMaxBytes")],
          [Prose.code("number"), " (optional)"],
          "Spill successful tool outputs whose encoded size exceeds this byte limit",
        ],
        [
          [Prose.code("compaction.contextWindow")],
          [Prose.code("number"), " (optional)"],
          "Context-window hint for optional compaction",
        ],
        [
          [Prose.code("memory.key")],
          [Prose.code("Memory.Key"), " (optional)"],
          "Consult the Memory service for this run",
        ],
        [
          [Prose.code("persistence.chatId")],
          [Prose.code("string"), " (optional)"],
          [
            "Run on a persisted chat; requires ",
            Prose.code("Ai.Chat.Persistence"),
            " in context. The chat is created on first use and accumulates history across runs. Mutually exclusive with ",
            Prose.code("history"),
          ],
        ],
        [
          [Prose.code("persistence.timeToLive")],
          [Prose.code("Duration.Input"), " (optional)"],
          "Time to live for the persisted chat",
        ],
      ],
    ),
    Prose.h3("object-run-options", "ObjectRunOptions"),
    Prose.p(Prose.code("ObjectRunOptions<S>"), " extends ", Prose.code("RunOptions"), " with:"),
    Prose.table(
      ["Field", "Type", "Default"],
      [
        [[Prose.code("schema")], [Prose.code("S extends Schema.Codec")], "required"],
        [[Prose.code("objectName")], [Prose.code("string")], [Prose.code('"output"')]],
        [[Prose.code("objectPrompt")], [Prose.code("Ai.Prompt.RawInput")], [Prose.code("Agent.defaultObjectPrompt")]],
      ],
    ),
    Prose.h2("run-services", "RunServices"),
    Prose.p("Every run requires exactly four services; all other seams are optional and discovered per run."),
    Prose.table(
      ["Service", "Default layer when nothing special is needed"],
      [
        [
          [Prose.code("Ai.LanguageModel.LanguageModel")],
          ["Supplied per run by ", Prose.code("ModelRegistry.provide"), " or a direct model layer"],
        ],
        [
          [Prose.code("ToolExecutor.ToolExecutor")],
          [Prose.code("ToolExecutor.fromToolkit(handledToolkit)"), " or a testLayer"],
        ],
        [[Prose.code("Approvals.Approvals")], [Prose.code("Approvals.autoApprove")]],
        [[Prose.code("ModelMiddleware.ModelMiddleware")], [Prose.code("ModelMiddleware.identityLayer")]],
      ],
    ),
    Prose.h2("run-error", "RunError"),
    Prose.p(
      "The error channel of every run function is the union ",
      Prose.code("AgentError | AgentSuspended | TurnLimitExceeded | MiddlewareViolation"),
      ". Field shapes are tabulated in ",
      Prose.link("/docs/reference/core-events", "AgentEvent and errors"),
      ".",
    ),
    Prose.h2("resume", "Resume"),
    Prose.p(
      Prose.code("Resume"),
      " is ",
      Prose.code("{ call: { id: string; name: string; params: unknown } }"),
      ". The host constructs it from the fields of an ",
      Prose.code("AgentSuspended"),
      " error and passes it as ",
      Prose.code("RunOptions.resume"),
      "; the run executes that call first.",
    ),
    Prose.h2("result", "Result"),
    Prose.table(
      ["Type", "Shape"],
      [
        [[Prose.code("Result")], [Prose.code("{ text: string; turns: number; transcript: Ai.Prompt.Prompt }")]],
        [[Prose.code("ObjectResult<A>")], [Prose.code("Result"), " plus ", Prose.code("{ value: A }")]],
      ],
    ),
    Prose.p(
      "For the loop behind these functions, see ",
      Prose.link("/docs/learn/agent-loop", "The agent loop"),
      ". For structured runs, see ",
      Prose.link("/docs/guides/structured-output", "How to get schema-validated output"),
      "; for deterministic runs in CI, see ",
      Prose.link("/docs/guides/testing-evals", "How to test agents and run evals in CI"),
      ".",
    ),
  ],
})
