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
      code("{ name, instructions?, toolkit, policy, model?, memory?, metadata? }"),
      ", not a service. ",
      code("Agent.make(name, options)"),
      " fills defaults:",
    ),
    table(
      ["Option", "Type", "Default"],
      [
        [[code("name")], [code("string")], "required"],
        [[code("instructions")], [code("string")], "none"],
        [[code("toolkit")], [code("Ai.Toolkit.Toolkit<Tools>")], [code("Ai.Toolkit.empty")]],
        [[code("policy")], [code("TurnPolicy.TurnPolicy")], [code("TurnPolicy.defaultPolicy")]],
        [[code("model")], [code("ModelRegistry.ModelSelection")], "none"],
        [[code("memory")], [code("Memory.Key")], "none"],
        [[code("metadata")], [code("Readonly<Record<string, unknown>>")], "none"],
      ],
    ),
    p(
      code("model"),
      " is a default model selection resolved through ",
      code("ModelRegistry"),
      " at run time. ",
      code("memory"),
      " is the default memory key unless ",
      code("RunOptions.memory.key"),
      " overrides it. ",
      code("metadata"),
      " is host data carried with the agent value for registries and durable hosts.",
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
        [
          [code("memory.key")],
          [code("Memory.Key"), " (optional)"],
          ["Consult the Memory service for this run, overriding ", code("agent.memory"), " when present"],
        ],
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
    p(
      "A no-tool run needs a model, either as a direct ",
      code("Ai.LanguageModel.LanguageModel"),
      " layer or as ",
      code("agent.model"),
      " resolved through ",
      code("ModelRegistry"),
      ". Tool-calling runs also need the Effect AI handler layer for their toolkit unless a ",
      code("ToolExecutor"),
      " override handles the call. Other seams are optional and discovered per run.",
    ),
    table(
      ["Service", "When it is needed"],
      [
        [[code("Ai.LanguageModel.LanguageModel")], ["When the agent has no ", code("model"), " default"]],
        [[code("ModelRegistry.Service")], ["When the agent has a ", code("model"), " default"]],
        [[code("Ai.Tool.HandlersFor<Tools>")], ["When local toolkit handlers execute in-process"]],
        [[code("ToolExecutor.ToolExecutor")], ["Optional override for remote, client, MCP, sandbox, or durable tools"]],
        [[code("Approvals.Approvals")], ["Only when a tool declares ", code("needsApproval")]],
        [[code("ModelMiddleware.ModelMiddleware")], ["Only when model input/output middleware is configured"]],
      ],
    ),
    h2("run-error", "RunError"),
    p(
      "The error channel of every run function is the union ",
      code(
        "AgentError | AgentSuspended | TurnPolicyError | TurnPolicyStopped | TurnLimitExceeded | MiddlewareViolation",
      ),
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
