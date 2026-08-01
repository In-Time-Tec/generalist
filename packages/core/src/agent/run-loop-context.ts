import { type Effect, type Option, type Ref, type Schema, type Stream } from "effect"
import type { Chat, LanguageModel, Prompt, Response, Tool } from "effect/unstable/ai"
import type { AgentError, AgentSuspended, Event, SteeringDrained } from "../agent-event.js"
import type { Agent, RunError } from "../agent.js"
import type { PendingToolResult, AnyToolCall } from "../agent-tool-result.js"
import type { Result as CompactionResult } from "../compaction.js"
import type { LanguageModelNotRegistered } from "../model-registry.js"
import type { ModelCallPurpose, DeliveryFailed } from "../model-telemetry.js"
import type { Decision, TurnOverrides } from "../turn-policy.js"
import type { Key, Memory } from "../memory.js"
import type { Middleware } from "../model-middleware.js"
import type { Registry } from "../tool-registry.js"
import type { Request } from "../tool-executor.js"
import type { SuspensionCheckpoint } from "../agent-suspension.js"
import type { SessionStore, Entry } from "../session.js"
import type { Steering, Input } from "../steering.js"
import type { ToolContext } from "../tool-context.js"

export type ObjectSchema = Schema.Codec<unknown, Record<string, unknown>, unknown, unknown>
export interface StructuredRunConfig<S extends ObjectSchema> {
  readonly schema: S
  readonly objectName: string
  readonly objectPrompt: Prompt.RawInput
}
export type StaticToolServices<T extends Record<string, Tool.Any>> =
  | Tool.HandlersFor<T>
  | Exclude<Tool.HandlerServices<T[keyof T]>, ToolContext>
export type ToolState = {
  readonly registry: Registry
  readonly activatedSkillBodies: Map<string, string>
}
export interface RunLoopContext<Tools extends Record<string, Tool.Any>, R, S extends ObjectSchema> {
  readonly agent: Agent<Tools, R>
  readonly options: import("../agent.js").RunOptions
  readonly state: import("./agent-run-state.js").AgentRunState
  readonly chat: Chat.Service
  readonly chain: ReadonlyArray<Middleware>
  readonly activeSession: Option.Option<typeof SessionStore.Service>
  readonly memoryRuntime: { readonly key: Key; readonly service: typeof Memory.Service } | undefined
  readonly steeringService: Option.Option<typeof Steering.Service>
  readonly structured: StructuredRunConfig<S> | undefined
  readonly validatedResume: SuspensionCheckpoint | undefined
  readonly seedSystem: string | undefined
  readonly recallInitialPrompt: (prompt: Prompt.Prompt) => Effect.Effect<Prompt.Prompt, AgentError>
  readonly initialPrompt: Prompt.RawInput
  readonly toolState: Ref.Ref<ToolState>
  readonly modelTurn: (
    turn: number,
    prompt: Prompt.RawInput,
    registry: Registry,
    overrides?: TurnOverrides,
  ) => Stream.Stream<Event, RunError, LanguageModel.LanguageModel | R | StaticToolServices<Tools>>
  readonly captureStructuredUsage: (content: ReadonlyArray<Response.Part<any>>) => Effect.Effect<void>
  readonly withModelTelemetry: <A, E, R2>(
    turn: number,
    purpose: ModelCallPurpose,
  ) => (effect: Effect.Effect<A, E, R2>) => Effect.Effect<A, E, R2 | LanguageModel.LanguageModel>
  readonly withAgentModel: <A, E, R2>(
    effect: Effect.Effect<A, E, R2>,
  ) => Effect.Effect<A, E | LanguageModelNotRegistered, R2>
  readonly syncSession: (turn: number, transcript: Prompt.Prompt) => Effect.Effect<ReadonlyArray<Entry>, AgentError>
  readonly applyCompactionResult: (
    turn: number,
    result: CompactionResult,
    parentId: string | null,
  ) => Effect.Effect<void, RunError>
  readonly savePersisted: (turn: number) => Effect.Effect<void, AgentError>
  readonly deliverPending: () => Effect.Effect<void, DeliveryFailed>
  readonly flushTelemetry: () => ReadonlyArray<Event>
  readonly telemetryIdentity: {
    readonly current:
      | { readonly modelCallId: string; readonly modelAttemptId: string; readonly attempt: number }
      | undefined
  }
  readonly checkpointPending: (
    turn: number,
    pending: ReadonlyArray<PendingToolResult>,
  ) => Effect.Effect<Prompt.Prompt, AgentError>
  readonly checkpointSuspended: (
    turn: number,
    pending: ReadonlyArray<PendingToolResult>,
    suspension: AgentSuspended,
  ) => Effect.Effect<Prompt.Prompt, RunError>
  readonly pendingResults: () => ReadonlyArray<PendingToolResult>
  readonly toolCallEvents: (
    turn: number,
    batch: Request["toolCallBatch"],
    index: number,
    call: AnyToolCall,
    messages: ReadonlyArray<Prompt.Message>,
    registry: Registry,
  ) => Stream.Stream<Event, RunError, R | StaticToolServices<Tools>>
  readonly rememberTurn: (
    turn: number,
    transcript: Prompt.Prompt,
    terminal: boolean,
    path: ReadonlyArray<Entry>,
  ) => Effect.Effect<void, AgentError>
  readonly withSystem: (system: string, prompt: Prompt.Prompt) => Prompt.Prompt
  readonly steeringDrainedEvent: (
    turn: number,
    queue: "steering" | "followUp",
    inputs: ReadonlyArray<Input>,
  ) => SteeringDrained
  readonly isTurnPolicyDecision: (input: unknown) => input is Decision
}
