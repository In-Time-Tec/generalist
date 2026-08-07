import { type Effect, type Option, type Ref, type Schema, type Stream } from "effect"
import type { Chat, LanguageModel, Prompt, Response, Tool } from "effect/unstable/ai"
import type { AgentError, AgentSuspended, Event, SteeringDrained } from "./agent-event.js"
import type { DriverInterpreter } from "../durable/driver-interpreter.js"
import type { Agent, RunError } from "./agent.js"
import type { PendingToolResult, AnyToolCall } from "./agent-tool-result.js"
import type { Result as CompactionResult } from "../turn/compaction.js"
import type { LanguageModelNotRegistered } from "../model/model-registry.js"
import type { ModelCallPurpose, DeliveryFailed } from "../model/model-telemetry.js"
import type { Decision, TurnOverrides } from "../turn/turn-policy.js"
import type { Key, Memory } from "../context/memory.js"
import type { Middleware } from "../model/model-middleware.js"
import type { Registry } from "../tools/tool-registry.js"
import type { Request } from "../tools/tool-executor.js"
import type { SuspensionCheckpoint } from "./agent-suspension.js"
import type { HandoffRunState } from "./handoff-state.js"
import type { SessionStore, Entry } from "../context/session.js"
import type { Steering, Input } from "../turn/steering.js"
import type { ToolContext } from "../tools/tool-context.js"

export type ObjectSchema = Schema.Codec<unknown, Record<string, unknown>, any, any>
export interface StructuredRunConfig<S extends ObjectSchema> {
  readonly schema: S
  readonly objectName: string
  readonly objectPrompt: Prompt.RawInput
}
/** @experimental Decoding services a structured-output schema requires, with an unconstrained schema contributing none. */
export type SchemaServicesD<S extends ObjectSchema> = [unknown] extends [S["DecodingServices"]]
  ? never
  : S["DecodingServices"]
export type StaticToolServices<T extends Record<string, Tool.Any>> =
  | Tool.HandlersFor<T>
  | Exclude<Tool.HandlerServices<T[keyof T]>, ToolContext>

/** @experimental Every service one run loop turn requires. */
export type LoopServices<Tools extends Record<string, Tool.Any>, R, S extends ObjectSchema> =
  | R
  | LanguageModel.LanguageModel
  | StaticToolServices<Tools>
  | SchemaServicesD<S>
  | DriverInterpreter

/** @experimental Every service one model turn requires. */
export type TurnServices<S extends ObjectSchema> = LanguageModel.LanguageModel | SchemaServicesD<S> | DriverInterpreter

export type ToolState = {
  readonly registry: Registry
  readonly activatedSkillBodies: Map<string, string>
}
export interface RunLoopContext<Tools extends Record<string, Tool.Any>, R, S extends ObjectSchema> {
  readonly agent: Agent<Tools, R>
  readonly options: import("./agent.js").RunOptions
  readonly state: import("./agent-run-state.js").AgentRunState
  readonly chat: Chat.Service
  readonly chain: ReadonlyArray<Middleware>
  readonly activeSession: Option.Option<typeof SessionStore.Service>
  readonly memoryRuntime: { readonly key: Key; readonly service: typeof Memory.Service } | undefined
  readonly steeringService: Option.Option<typeof Steering.Service>
  readonly structured: StructuredRunConfig<S> | undefined
  readonly validatedResume: SuspensionCheckpoint | undefined
  readonly seedSystem: string | undefined
  readonly recallInitialPrompt: (prompt: Prompt.Prompt) => Effect.Effect<Prompt.Prompt, RunError, DriverInterpreter>
  readonly initialPrompt: Prompt.RawInput
  readonly toolState: Ref.Ref<ToolState>
  readonly handoffStateRef?: Ref.Ref<HandoffRunState>
  readonly modelTurn: (
    turn: number,
    prompt: Prompt.RawInput,
    registry: Registry,
    overrides?: TurnOverrides,
  ) => Stream.Stream<Event, RunError, LanguageModel.LanguageModel | R | StaticToolServices<Tools> | DriverInterpreter>
  readonly captureStructuredUsage: (
    content: ReadonlyArray<Response.Part<Record<string, Tool.Any>>>,
  ) => Effect.Effect<void>
  readonly withModelTelemetry: <A, E, R2>(
    turn: number,
    purpose: ModelCallPurpose,
  ) => (effect: Effect.Effect<A, E, R2>) => Effect.Effect<A, E, R2 | LanguageModel.LanguageModel>
  readonly withAgentModel: <A, E, R2>(
    effect: Effect.Effect<A, E, R2>,
  ) => Effect.Effect<A, E | LanguageModelNotRegistered, R2>
  readonly syncSession: (
    turn: number,
    transcript: Prompt.Prompt,
  ) => Effect.Effect<ReadonlyArray<Entry>, RunError, DriverInterpreter>
  readonly applyCompactionResult: (
    turn: number,
    result: CompactionResult,
    parentId: string | null,
    applicationIdentity: string,
  ) => Effect.Effect<void, RunError, DriverInterpreter>
  readonly savePersisted: (turn: number) => Effect.Effect<void, AgentError>
  readonly deliverPending: Effect.Effect<void, DeliveryFailed>
  readonly flushTelemetry: () => ReadonlyArray<Event>
  readonly telemetryIdentity: {
    readonly current:
      | { readonly modelCallId: string; readonly modelAttemptId: string; readonly attempt: number }
      | undefined
  }
  readonly checkpointPending: (
    turn: number,
    pending: ReadonlyArray<PendingToolResult>,
  ) => Effect.Effect<Prompt.Prompt, RunError, DriverInterpreter>
  readonly checkpointSuspended: (
    turn: number,
    pending: ReadonlyArray<PendingToolResult>,
    suspension: AgentSuspended,
  ) => Effect.Effect<Prompt.Prompt, RunError, DriverInterpreter>
  readonly pendingResults: () => ReadonlyArray<PendingToolResult>
  readonly toolCallEvents: (
    turn: number,
    batch: Request["toolCallBatch"],
    index: number,
    call: AnyToolCall,
    messages: ReadonlyArray<Prompt.Message>,
    registry: Registry,
  ) => Stream.Stream<Event, RunError, R | StaticToolServices<Tools> | DriverInterpreter>
  readonly resumeApproved: (
    turn: number,
    batch: Request["toolCallBatch"],
    index: number,
    call: AnyToolCall,
    registry: Registry,
  ) => Stream.Stream<Event, RunError, R | StaticToolServices<Tools> | DriverInterpreter>
  readonly rememberTurn: (
    turn: number,
    transcript: Prompt.Prompt,
    terminal: boolean,
    path: ReadonlyArray<Entry>,
  ) => Effect.Effect<void, RunError, DriverInterpreter>
  readonly withSystem: (system: string, prompt: Prompt.Prompt) => Prompt.Prompt
  readonly steeringDrainedEvent: (
    turn: number,
    queue: "steering" | "followUp",
    inputs: ReadonlyArray<Input>,
  ) => SteeringDrained
  readonly isTurnPolicyDecision: (input: unknown) => input is Decision
}
