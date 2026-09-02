import type { Effect, Option, Ref, Schema, Stream } from "effect"
import type { Chat, LanguageModel, Prompt, Response, Tool } from "effect/unstable/ai"
import type { AgentSuspended, Event, SteeringDrained } from "../event.js"
import type { DriverInterpreter } from "../../durable/driver/interpreter.js"
import type { Agent, RunError } from "../service.js"
import type { ModelTurnServices } from "../model-turn/context.js"
import type { PendingToolResult, AnyToolCall } from "../tools/result.js"
import type { Result as CompactionResult } from "../../turn/compaction.js"
import type { LanguageModelNotRegistered } from "../../model/registry.js"
import type { CallPurpose, SinkFailed } from "../../model/telemetry/events.js"
import type { Decision, TurnOverrides } from "../../turn/policy.js"
import type { Key, Memory } from "../../context/memory.js"
import type { Middleware } from "../../model/middleware.js"
import type { Registry } from "../../tools/tool-registry.js"
import type { Request } from "../../tools/tool-executor.js"
import type { SuspensionCheckpoint, ToolCheckpoint } from "../suspension.js"
import type { HandoffRunState } from "../handoff/state.js"
import type { Entry, SessionStore } from "../../context/session.js"
import type { RunInbox } from "../../turn/steering-inbox.js"
import type { Input } from "../../turn/steering.js"
import type { ToolContext } from "../../tools/tool-context.js"

export type ObjectSchema = Schema.Codec<Record<string, Schema.Top["Type"]>, object, unknown, unknown>
export interface StructuredRunConfig<S extends ObjectSchema> {
  readonly schema: S
  readonly objectName: string
  readonly objectPrompt: Prompt.RawInput
  readonly output: (value: S["Type"]) => unknown
}
/** @experimental Decoding services a structured-output schema requires, with an unconstrained schema contributing none. */
export type SchemaServicesD<S extends ObjectSchema> = S["DecodingServices"]
export type SchemaServicesE<S extends ObjectSchema> = S["EncodingServices"]
export type StaticToolServices<T extends Record<string, Tool.Any>> =
  | Tool.HandlersFor<T>
  | Exclude<Tool.HandlerServices<T[keyof T]>, ToolContext>

/** @experimental Every service one run loop turn requires. */
export type LoopServices<Tools extends Record<string, Tool.Any>, R, S extends ObjectSchema> =
  | R
  | StaticToolServices<Tools>
  | SchemaServicesD<S>
  | SchemaServicesE<S>
  | DriverInterpreter

/** @experimental Every service one model turn requires. */
export type TurnServices<R, S extends ObjectSchema> = R | SchemaServicesD<S> | SchemaServicesE<S> | DriverInterpreter

export type ToolState = {
  readonly registry: Registry
  readonly activatedSkillBodies: Map<string, string>
}
export interface RunLoopContext<Tools extends Record<string, Tool.Any>, R, S extends ObjectSchema> {
  readonly agent: Agent<Tools, R>
  readonly options: import("../service.js").RunOptions
  readonly state: import("../run-state.js").AgentRunState
  readonly chat: Chat.Service
  readonly chain: ReadonlyArray<Middleware>
  readonly activeSession: Option.Option<SessionStore>
  readonly memoryRuntime: { readonly key: Key; readonly service: typeof Memory.Service } | undefined
  readonly inbox: RunInbox
  readonly structured: StructuredRunConfig<S> | undefined
  readonly validatedResume: SuspensionCheckpoint | undefined
  readonly recoveredToolCheckpoint: ToolCheckpoint | undefined
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
  ) => Stream.Stream<Event, RunError, ModelTurnServices<Tools, R>>
  readonly captureStructuredUsage: (
    content: ReadonlyArray<Response.Part<Record<string, Tool.Any>>>,
  ) => Effect.Effect<void>
  readonly withModelTelemetry: <A, E, R2>(
    turn: number,
    purpose: CallPurpose,
  ) => (effect: Effect.Effect<A, E, R2>) => Effect.Effect<A, E, R2 | LanguageModel.LanguageModel>
  readonly withAgentModel: <A, E, R2>(
    effect: Effect.Effect<A, E, R2 | LanguageModel.LanguageModel>,
  ) => Effect.Effect<A, E | LanguageModelNotRegistered, R2 | R>
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
  readonly deliverPending: Effect.Effect<void, SinkFailed>
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
  readonly isPolicyDecision: (input: typeof Schema.Unknown.Type) => input is Decision
}
