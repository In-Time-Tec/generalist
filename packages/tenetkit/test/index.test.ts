import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import {
  AiError as EffectAiError,
  Chat as EffectChat,
  EmbeddingModel as EffectEmbeddingModel,
  IdGenerator as EffectIdGenerator,
  LanguageModel as EffectLanguageModel,
  Model as EffectModel,
  Prompt as EffectPrompt,
  Response as EffectResponse,
  Telemetry as EffectTelemetry,
  Tokenizer as EffectTokenizer,
  Tool as EffectTool,
  Toolkit as EffectToolkit,
} from "effect/unstable/ai"
import {
  ActiveModelResponse,
  AiError,
  Chat,
  EmbeddingModel,
  IdGenerator,
  LanguageModel,
  Model,
  ModelTelemetry,
  Prompt,
  Response,
  Telemetry,
  Tokenizer,
  Tool,
  Toolkit,
} from "../src/index"

type FeatureEntry = readonly [subpath: string, load: () => Promise<object>, keys: ReadonlyArray<string>]

const featureEntries: ReadonlyArray<FeatureEntry> = [
  [
    "runtime",
    () => import("../src/runtime/index.js"),
    [
      "Address",
      "AgentDirectory",
      "Approval",
      "ChildAdmission",
      "ChildReadiness",
      "ChildRuns",
      "ChildSettlement",
      "CodeMode",
      "Cursor",
      "Errors",
      "ExecutableManifest",
      "ExecutableRegistration",
      "ExecutableResolver",
      "ExecutionState",
      "ExternalChildPlacement",
      "ExternalChildStore",
      "FanOut",
      "LocalScheduler",
      "Mailbox",
      "Message",
      "Messaging",
      "ModelPreview",
      "OperationResolution",
      "Run",
      "RunEvent",
      "RunExecutor",
      "RunStore",
      "RunTree",
      "RunWait",
      "Runtime",
      "Steering",
      "TreePolicy",
    ],
  ],
  [
    "agent-guidance",
    () => import("../src/agent-guidance/index.js"),
    ["Authorship", "Entry", "FileSystemStore", "Overview", "Refinement", "Registration", "Snapshot", "State", "Store"],
  ],
  [
    "skills",
    () => import("../src/skills/index.js"),
    ["FileSystemCatalog", "GitHubCatalog", "HttpCatalog", "S3Catalog"],
  ],
  ["instructions", () => import("../src/instructions.js"), ["load"]],
  [
    "transport",
    () => import("../src/transport/index.js"),
    ["Errors", "Replay", "RunClient", "SSE", "Snapshot", "WebSocket", "Wire"],
  ],
  ["mcp", () => import("../src/mcp/index.js"), ["MCPClient", "OAuth"]],
  ["test", () => import("../src/test/index.js"), ["KernelProviderConformance", "TestModel", "codeExecutorConformance"]],
  [
    "repl",
    () => import("../src/repl/index.js"),
    [
      "Cell",
      "CellTool",
      "HostBindings",
      "KernelPool",
      "KernelProfile",
      "KernelResourceAuthority",
      "KernelSnapshotStore",
      "RemoteKernelProtocol",
      "TestKernel",
    ],
  ],
  [
    "repl/bun",
    () => import("../src/repl/bun/index.js"),
    ["BunKernelPool", "BunKernelSnapshotStore", "workerModule", "workerSupportModules"],
  ],
  ["ag-ui", () => import("../src/interoperability/ag-ui/index.js"), ["AGUI", "Errors"]],
  ["a2a", () => import("../src/interoperability/a2a/index.js"), ["A2A", "Content", "Errors", "Projection"]],
  ["foldkit", () => import("../src/foldkit/index.js"), ["Chat", "Connection"]],
  ["memory", () => import("../src/memory/index.js"), ["SemanticRecall", "VectorStore", "WorkingMemory", "layer"]],
]

describe("tenetkit public surface", () => {
  it.effect("keeps the frozen root namespace and Effect AI keys", () =>
    Effect.gen(function* () {
      const module = yield* Effect.promise(() => import("../src/index.js"))
      expect(Object.keys(module).toSorted()).toEqual([
        "ActiveModelResponse",
        "Agent",
        "AgentEvent",
        "AgentManifest",
        "AgentProgram",
        "AgentTool",
        "AiError",
        "Approvals",
        "Chat",
        "CodeExecutor",
        "Compaction",
        "ContextOverflow",
        "DurableDriver",
        "EmbeddingModel",
        "ExecutableManifest",
        "Guardrail",
        "Handoff",
        "IdGenerator",
        "Instructions",
        "LanguageModel",
        "Memory",
        "Model",
        "ModelMiddleware",
        "ModelRegistry",
        "ModelResilience",
        "ModelStreamTermination",
        "ModelTelemetry",
        "ModelToolCallValidation",
        "NestedOperation",
        "Permissions",
        "Pins",
        "Policy",
        "ProgramCapabilities",
        "ProgramHandlers",
        "ProgramManifest",
        "ProgramRunner",
        "Prompt",
        "Response",
        "RunBudget",
        "RunId",
        "Session",
        "SessionHistory",
        "SessionSync",
        "SkillCatalog",
        "Steering",
        "Telemetry",
        "Tokenizer",
        "Tool",
        "ToolAuthorization",
        "ToolContext",
        "ToolExecutor",
        "ToolOutput",
        "ToolPlacement",
        "Toolkit",
        "withCacheBreakpoints",
      ])
    }),
  )

  it.effect("keeps exact feature namespace keys", () =>
    Effect.gen(function* () {
      for (const [subpath, load, keys] of featureEntries) {
        const module = yield* Effect.promise(load)
        expect(Object.keys(module).toSorted(), subpath).toEqual(keys)
      }
    }),
  )

  it("re-exports Effect AI primitives by identity", () => {
    expect(Tool).toBe(EffectTool)
    expect(Toolkit).toBe(EffectToolkit)
    expect(LanguageModel).toBe(EffectLanguageModel)
    expect(Prompt).toBe(EffectPrompt)
    expect(Response).toBe(EffectResponse)
    expect(Chat).toBe(EffectChat)
    expect(Tokenizer).toBe(EffectTokenizer)
    expect(AiError).toBe(EffectAiError)
    expect(EmbeddingModel).toBe(EffectEmbeddingModel)
    expect(IdGenerator).toBe(EffectIdGenerator)
    expect(Model).toBe(EffectModel)
    expect(Telemetry).toBe(EffectTelemetry)
  })

  it("exports only the read-only active response handle", () => {
    const handle = ActiveModelResponse.make()
    expect(ActiveModelResponse.ActiveModelResponse).toBeDefined()
    expect(Effect.isEffect(handle.snapshot)).toBe(true)
    expect("accept" in handle).toBe(false)
    expect(Object.keys(ActiveModelResponse).toSorted()).toEqual(["ActiveModelResponse", "make"])
  })

  it("exports the model telemetry contract", () => {
    expect(ModelTelemetry.Event).toBeDefined()
    expect(ModelTelemetry.CallStarted).toBeDefined()
    expect(ModelTelemetry.AttemptStarted).toBeDefined()
    expect(ModelTelemetry.AttemptFirstOutput).toBeDefined()
    expect(ModelTelemetry.AttemptCompleted).toBeDefined()
    expect(ModelTelemetry.AttemptFailed).toBeDefined()
    expect(ModelTelemetry.RetryScheduled).toBeDefined()
    expect(ModelTelemetry.CallCompleted).toBeDefined()
    expect(ModelTelemetry.CallFailed).toBeDefined()
    expect(ModelTelemetry.CompactionStarted).toBeDefined()
    expect(ModelTelemetry.CompactionSkipped).toBeDefined()
    expect(ModelTelemetry.CompactionApplied).toBeDefined()
    expect(ModelTelemetry.CompactionFailed).toBeDefined()
    expect(ModelTelemetry.CallPurpose).toBeDefined()
    expect(ModelTelemetry.FailureCategory).toBeDefined()
    expect(ModelTelemetry.FailureClassification).toBeDefined()
    expect(ModelTelemetry.RetryReason).toBeDefined()
    expect(ModelTelemetry.FirstOutputKind).toBeDefined()
    expect(ModelTelemetry.CompactionTrigger).toBeDefined()
    expect(ModelTelemetry.CompactionKind).toBeDefined()
    expect(ModelTelemetry.classifyFailureCategory).toBeTypeOf("function")
  })
})
