import { describe, expect, it } from "@effect/vitest"
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

describe("@batonfx/core public surface", () => {
  it("keeps the frozen root namespace and Effect AI keys", async () => {
    const module = await import("../src/index.js")
    expect(Object.keys(module).toSorted()).toEqual([
      "Agent",
      "AgentEvent",
      "AgentManifest",
      "AgentProgram",
      "AgentTool",
      "AiError",
      "Approvals",
      "Chat",
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
      "Permissions",
      "Pins",
      "ProgramBindings",
      "ProgramCapabilities",
      "ProgramHost",
      "ProgramManifest",
      "Prompt",
      "Response",
      "RunBudget",
      "SandboxExecutor",
      "Session",
      "SessionSync",
      "SkillSource",
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
      "TurnPolicy",
    ])
  })
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

  it("exports the model telemetry contract", () => {
    expect(ModelTelemetry.Event).toBeDefined()
    expect(ModelTelemetry.ModelCallStarted).toBeDefined()
    expect(ModelTelemetry.ModelAttemptStarted).toBeDefined()
    expect(ModelTelemetry.ModelAttemptFirstOutput).toBeDefined()
    expect(ModelTelemetry.ModelAttemptCompleted).toBeDefined()
    expect(ModelTelemetry.ModelAttemptFailed).toBeDefined()
    expect(ModelTelemetry.ModelRetryScheduled).toBeDefined()
    expect(ModelTelemetry.ModelCallCompleted).toBeDefined()
    expect(ModelTelemetry.ModelCallFailed).toBeDefined()
    expect(ModelTelemetry.CompactionStarted).toBeDefined()
    expect(ModelTelemetry.CompactionSkipped).toBeDefined()
    expect(ModelTelemetry.CompactionApplied).toBeDefined()
    expect(ModelTelemetry.CompactionFailed).toBeDefined()
    expect(ModelTelemetry.ModelCallPurpose).toBeDefined()
    expect(ModelTelemetry.ModelFailureCategory).toBeDefined()
    expect(ModelTelemetry.ModelFailureClassification).toBeDefined()
    expect(ModelTelemetry.ModelRetryReason).toBeDefined()
    expect(ModelTelemetry.ModelFirstOutputKind).toBeDefined()
    expect(ModelTelemetry.CompactionTrigger).toBeDefined()
    expect(ModelTelemetry.CompactionKind).toBeDefined()
    expect(ModelTelemetry.classifyFailureCategory).toBeTypeOf("function")
  })
})
