export type CodeExample = Readonly<{
  label: string
  language: string
  code: string
}>

export type DocPage = Readonly<{
  path: string
  title: string
  navTitle: string
  group: string
  lead: string
  summary: ReadonlyArray<string>
  invariants: ReadonlyArray<string>
  exports: ReadonlyArray<string>
  examples: ReadonlyArray<CodeExample>
}>

export type NavGroup = Readonly<{
  title: string
  pages: ReadonlyArray<DocPage>
}>

const installExample = `bun add effect @batonfx/core
bun add @batonfx/providers @batonfx/memory @batonfx/skills @batonfx/transport @batonfx/foldkit`

const minimalAgentExample = `import { Agent, Approvals, ModelMiddleware, ModelRegistry, ToolExecutor, TurnPolicy } from "@batonfx/core"
import { Deterministic } from "@batonfx/providers"
import { Effect, Stream } from "effect"

const agent = Agent.make({
  name: "assistant",
  instructions: "Answer using Baton concepts only.",
  policy: TurnPolicy.recurs(2),
})

const program = ModelRegistry.provide(
  { provider: "deterministic", model: "deterministic" },
  Agent.stream(agent, { prompt: "What is Baton?" }).pipe(Stream.runCollect),
).pipe(
  Effect.provide(ToolExecutor.fromToolkit(agent.toolkit)),
  Effect.provide(Approvals.autoApprove),
  Effect.provide(ModelMiddleware.identityLayer),
  Effect.provide(Deterministic.withDeterministic()),
)`

const docsPages: ReadonlyArray<DocPage> = [
  {
    path: "/docs/getting-started",
    title: "Getting started",
    navTitle: "Getting started",
    group: "Start",
    lead: "Install the package you need, define an Agent value, and provide the Effect layers that own model, tools, approvals, and middleware.",
    summary: [
      "Baton is an Effect-native model-turn loop over effect/unstable/ai, not a second prompt or tool wire format.",
      "An Agent is a plain definition value: name, optional instructions, toolkit, and turn policy.",
      "Running an Agent is still an Effect program. The caller provides the language model, ToolExecutor, Approvals, and ModelMiddleware layers.",
    ],
    invariants: [
      "Turn 0 always runs; follow-up turns are policy-gated only when tool results are pending.",
      "Core depends on effect only. Provider helpers live in @batonfx/providers.",
      "Missing runtime services fail loudly instead of falling back to hidden globals.",
    ],
    exports: ["Agent", "Approvals", "ModelMiddleware", "ModelRegistry", "ToolExecutor", "TurnPolicy"],
    examples: [
      { label: "Install", language: "bash", code: installExample },
      { label: "Minimal loop shape", language: "ts", code: minimalAgentExample },
    ],
  },
  {
    path: "/docs/core/agent-loop",
    title: "Core agent loop",
    navTitle: "Agent loop",
    group: "Core seams",
    lead: "The core package owns the non-durable turn loop, event stream, suspension contract, and optional seams around model calls and local tools.",
    summary: [
      "Baton builds an Ai.Chat, streams model parts, executes framework-owned tool calls sequentially, re-feeds tool results, and repeats by TurnPolicy.",
      "Provider-executed tool calls pass through as model parts; Baton does not gate or dispatch them.",
      "Structured output runs after the normal tool loop and emits StructuredOutput immediately before Completed.",
    ],
    invariants: [
      "Payloads stay Ai.Prompt and Ai.Response from effect/unstable/ai.",
      "Pending tool results are never silently dropped; Stop with pending results fails as TurnLimitExceeded.",
      "Suspension is AgentSuspended on the stream error channel and is resumed through RunOptions.resume.",
    ],
    exports: [
      "Agent",
      "AgentEvent",
      "Approvals",
      "Guardrail",
      "ModelMiddleware",
      "ModelRegistry",
      "ModelResilience",
      "ToolContext",
      "ToolExecutor",
      "ToolOutput",
      "TurnPolicy",
    ],
    examples: [
      {
        label: "Agent definition",
        language: "ts",
        code: `import { Agent, TurnPolicy } from "@batonfx/core"
import * as Ai from "effect/unstable/ai"

export const assistant = Agent.make({
  name: "assistant",
  instructions: "Use Baton seams; do not invent durable state.",
  toolkit: Ai.Toolkit.empty,
  policy: TurnPolicy.recurs(8),
})`,
      },
    ],
  },
  {
    path: "/docs/core/session-event-log",
    title: "Session event log",
    navTitle: "Session event log",
    group: "Core seams",
    lead: "Session is an append-only conversation log plus a pure projector from a root-to-leaf path into an Ai.Prompt.",
    summary: [
      "The log stores Message, Compaction, and BranchSummary entries. It does not store a second computed prompt.",
      "A current leaf pointer represents branch navigation; adding a child moves that pointer without rewriting the path.",
      "Compaction is lossless in the log and lossy only in the prompt projection.",
    ],
    invariants: [
      "Durable storage is host-owned. Core ships memoryLayer and testLayer only.",
      "The last Compaction entry on a path wins during projection.",
      "SessionStore integrates with Agent.stream only when Compaction is also present.",
    ],
    exports: ["Session.buildContext", "Session.memoryLayer", "Session.testLayer", "Session.SessionStore"],
    examples: [
      {
        label: "Project a path",
        language: "ts",
        code: `import { Session } from "@batonfx/core"

export const sessionLayer = Session.memoryLayer
export const toPrompt = Session.buildContext`,
      },
    ],
  },
  {
    path: "/docs/core/instructions",
    title: "Instructions and context epoch",
    navTitle: "Instructions",
    group: "Core seams",
    lead: "Instructions is an ordered context-source registry that opens a stable run baseline once and keeps dynamic sources for later update rendering.",
    summary: [
      "Baseline sources render once at turn 0 and become the system-message baseline when no explicit system or history is supplied.",
      "Dynamic sources are retained in the epoch and rendered by renderUpdate, but the agent loop does not inject them until the update contract does so.",
      "If the registry baseline is empty, the Agent falls back to its own instructions.",
    ],
    invariants: [
      "Source order is preserved.",
      "Option.none contributes no text.",
      "Rendered fragments are joined with one blank line.",
    ],
    exports: ["Instructions.staticSource", "Instructions.openEpoch", "Instructions.renderUpdate", "Instructions.layer"],
    examples: [
      {
        label: "Static baseline",
        language: "ts",
        code: `import { Instructions } from "@batonfx/core"

export const instructionsLayer = Instructions.layer([
  Instructions.staticSource("host-policy", "Follow the host policy before tool use."),
])`,
      },
    ],
  },
  {
    path: "/docs/core/permissions",
    title: "Permissions policy",
    navTitle: "Permissions",
    group: "Core seams",
    lead: "Permissions is the optional allow, deny, or ask policy seam for framework-executed local tool calls.",
    summary: [
      "Rules are ordered and later matching rules win. Fallback defaults to ask.",
      "Allow continues to a tool's needsApproval and the Approvals service. Deny creates a failed tool result without execution.",
      "Ask emits ApprovalRequested and either receives an in-process answer or suspends through AgentSuspended.",
    ],
    invariants: [
      "Provider-executed tool calls are not gated because Baton does not dispatch them.",
      "Durable permission waits are host-owned.",
      "Remembered always-allow rules use RuleStore only when the service is present.",
    ],
    exports: [
      "Permissions.matches",
      "Permissions.evaluate",
      "Permissions.fromRuleset",
      "Permissions.allowAll",
      "Permissions.interactive",
      "Permissions.ruleStoreMemory",
    ],
    examples: [
      {
        label: "Ruleset",
        language: "ts",
        code: `import { Permissions } from "@batonfx/core"

const ruleset: Permissions.Ruleset = {
  rules: [{ pattern: "shell:rm *", level: "deny", reason: "destructive command" }],
  fallback: "ask",
}

export const level = Permissions.evaluate(ruleset, "shell", { command: "rm -rf dist" })
export const permissionsLayer = Permissions.fromRuleset(ruleset)`,
      },
    ],
  },
  {
    path: "/docs/core/steering",
    title: "Steering and interrupts",
    navTitle: "Steering",
    group: "Core seams",
    lead: "Steering provides two in-process FIFO queues for live prompts: steering input before the next tool-result turn and follow-up input before completion.",
    summary: [
      "takeSteering and takeFollowUp are non-blocking and return an empty array when no messages are queued.",
      "Steering does not bypass TurnPolicy caps; Stop with pending tool results still fails with TurnLimitExceeded.",
      "Normal Effect interruption is the run-scoped abort primitive.",
    ],
    invariants: [
      "QueueMode is either all or one-at-a-time.",
      "Absent Steering preserves existing turn and completion behavior.",
      "Undrained messages remain in the service layer when a run is interrupted.",
    ],
    exports: ["Steering.layer", "Steering.testLayer", "Steering.Steering", "Steering.QueueMode"],
    examples: [
      {
        label: "Layer",
        language: "ts",
        code: `import { Steering } from "@batonfx/core"

export const steeringLayer = Steering.layer({
  steeringMode: "all",
  followUpMode: "one-at-a-time",
})`,
      },
    ],
  },
  {
    path: "/docs/core/compaction",
    title: "Compaction",
    navTitle: "Compaction",
    group: "Core seams",
    lead: "Compaction is an optional strategy boundary for shrinking projected model context before a turn or after a pre-emission context overflow.",
    summary: [
      "The default strategy tries tool-output microcompaction before summary checkpointing.",
      "Summary checkpointing keeps a recent suffix verbatim and summarizes the older prefix with one dedicated generateText call.",
      "When SessionStore is present, the full pre-compaction conversation remains in the session path.",
    ],
    invariants: [
      "Absent Compaction preserves current turn, session, and completion behavior.",
      "Reactive compaction retries the same turn once only if overflow happened before any part was emitted.",
      "Cut points snap to turn boundaries and do not split assistant tool-call and tool-result pairs.",
    ],
    exports: [
      "Compaction.defaultStrategy",
      "Compaction.layer",
      "Compaction.truncate",
      "Compaction.testLayer",
      "Compaction.isContextOverflow",
    ],
    examples: [
      {
        label: "Default strategy layer",
        language: "ts",
        code: `import { Compaction } from "@batonfx/core"

export const compactionLayer = Compaction.layer({
  contextWindow: 128_000,
  reserveTokens: 16_384,
})`,
      },
    ],
  },
  {
    path: "/docs/packages/skills",
    title: "Skills",
    navTitle: "Skills",
    group: "Packages",
    lead: "Skills use the agentskills.io SKILL.md directory format with startup listings and lazy body activation through Baton's activate_skill tool.",
    summary: [
      "Core owns the SkillSource seam and listing selection. Filesystem discovery lives in @batonfx/skills.",
      "Startup context contains selected listings only. The full Markdown body is loaded only after activate_skill is called with a listed name.",
      "Skill bodies may contribute Ai.Tool values to the active toolkit after activation.",
    ],
    invariants: [
      "Core never reads the filesystem.",
      "Only description is required by the filesystem loader; name defaults to the directory-derived skill name.",
      "Supporting files are not loaded automatically in v1.",
    ],
    exports: [
      "SkillSource.selectListings",
      "SkillSource.fromSkills",
      "SkillSource.empty",
      "SkillLoader.layer",
      "InstructionFiles.loadInstructionFiles",
    ],
    examples: [
      {
        label: "Filesystem source",
        language: "ts",
        code: `import { SkillSource } from "@batonfx/core"
import { SkillLoader } from "@batonfx/skills"

export const noSkills = SkillSource.empty
export const filesystemSkills = SkillLoader.layer({ roots: [".agents/skills"] })`,
      },
    ],
  },
  {
    path: "/docs/packages/providers",
    title: "Providers",
    navTitle: "Providers",
    group: "Packages",
    lead: "@batonfx/providers adapts upstream Effect AI providers into core's ModelRegistry and exposes provider-neutral embedding layers.",
    summary: [
      "Registration helpers return ModelRegistry registrations keyed by provider, model, and optional registrationKey.",
      "All-in-one layers compose provider client layers, FetchHttpClient, and ModelRegistry.Service.",
      "The catalog is an offline-safe static metadata snapshot with caller overrides, not a live pricing service.",
    ],
    invariants: [
      "Core remains provider-agnostic and effect-only.",
      "API keys and client config are not stored in registry metadata.",
      "Embeddings use the Effect AI EmbeddingModel tag, not ModelRegistry.",
    ],
    exports: [
      "Anthropic",
      "Catalog",
      "Deterministic",
      "Embedding",
      "OpenAi",
      "OpenAiCompatible",
      "OpenRouter",
      "Presets",
    ],
    examples: [
      {
        label: "Provider layers",
        language: "ts",
        code: `import { Catalog, Deterministic, Presets } from "@batonfx/providers"

export const deterministicModels = Deterministic.withDeterministic()
export const ollamaModels = Presets.withOllama({ model: "llama3.2" })
export const catalog = Catalog.layer([
  { provider: "ollama", model: "llama3.2", contextWindow: 128_000, maxOutput: 8_192 },
])`,
      },
    ],
  },
  {
    path: "/docs/packages/memory",
    title: "Memory",
    navTitle: "Memory",
    group: "Packages",
    lead: "Memory is an optional per-run recall and remember seam. Core owns timing; @batonfx/memory owns in-process implementations.",
    summary: [
      "RunOptions.memory.key is host-chosen and includes agent plus subject. Baton never derives a subject automatically.",
      "Recall runs once before non-resume turn 0 and inserts one user message before the run prompt.",
      "Remember runs after completed streamed turns; terminal remember happens before persisted-chat save and Completed.",
    ],
    invariants: [
      "Missing Memory is fine unless RunOptions.memory is set, in which case the run fails before the first model call.",
      "SemanticRecall consumes Effect AI embedding layers and never imports provider SDKs.",
      "Durable memory stores are host adapters, not part of @batonfx/memory.",
    ],
    exports: [
      "Memory.merge",
      "Memory.noopLayer",
      "Memory.testLayer",
      "VectorStore.memoryLayer",
      "SemanticRecall.layer",
      "WorkingMemory.layer",
      "combinedLayer",
    ],
    examples: [
      {
        label: "Memory layers",
        language: "ts",
        code: `import { Memory } from "@batonfx/core"
import { VectorStore, WorkingMemory, combinedLayer } from "@batonfx/memory"

export const noMemory = Memory.noopLayer
export const vectorStore = VectorStore.memoryLayer
export const workingMemory = WorkingMemory.layer({ maxMessages: 24 })
export const memory = combinedLayer({ semantic: { limit: 5 } })`,
      },
    ],
  },
  {
    path: "/docs/core/multi-agent",
    title: "In-process multi-agent",
    navTitle: "Multi-agent",
    group: "Core seams",
    lead: "Baton's multi-agent support is same-process and non-durable: one Agent can call another as a tool, transfer through handoff tools, or fan out in parallel.",
    summary: [
      "AgentTool.asTool exposes an agent as an Ai.Toolkit.WithHandler.",
      "Handoff.transferTool names a child-agent transfer tool using transfer_to_<target.name> by default.",
      "Handoff.fanOut runs isolated Agent.generate calls with bounded concurrency and preserves input order.",
    ],
    invariants: [
      "Durable, addressable, cross-process child executions remain outside Baton.",
      "Child run failures at a tool boundary become failed tool results.",
      "fanOut is not a tool boundary, so child RunError values propagate.",
    ],
    exports: ["AgentTool.asTool", "Handoff.transferTool", "Handoff.fanOut", "Handoff.supervisor"],
    examples: [
      {
        label: "Child agent as a tool",
        language: "ts",
        code: `import { Agent, AgentTool, Handoff } from "@batonfx/core"

const specialist = Agent.make({
  name: "researcher",
  instructions: "Answer with only verified facts.",
})

export const researcherTool = AgentTool.asTool(specialist)
export const transferToResearcher = Handoff.transferTool(specialist)`,
      },
    ],
  },
  {
    path: "/docs/packages/transport",
    title: "Transport",
    navTitle: "Transport",
    group: "Packages",
    lead: "@batonfx/transport turns Agent.stream into replayable wire frames for non-durable chat transports.",
    summary: [
      "Server frame seq values are monotonic per session and are the replay cursor.",
      "Terminal outcomes are data frames, not connection failures. Every logical run emits exactly one Ended frame after Completed, Suspended, or Failed.",
      "SessionRegistry is the seam durable hosts replace; SSE, WebSocket, and client adapters depend on the seam.",
    ],
    invariants: [
      "layerMemory stores live run state and replay frames only. Chat history belongs to Effect AI Chat.Persistence.",
      "Slow subscribers do not block the model stream.",
      "Browser clients decode LooseServerFrame so unknown tool names can still be displayed.",
    ],
    exports: ["Client", "Errors", "SessionRegistry", "Sse", "Wire", "Ws"],
    examples: [
      {
        label: "Memory registry",
        language: "ts",
        code: `import { Agent } from "@batonfx/core"
import { SessionRegistry, Wire } from "@batonfx/transport"

const agent = Agent.make({ name: "assistant" })

export const registryLayer = SessionRegistry.layerMemory({ agent })
export const frame: Wire.ClientFrameType = {
  _tag: "SendMessage",
  sessionId: "local",
  prompt: "hello",
}`,
      },
    ],
  },
  {
    path: "/docs/packages/foldkit",
    title: "FoldKit adapter",
    navTitle: "FoldKit adapter",
    group: "Packages",
    lead: "@batonfx/foldkit adapts Baton transport into FoldKit applications as headless state, commands, subscriptions, and connection resources.",
    summary: [
      "AgentConnection is a long-lived Effect resource supplied through FoldKit runtime resources.",
      "Chat.Model tracks session id, connection state, last accepted seq, run state, entries, streaming buffers, and draft text.",
      "The package exposes view-data helpers for foldcn-aligned prompt input, tool status, and conversation rows without importing copied foldcn components.",
    ],
    invariants: [
      "The adapter is not a durable runtime and does not add a styled chat component.",
      "Replay idempotence drops frames whose seq is less than or equal to lastSeq.",
      "SSE command POST routes are host conventions, not part of this package.",
    ],
    exports: ["Chat", "Connection"],
    examples: [
      {
        label: "Headless chat state",
        language: "ts",
        code: `import { Chat, Connection } from "@batonfx/foldkit"

export const model = Chat.initialModel(null)
export const promptStatus = Chat.promptInputStatusOf(model.run)
export const connectionLayer = Connection.layerWebSocket({ url: "ws://localhost:4000/ws" })`,
      },
    ],
  },
]

export const navGroups: ReadonlyArray<NavGroup> = ["Start", "Core seams", "Packages"].map((group) => ({
  title: group,
  pages: docsPages.filter((page) => page.group === group),
}))

export const allDocsPages = docsPages

export const pageByPath: ReadonlyMap<string, DocPage> = new Map(docsPages.map((page) => [page.path, page]))

export const homePath = "/"

export const defaultDocsPath = "/docs/getting-started"

export const commandItems: ReadonlyArray<Readonly<{ label: string; path: string }>> = [
  { label: "Home", path: homePath },
  ...docsPages.map((page) => ({ label: page.title, path: page.path })),
]
