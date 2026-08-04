import type { Effect, Option, Stream } from "effect"
import type { Chat, LanguageModel, Prompt, Tool } from "effect/unstable/ai"
import type { AgentRunState } from "./agent-run-state.js"
import type { AgentError, Event } from "./agent-event.js"
import type { AnyToolCall } from "./agent-tool-result.js"
import type { HandoffRunState } from "./handoff-state.js"
import type { RunError } from "./agent.js"
import type { Middleware } from "../model/model-middleware.js"
import type { ModelSelection, ModelRegistry } from "../model/model-registry.js"
import type { ModelResilience } from "../model/model-resilience.js"
import type { EventPayload as DeliveryEventPayload } from "../model/model-telemetry.js"
import type { Request } from "../tools/tool-executor.js"
import type { Registry } from "../tools/tool-registry.js"
import type { ToolContext } from "../tools/tool-context.js"

export type StaticToolServices<T extends Record<string, Tool.Any>> =
  | Tool.HandlersFor<T>
  | Exclude<Tool.HandlerServices<T[keyof T]>, ToolContext>

export type RuntimeContext<T extends Record<string, Tool.Any>, R> = {
  readonly agent: {
    readonly name: string
    readonly toolExecution?: { readonly concurrency: number | "unbounded" }
    readonly model?: import("../model/model-registry.js").ModelSelection
  }
  readonly handoffStateRef?: import("effect").Ref.Ref<HandoffRunState>
  readonly agentModelRegistry: typeof ModelRegistry.Service | undefined
  readonly agentModel: ModelSelection | undefined
  readonly resilienceService: Option.Option<typeof ModelResilience.Service>
  readonly telemetryIdentity: {
    readonly current:
      | { readonly modelCallId: string; readonly modelAttemptId: string; readonly attempt: number }
      | undefined
  }
  readonly instrumentModel: (model: LanguageModel.Service, turn: number) => LanguageModel.Service
  readonly chain: ReadonlyArray<Middleware>
  readonly preparePrompt: (
    turn: number,
    prompt: Prompt.Prompt,
    overflow: boolean,
  ) => Effect.Effect<
    { readonly prompt: Prompt.Prompt; readonly changed: boolean },
    RunError,
    LanguageModel.LanguageModel
  >
  readonly countTokens: (turn: number, prompt: Prompt.Prompt) => Effect.Effect<number, AgentError>
  readonly emitTelemetry: (payload: DeliveryEventPayload) => Effect.Effect<void>
  readonly chat: Chat.Service
  readonly compactionService: Option.Option<typeof import("../turn/compaction.js").Compaction.Service>
  readonly state: AgentRunState
  readonly errorMessage: (error: unknown) => string
  readonly persisted: Chat.Persisted | undefined
  readonly toolCallEvents: (
    turn: number,
    batch: Request["toolCallBatch"],
    index: number,
    call: AnyToolCall,
    messages: ReadonlyArray<Prompt.Message>,
    registry: Registry,
  ) => Stream.Stream<Event, RunError, R | StaticToolServices<T>>
}
