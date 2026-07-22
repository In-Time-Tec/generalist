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
  ResponseIdTracker as EffectResponseIdTracker,
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
  ResponseIdTracker,
  Telemetry,
  Tokenizer,
  Tool,
  Toolkit,
} from "../src/index"

describe("@batonfx/core public surface", () => {
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
    expect(ResponseIdTracker).toBe(EffectResponseIdTracker)
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
    expect(ModelTelemetry.CompactionCompleted).toBeDefined()
    expect(ModelTelemetry.CompactionFailed).toBeDefined()
    expect(ModelTelemetry.ModelCallPurpose).toBeDefined()
    expect(ModelTelemetry.ModelFailureCategory).toBeDefined()
    expect(ModelTelemetry.ModelFailureClassification).toBeDefined()
    expect(ModelTelemetry.ModelRetryReason).toBeDefined()
    expect(ModelTelemetry.ModelFirstOutputKind).toBeDefined()
    expect(ModelTelemetry.ModelCost).toBeDefined()
    expect(ModelTelemetry.CompactionTrigger).toBeDefined()
    expect(ModelTelemetry.CompactionKind).toBeDefined()
    expect(ModelTelemetry.classifyFailureCategory).toBeTypeOf("function")
  })
})
