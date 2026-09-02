import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { ActiveModelResponse, ModelTelemetry } from "../src/index"

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
      "FanOut",
      "HostSession",
      "LocalScheduler",
      "Mailbox",
      "Message",
      "Messaging",
      "ModelPreview",
      "OperationResolution",
      "Recovery",
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
    "instructions",
    () => import("../src/instructions/index.js"),
    [
      "Authorship",
      "Entry",
      "FileSystemStore",
      "Instructions",
      "Overview",
      "PackageCatalog",
      "Refinement",
      "Registration",
      "Snapshot",
      "State",
      "Store",
      "fromText",
      "layer",
      "layerTest",
      "load",
      "render",
    ],
  ],
  [
    "instructions/skills",
    () => import("../src/instructions/skills/index.js"),
    ["FileSystemCatalog", "GitHubCatalog", "HttpCatalog", "S3Catalog"],
  ],
  [
    "transport",
    () => import("../src/unstable/transport/index.js"),
    ["Chaos", "Errors", "Replay", "RunClient", "SSE", "Snapshot", "WebSocket", "Wire"],
  ],
  ["mcp", () => import("../src/unstable/mcp/index.js"), ["MCPClient", "OAuth"]],
  [
    "testing",
    () => import("../src/testing/index.js"),
    ["KernelProviderConformance", "TestModel", "Testing", "codeExecutorConformance"],
  ],
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
  ["ag-ui", () => import("../src/unstable/ag-ui/index.js"), ["AGUI", "Errors"]],
  ["a2a", () => import("../src/unstable/a2a/index.js"), ["A2A", "Content", "Errors", "Projection"]],
  ["foldkit", () => import("../src/unstable/foldkit/index.js"), ["Chat", "Connection"]],
  [
    "memory",
    () => import("../src/memory/index.js"),
    [
      "SemanticRecall",
      "Supermemory",
      "SupermemoryError",
      "VectorStore",
      "WorkingMemory",
      "layer",
      "layerPgVector",
      "layerSupermemory",
    ],
  ],
  [
    "memo",
    () => import("../src/memo.js"),
    ["Dependencies", "layerDependencies", "layerMemory", "layerSql", "models", "pure"],
  ],
]

describe("generalist public surface", () => {
  it.effect("keeps the frozen root namespace", () =>
    Effect.gen(function* () {
      const module = yield* Effect.promise(() => import("../src/index.js"))
      expect(Object.keys(module).toSorted()).toEqual([
        "ActiveModelResponse",
        "Agent",
        "AgentEvent",
        "AgentManifest",
        "AgentProgram",
        "AgentTool",
        "Approvals",
        "CodeExecutor",
        "Compaction",
        "ContextOverflow",
        "DurableDriver",
        "ExecutableManifest",
        "Guardrail",
        "Handoff",
        "Instructions",
        "Memo",
        "Memory",
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
        "RunBudget",
        "RunId",
        "Session",
        "SessionHistory",
        "SessionSync",
        "SkillCatalog",
        "Steering",
        "ToolAuthorization",
        "ToolContext",
        "ToolExecutor",
        "ToolOutput",
        "ToolPlacement",
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
