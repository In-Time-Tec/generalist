import type { Effect, Option, Stream } from "effect"
import type { Chat, LanguageModel, Prompt, Tool } from "effect/unstable/ai"
import type { AgentRunState } from "../run-state.js"
import type { AgentError, Event } from "../event.js"
import type { AnyToolCall } from "../tools/result.js"
import type { DriverInterpreter } from "../../durable/driver/interpreter.js"
import type { HandoffRunState } from "../handoff/state.js"
import type { RunError, ToolSchedulingPolicy } from "../service.js"
import type { Middleware } from "../../model/middleware.js"
import type { ModelResilience } from "../../model/resilience.js"
import type { EventPayload as DeliveryEventPayload } from "../../model/telemetry/events.js"
import type { ModelProviderUsage } from "../../model/attempt/observation.js"
import type { Request } from "../../tools/tool-executor.js"
import type { Registry } from "../../tools/tool-registry.js"
import type { ToolContext } from "../../tools/tool-context.js"
import type { ModelSource } from "./model-source.js"

export type StaticToolServices<T extends Record<string, Tool.Any>> =
  | Tool.HandlersFor<T>
  | Exclude<Tool.HandlerServices<T[keyof T]>, ToolContext>

/** @internal Services required inside an already-selected active model scope. */
export type ActiveModelServices<T extends Record<string, Tool.Any>, R> =
  | LanguageModel.LanguageModel
  | R
  | StaticToolServices<T>
  | DriverInterpreter

/** @experimental Services remaining after an ambient or registered active model is scoped. */
export type ModelTurnServices<T extends Record<string, Tool.Any>, R> = R | StaticToolServices<T> | DriverInterpreter

export type RuntimeContext<T extends Record<string, Tool.Any>, R> = {
  readonly agent: {
    readonly name: string
    readonly toolScheduling: ToolSchedulingPolicy
    readonly model?: import("../../model/registry.js").ModelSelection
  }
  readonly handoffStateRef?: import("effect").Ref.Ref<HandoffRunState>
  readonly modelSource: ModelSource
  readonly resilienceService: Option.Option<typeof ModelResilience.Service>
  readonly activeModelResponse: Option.Option<
    typeof import("../../model/result/active-model-response.js").ActiveModelResponse.Service
  >
  readonly telemetryIdentity: {
    readonly current:
      | { readonly modelCallId: string; readonly modelAttemptId: string; readonly attempt: number }
      | undefined
  }
  readonly modelCallUsage: ReadonlyMap<string, ModelProviderUsage | undefined>
  readonly instrumentModel: (model: LanguageModel.Service, turn: number) => LanguageModel.Service
  readonly chain: ReadonlyArray<Middleware>
  readonly preparePrompt: (
    turn: number,
    prompt: Prompt.Prompt,
    overflow: boolean,
  ) => Effect.Effect<
    { readonly prompt: Prompt.Prompt; readonly changed: boolean },
    RunError,
    LanguageModel.LanguageModel | DriverInterpreter
  >
  readonly countTokens: (turn: number, prompt: Prompt.Prompt) => Effect.Effect<number, AgentError>
  readonly syncSession: (
    turn: number,
    transcript: Prompt.Prompt,
  ) => Effect.Effect<ReadonlyArray<import("../../context/session.js").Entry>, RunError, DriverInterpreter>
  readonly replayMessages: (sessionParentId: string) => Effect.Effect<ReadonlyArray<Prompt.Message>, RunError>
  readonly emitTelemetry: (payload: DeliveryEventPayload) => Effect.Effect<void>
  readonly chat: Chat.Service
  readonly compactionService: Option.Option<typeof import("../../turn/compaction.js").Compaction.Service>
  readonly state: AgentRunState
  readonly errorMessage: <E>(error: E) => string
  readonly toolCallEvents: (
    turn: number,
    batch: Request["toolCallBatch"],
    index: number,
    call: AnyToolCall,
    messages: ReadonlyArray<Prompt.Message>,
    registry: Registry,
  ) => Stream.Stream<Event, RunError, R | StaticToolServices<T> | DriverInterpreter>
}
