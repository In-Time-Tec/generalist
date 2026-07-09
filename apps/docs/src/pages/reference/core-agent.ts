import { code, command, definePage, h2, h3, lead, link, p, table } from "../../prose"
export const coreAgentReference = definePage({
  path: "/docs/reference/core-agent",
  title: "Agent and run functions",
  navTitle: "Agent",
  group: "Reference",
  description: "Agent.make, the four run functions, RunOptions, RunServices, RunError, Resume, and Result.",
  content: [
    lead(
      "The Agent namespace of @batonfx/core defines the agent value, the four run functions, and every option and service a run consumes.",
    ),
    command("Install", "bun add @batonfx/core"),
    h2("agent-make", "Agent.make"),
    p(
      "An ",
      code("Agent<Tools>"),
      " is a plain value ",
      code("{ name, instructions?, toolkit, policy }"),
      ", not a service. ",
      code("Agent.make(options)"),
      " fills defaults:",
    ),
    table(
      ["Option", "Type", "Default"],
      [
        [[code("name")], [code("string")], "required"],
        [[code("instructions")], [code("string")], "none"],
        [[code("toolkit")], [code("Ai.Toolkit.Toolkit<Tools>")], [code("Ai.Toolkit.empty")]],
        [[code("policy")], [code("TurnPolicy.TurnPolicy")], [code("TurnPolicy.defaultPolicy")]],
      ],
    ),
    h2("run-functions", "Run functions"),
    table(
      ["Function", "Signature", "Notes"],
      [
        [
          [code("Agent.stream")],
          [code("(agent, options: RunOptions) => Stream<AgentEvent.Event, RunError, RunServices>")],
          "The text primitive; everything else derives from it",
        ],
        [
          [code("Agent.streamObject")],
          [
            code(
              '(agent, options: ObjectRunOptions<S>) => Stream<AgentEvent.Event, RunError, RunServices | S["DecodingServices"]>',
            ),
          ],
          [code("stream"), " plus one terminal structured-output turn before ", code("Completed")],
        ],
        [
          [code("Agent.generate")],
          [code("(agent, options: RunOptions) => Effect<Result, RunError, RunServices>")],
          [code("stream"), " folded to its ", code("Completed"), " event"],
        ],
        [
          [code("Agent.generateObject")],
          [
            code(
              '(agent, options: ObjectRunOptions<S>) => Effect<ObjectResult<S["Type"]>, RunError, RunServices | S["DecodingServices"]>',
            ),
          ],
          [code("streamObject"), " folded to its ", code("StructuredOutput"), " and ", code("Completed"), " events"],
        ],
      ],
    ),
    h2("run-options", "RunOptions"),
    table(
      ["Field", "Type", "Notes"],
      [
        [
          [code("prompt")],
          [code("Ai.Prompt.RawInput")],
          ["User input for the first turn; ignored when ", code("resume"), " is set"],
        ],
        [
          [code("history")],
          [code("Ai.Prompt.RawInput"), " (optional)"],
          [
            "Prior transcript, used verbatim as the initial chat history; no system message is prepended. Mutually exclusive with ",
            code("persistence"),
          ],
        ],
        [
          [code("system")],
          [code("string"), " (optional)"],
          ["Overrides the derived system message when ", code("history"), " is not set"],
        ],
        [
          [code("resume")],
          [code("Resume"), " (optional)"],
          ["Re-entry after ", code("AgentSuspended"), ": execute this call first"],
        ],
        [[code("sessionId")], [code("string"), " (optional)"], "Opaque host-assigned identity for this run/session"],
        [
          [code("toolOutputMaxBytes")],
          [code("number"), " (optional)"],
          "Spill successful tool outputs whose encoded size exceeds this byte limit",
        ],
        [
          [code("compaction.contextWindow")],
          [code("number"), " (optional)"],
          "Context-window hint for optional compaction",
        ],
        [[code("memory.key")], [code("Memory.Key"), " (optional)"], "Consult the Memory service for this run"],
        [
          [code("persistence.chatId")],
          [code("string"), " (optional)"],
          [
            "Run on a persisted chat; requires ",
            code("Ai.Chat.Persistence"),
            " in context. The chat is created on first use and accumulates history across runs. Mutually exclusive with ",
            code("history"),
          ],
        ],
        [
          [code("persistence.timeToLive")],
          [code("Duration.Input"), " (optional)"],
          "Time to live for the persisted chat",
        ],
      ],
    ),
    h3("object-run-options", "ObjectRunOptions"),
    p(code("ObjectRunOptions<S>"), " extends ", code("RunOptions"), " with:"),
    table(
      ["Field", "Type", "Default"],
      [
        [[code("schema")], [code("S extends Schema.Codec")], "required"],
        [[code("objectName")], [code("string")], [code('"output"')]],
        [[code("objectPrompt")], [code("Ai.Prompt.RawInput")], [code("Agent.defaultObjectPrompt")]],
      ],
    ),
    h2("run-services", "RunServices"),
    p("Every run requires exactly four services; all other seams are optional and discovered per run."),
    table(
      ["Service", "Default layer when nothing special is needed"],
      [
        [
          [code("Ai.LanguageModel.LanguageModel")],
          ["Supplied per run by ", code("ModelRegistry.provide"), " or a direct model layer"],
        ],
        [[code("ToolExecutor.ToolExecutor")], [code("ToolExecutor.fromToolkit(handledToolkit)"), " or a testLayer"]],
        [[code("Approvals.Approvals")], [code("Approvals.autoApprove")]],
        [[code("ModelMiddleware.ModelMiddleware")], [code("ModelMiddleware.identityLayer")]],
      ],
    ),
    h2("run-error", "RunError"),
    p(
      "The error channel of every run function is the union ",
      code("AgentError | AgentSuspended | TurnLimitExceeded | MiddlewareViolation"),
      ". Field shapes are tabulated in ",
      link("/docs/reference/core-events", "AgentEvent and errors"),
      ".",
    ),
    h2("resume", "Resume"),
    p(
      code("Resume"),
      " is ",
      code("{ call: { id: string; name: string; params: unknown } }"),
      ". The host constructs it from the fields of an ",
      code("AgentSuspended"),
      " error and passes it as ",
      code("RunOptions.resume"),
      "; the run executes that call first.",
    ),
    h2("result", "Result"),
    table(
      ["Type", "Shape"],
      [
        [[code("Result")], [code("{ text: string; turns: number; transcript: Ai.Prompt.Prompt }")]],
        [[code("ObjectResult<A>")], [code("Result"), " plus ", code("{ value: A }")]],
      ],
    ),
    p(
      "For the loop behind these functions, see ",
      link("/docs/learn/agent-loop", "The agent loop"),
      ". For structured runs, see ",
      link("/docs/guides/structured-output", "How to get schema-validated output"),
      "; for deterministic runs in CI, see ",
      link("/docs/guides/testing-evals", "How to test agents and run evals in CI"),
      ".",
    ),
  ],
})
