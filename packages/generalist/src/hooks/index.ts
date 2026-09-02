import { Context, Effect, Layer, Schema } from "effect"
import { Prompt, Response } from "effect/unstable/ai"
import type { RunId } from "../core/durable/run-id.js"
import { ActionableTaggedError, errorHint } from "../core/error-hint.js"

/** Typed lifecycle boundary exposed to a hook declaration. */
export const Event = Schema.Literals([
  "RunStart",
  "TurnStart",
  "ModelCall",
  "ToolCall",
  "ToolResult",
  "ApprovalRequest",
  "Compaction",
  "ChildStart",
  "ChildEnd",
  "Steer",
  "RunEnd",
])
export type Event = typeof Event.Type

/** Continue the guarded operation unchanged. */
export interface Continue {
  readonly _tag: "Continue"
}

/** Stop the guarded operation before it crosses its boundary. */
export interface Block {
  readonly _tag: "Block"
  readonly reason: string
}

/** Replace the event-specific mutable value. */
export interface Replace<Value = unknown> {
  readonly _tag: "Replace"
  readonly value: Value
}

/** Append prompt context at a prompt-bearing boundary. */
export interface AddContext {
  readonly _tag: "AddContext"
  readonly prompt: Prompt.Prompt
}

/** Defer the guarded operation to the configured Approvals service. */
export interface Ask {
  readonly _tag: "Ask"
}

/** Serializable decision recorded in the durable driver checkpoint. */
export const Decision = Schema.Union([
  Schema.TaggedStruct("Continue", {}),
  Schema.TaggedStruct("Block", { reason: Schema.String }),
  Schema.TaggedStruct("Replace", { value: Schema.Unknown }),
  Schema.TaggedStruct("AddContext", { prompt: Prompt.Prompt }),
  Schema.TaggedStruct("Ask", {}),
])
export type Decision<Value = unknown> = Continue | Block | Replace<Value> | AddContext | Ask

/** Continue the guarded operation unchanged. */
export const Continue = (): Continue => ({ _tag: "Continue" })

/** Stop the guarded operation before it crosses its boundary. */
export const Block = (input: { readonly reason: string }): Block => ({ _tag: "Block", reason: input.reason })

/** Replace the event-specific mutable value. */
export const Replace = <Value>(value: Value): Replace<Value> => ({ _tag: "Replace", value })

/** Append context to the prompt at a prompt-bearing boundary. */
export const AddContext = (prompt: Prompt.RawInput): AddContext => ({
  _tag: "AddContext",
  prompt: Prompt.make(prompt),
})

/** Defer the guarded operation to the configured Approvals service. */
export const Ask = (): Ask => ({ _tag: "Ask" })

interface RunContext {
  readonly runId: RunId
  readonly agentName: string
}

/** Input observed before a Run begins. */
export interface RunStartInput extends RunContext {
  readonly input: Prompt.Prompt
}

/** Input observed before one zero-based turn begins. */
export interface TurnStartInput extends RunContext {
  readonly turn: number
  readonly prompt: Prompt.Prompt
}

/** Input observed at the ModelMiddleware prompt boundary. */
export interface ModelCallInput extends RunContext {
  readonly turn: number
  readonly prompt: Prompt.Prompt
}

/** Input observed before authorization and tool execution. */
export interface ToolCallInput extends RunContext {
  readonly turn: number
  readonly tool: string
  readonly args: unknown
  readonly call: Response.ToolCallPart<string, unknown>
}

/** Input observed after tool execution and before its result is committed. */
export interface ToolResultInput extends RunContext {
  readonly turn: number
  readonly tool: string
  readonly args: unknown
  readonly call: Response.ToolCallPart<string, unknown>
  readonly result: unknown
}

/** Stable approval identity exposed before Approvals resolves it. */
export interface Approval {
  readonly approvalId: string
  readonly operation: string
  readonly capability: string
  readonly input: unknown
}

/** Input observed before an approval request is resolved. */
export interface ApprovalRequestInput extends RunContext {
  readonly turn: number
  readonly call: Response.ToolCallPart<string, unknown>
  readonly request: Approval
}

/** Input observed when the loop has decided to attempt compaction. */
export interface CompactionInput extends RunContext {
  readonly turn: number
  readonly before: Prompt.Prompt
  readonly overflow: boolean
}

/** Process-local or durable child identity exposed to child hooks. */
export interface Child {
  readonly operation: string
  readonly selection: string
  readonly prompt?: Prompt.Prompt
  readonly childRunId?: string
  readonly label?: string
}

/** Input observed before a child is started or admitted. */
export interface ChildStartInput extends RunContext {
  readonly turn: number
  readonly child: Child
}

/** Input observed after a child reaches a result visible to its parent. */
export interface ChildEndInput extends RunContext {
  readonly turn: number
  readonly child: Child
  readonly result: unknown
}

/** Input observed when queued steering enters the next prompt. */
export interface SteerInput extends RunContext {
  readonly turn: number
  readonly queue: "steering" | "followUp"
  readonly count: number
  readonly prompt: Prompt.Prompt
}

/** Input observed immediately before the terminal Completed event. */
export interface RunEndInput<Output = unknown> extends RunContext {
  readonly turns: number
  readonly text: string
  readonly output: Output
  readonly transcript: Prompt.Prompt
}

type PromptDecision = Continue | Block | Replace<Prompt.RawInput> | AddContext
type ToolCallDecision = Continue | Block | Replace<unknown> | Ask
type ToolResultDecision = Continue | Block | Replace<unknown>
type ApprovalDecision = Continue | Block
type ChildStartDecision = Continue | Block
type ChildEndDecision = Continue | Block | Replace<unknown>
type RunEndDecision<Output> = Continue | Block | Replace<Output>

/** One Effectful typed lifecycle interceptor. `void` is shorthand for Continue. */
export type Hook<Input, HookDecision extends Decision = Decision> = (
  input: Input,
) => Effect.Effect<HookDecision | void, unknown>

interface HookDeclaration<Name extends Event, Input, HookDecision extends Decision> {
  readonly event: Name
  readonly hook: Hook<Input, HookDecision>
}

export type RunStart = HookDeclaration<"RunStart", RunStartInput, PromptDecision>
export type TurnStart = HookDeclaration<"TurnStart", TurnStartInput, PromptDecision>
export type ModelCall = HookDeclaration<"ModelCall", ModelCallInput, PromptDecision>
export type ToolCall = HookDeclaration<"ToolCall", ToolCallInput, ToolCallDecision>
export type ToolResult = HookDeclaration<"ToolResult", ToolResultInput, ToolResultDecision>
export type ApprovalRequest = HookDeclaration<"ApprovalRequest", ApprovalRequestInput, ApprovalDecision>
export type Compaction = HookDeclaration<"Compaction", CompactionInput, PromptDecision>
export type ChildStart = HookDeclaration<"ChildStart", ChildStartInput, ChildStartDecision>
export type ChildEnd = HookDeclaration<"ChildEnd", ChildEndInput, ChildEndDecision>
export type Steer = HookDeclaration<"Steer", SteerInput, PromptDecision>
export type RunEnd<Output = unknown> = HookDeclaration<"RunEnd", RunEndInput<Output>, RunEndDecision<Output>>

/** Plugin-facing type-erased declaration shape accepted by Hooks.layer. */
export interface Declaration {
  readonly event: Event
  readonly hook: Hook<never>
}

/** Ordered lifecycle hook declarations for one Agent execution context. */
export interface Service {
  readonly declarations: ReadonlyArray<Declaration>
}

/** Optional ordered lifecycle interceptor service. */
export class Hooks extends Context.Service<Hooks, Service>()("generalist/hooks/Hooks") {}

/** Provide an explicit ordered hook declaration list. */
export const layer = (declarations: ReadonlyArray<Declaration>): Layer.Layer<Hooks> =>
  Layer.succeed(Hooks, Hooks.of({ declarations }))

/** Explicit empty hook chain. Omitting Hooks has the same behavior. */
export const layerIdentity: Layer.Layer<Hooks> = layer([])

export const onRunStart = (hook: RunStart["hook"]): RunStart => ({ event: "RunStart", hook })
export const onTurnStart = (hook: TurnStart["hook"]): TurnStart => ({ event: "TurnStart", hook })
export const onModelCall = (hook: ModelCall["hook"]): ModelCall => ({ event: "ModelCall", hook })
export const onToolCall = (hook: ToolCall["hook"]): ToolCall => ({ event: "ToolCall", hook })
export const onToolResult = (hook: ToolResult["hook"]): ToolResult => ({ event: "ToolResult", hook })
export const onApprovalRequest = (hook: ApprovalRequest["hook"]): ApprovalRequest => ({
  event: "ApprovalRequest",
  hook,
})
export const onCompaction = (hook: Compaction["hook"]): Compaction => ({ event: "Compaction", hook })
export const onChildStart = (hook: ChildStart["hook"]): ChildStart => ({ event: "ChildStart", hook })
export const onChildEnd = (hook: ChildEnd["hook"]): ChildEnd => ({ event: "ChildEnd", hook })
export const onSteer = (hook: Steer["hook"]): Steer => ({ event: "Steer", hook })
export const onRunEnd = <Output = unknown>(hook: RunEnd<Output>["hook"]): RunEnd<Output> => ({
  event: "RunEnd",
  hook,
})

/** A lifecycle hook failed instead of returning a decision. */
export class HookFailed extends ActionableTaggedError<HookFailed>()("generalist/core/HookFailed", {
  event: Event,
  cause: Schema.Defect(),
  hint: errorHint("Inspect the named lifecycle hook and its cause before retrying the run."),
}) {}

/** @internal One completed declaration chain stored in the driver checkpoint. */
export const Checkpoint = Schema.Struct({
  key: Schema.String,
  event: Event,
  decisions: Schema.Array(Decision),
  complete: Schema.Boolean,
})
export type Checkpoint = typeof Checkpoint.Type
