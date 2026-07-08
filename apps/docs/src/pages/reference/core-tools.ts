import * as Prose from "../../prose"

export const coreToolsReference = Prose.definePage({
  path: "/docs/reference/core-tools",
  title: "Tools and execution",
  navTitle: "Tools",
  group: "Reference",
  description: "ToolExecutor, ToolContext, ToolOutput and its store, and AgentTool for agents-as-tools.",
  content: [
    Prose.lead(
      "Four namespaces of @batonfx/core cover tool execution: ToolExecutor runs calls, ToolContext is the ambient per-call context, ToolOutput bounds large results, and AgentTool wraps an agent as a tool.",
    ),
    Prose.command("Install", "bun add effect@4.0.0-beta.93 @batonfx/core"),
    Prose.h2("tool-executor", "ToolExecutor"),
    Prose.p(
      "One of the four required run services. The interface is a single function ",
      Prose.code("execute: (request: Request) => Effect<Outcome, AgentError, ToolContext>"),
      ".",
    ),
    Prose.table(
      ["Request field", "Type", "Notes"],
      [
        [[Prose.code("call")], [Prose.code("Ai.Response.ToolCallPart<string, unknown>")], "The model's tool call"],
        [[Prose.code("turn")], [Prose.code("number")], "0-based turn issuing the call"],
        [[Prose.code("agentName")], [Prose.code("string")], "Name of the running agent"],
        [[Prose.code("sessionId")], [Prose.code("string")], "Host-assigned run/session identity"],
      ],
    ),
    Prose.table(
      ["Outcome", "Fields", "Loop behavior"],
      [
        [
          [Prose.code("Success")],
          [Prose.code("result"), ", ", Prose.code("encodedResult")],
          "Re-fed to the model as a successful tool result",
        ],
        [
          [Prose.code("Failure")],
          [Prose.code("message")],
          "Re-fed to the model as a failed tool result; the run continues",
        ],
        [
          [Prose.code("Suspend")],
          [Prose.code("token")],
          ["The run fails with ", Prose.code('AgentSuspended{ reason: "tool-wait" }')],
        ],
      ],
    ),
    Prose.table(
      ["Constructor", "Notes"],
      [
        [
          [Prose.code("ToolExecutor.fromToolkit(toolkit)")],
          [
            "Executes via a handled ",
            Prose.code("Ai.Toolkit.WithHandler"),
            ". Unregistered names produce ",
            Prose.code("Failure"),
            "; a handler that dies with ",
            Prose.code("AgentSuspended"),
            " produces ",
            Prose.code("Suspend"),
            " with its token",
          ],
        ],
        [[Prose.code("ToolExecutor.testLayer(implementation)")], "Layer from an explicit interface"],
      ],
    ),
    Prose.h2("tool-context", "ToolContext"),
    Prose.p("Ambient context available to a tool handler for the current call."),
    Prose.table(
      ["Member", "Type", "Notes"],
      [
        [[Prose.code("signal")], [Prose.code("AbortSignal")], "Aborted when the run is interrupted"],
        [
          [Prose.code("emit")],
          [Prose.code("(progress: Progress) => Effect<void>")],
          [
            "Emits a ",
            Prose.code("ToolProgress"),
            " event; ",
            Prose.code("Progress"),
            " is ",
            Prose.code("{ toolCallId, message?, data? }"),
          ],
        ],
        [[Prose.code("sessionId")], [Prose.code("string")], "Host-assigned run/session identity"],
      ],
    ),
    Prose.p(
      Prose.code("ToolContext.layerDefault"),
      " provides a never-aborting signal, a no-op ",
      Prose.code("emit"),
      ", and sessionId ",
      Prose.code('"local"'),
      ". ",
      Prose.code("ToolContext.testLayer(implementation)"),
      " provides an explicit one.",
    ),
    Prose.h2("tool-output", "ToolOutput and ToolOutputStore"),
    Prose.p(
      "A bounded tool result is ",
      Prose.code("ToolOutput = { inline: unknown; outputPaths?: ReadonlyArray<string> }"),
      ". ",
      Prose.code("ToolOutputStore"),
      " is the optional seam that stores overflow out of context: ",
      Prose.code("put(toolCallId, content) => Effect<Option<string>, ToolOutputError>"),
      ".",
    ),
    Prose.table(
      ["Export", "Notes"],
      [
        [
          [Prose.code("ToolOutput.bound(result, { toolCallId, maxBytes })")],
          [
            "Returns the result unchanged when it fits, no store is present, or the store declines; otherwise replaces it with a truncated preview ",
            Prose.code("{ truncated, bytes, maxBytes, preview }"),
            " plus the spilled ",
            Prose.code("outputPaths"),
          ],
        ],
        [[Prose.code("ToolOutput.layerNoop")], ["Store that always declines (", Prose.code("Option.none"), ")"]],
        [
          [Prose.code("ToolOutput.layerMemory")],
          ["In-memory store issuing ", Prose.code("mem:tool-output-<n>"), " paths"],
        ],
        [[Prose.code("ToolOutput.testLayer(implementation)")], "Layer from an explicit store interface"],
        [[Prose.code("ToolOutputError")], ["Tagged error with ", Prose.code("message")]],
      ],
    ),
    Prose.p(
      "The loop applies ",
      Prose.code("bound"),
      " to successful outcomes when ",
      Prose.code("RunOptions.toolOutputMaxBytes"),
      " is set.",
    ),
    Prose.h2("agent-tool", "AgentTool"),
    Prose.p(
      Prose.code("AgentTool.asTool(agent, options?)"),
      " returns a handled toolkit exposing the agent as one tool. The tool declares ",
      Prose.code("failure: Schema.String"),
      " and ",
      Prose.code('failureMode: "return"'),
      ", so child failures come back to the parent model as failed tool results. A child ",
      Prose.code("AgentSuspended"),
      " is not translated — it escapes as a defect.",
    ),
    Prose.table(
      ["Option", "Default"],
      [
        [[Prose.code("name")], [Prose.code("agent.name")]],
        [[Prose.code("description")], "none"],
        [[Prose.code("parameters")], [Prose.code("Schema.Struct({ prompt: Schema.String })")]],
        [[Prose.code("success")], [Prose.code("Schema.String")]],
        [[Prose.code("toPrompt")], [Prose.code("(params) => params.prompt")]],
        [[Prose.code("fromResult")], [Prose.code("(result) => result.text")]],
      ],
    ),
    Prose.p(
      "For handler wiring and spill behavior in practice, see ",
      Prose.link("/docs/guides/define-tools", "How to define tools and toolkits"),
      ". For agents-as-tools composition, see ",
      Prose.link("/docs/guides/multi-agent", "How to coordinate multiple agents"),
      ".",
    ),
  ],
})
