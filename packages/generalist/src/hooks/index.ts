import { Context, Effect, Layer, Schema } from "effect"
import { Prompt, Response } from "effect/unstable/ai"
import type { RunId } from "../core/durable/run-id.js"
import { Event, HookFailed } from "./event.js"
import { CapabilityPin, makeCapability } from "../core/durable/pin.js"
import { ReplayPolicy } from "../core/durable/driver/contract.js"
import type { DriverError, DriverStateInvalid } from "../core/durable/service.js"
import type { DriverUnknownReplay } from "../core/durable/driver/interpreter.js"
import type { Exhausted } from "../core/durable/run-budget.js"

export { Event, HookFailed } from "./event.js"

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

const ContinueDecision = Schema.TaggedStruct("Continue", {})
const BlockDecision = Schema.TaggedStruct("Block", { reason: Schema.String })
const ReplaceDecision = Schema.TaggedStruct("Replace", { value: Schema.Unknown })
const AddContextDecision = Schema.TaggedStruct("AddContext", { prompt: Prompt.Prompt })
const AskDecision = Schema.TaggedStruct("Ask", {})

/** Serializable decision recorded in the durable driver checkpoint. */
export const Decision = Schema.Union([
  ContinueDecision,
  BlockDecision,
  ReplaceDecision,
  AddContextDecision,
  AskDecision,
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

const promptDecision = Schema.Union([ContinueDecision, BlockDecision, ReplaceDecision, AddContextDecision])
const toolCallDecision = Schema.Union([ContinueDecision, BlockDecision, ReplaceDecision, AskDecision])
const toolResultDecision = Schema.Union([ContinueDecision, BlockDecision, ReplaceDecision])
const approvalDecision = Schema.Union([ContinueDecision, BlockDecision])
const childStartDecision = Schema.Union([ContinueDecision, BlockDecision])
const childEndDecision = Schema.Union([ContinueDecision, BlockDecision, ReplaceDecision])
const runEndDecision = Schema.Union([ContinueDecision, BlockDecision, ReplaceDecision])

/** @internal Event-scoped decision Schema enforced at each lifecycle boundary. */
export const DecisionByEvent = {
  RunStart: promptDecision,
  TurnStart: promptDecision,
  ModelCall: promptDecision,
  Compaction: promptDecision,
  Steer: promptDecision,
  ToolCall: toolCallDecision,
  ToolResult: toolResultDecision,
  ApprovalRequest: approvalDecision,
  ChildStart: childStartDecision,
  ChildEnd: childEndDecision,
  RunEnd: runEndDecision,
} satisfies Record<Event, Schema.Decoder<Decision>>

/** One Effectful typed lifecycle interceptor. `void` is shorthand for Continue. */
export type Hook<Input, HookDecision extends Decision = Decision> = (
  input: Input,
  context: { readonly operationKey: string },
) => Effect.Effect<HookDecision | void, unknown>

export const Identity = Schema.Struct({
  key: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(255)),
  version: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(128)),
  replayPolicy: ReplayPolicy,
})
export type Identity = typeof Identity.Type

interface HookDeclaration<Name extends Event, Input, HookDecision extends Decision> extends Identity {
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
export interface Declaration extends Identity {
  readonly event: Event
  readonly hook: Hook<never>
}

/** Ordered lifecycle hook declarations for one Agent execution context. */
export interface Service {
  readonly declarations: ReadonlyArray<Declaration>
  readonly pin: CapabilityPin
}

/** Optional ordered lifecycle interceptor service. */
export class Hooks extends Context.Service<Hooks, Service>()("generalist/hooks/Hooks") {}

/** Provide an explicit ordered hook declaration list. */
export const layer = (declarations: ReadonlyArray<Declaration>): Layer.Layer<Hooks> =>
  Layer.sync(Hooks, () => make({ declarations }))

/** Explicit empty hook chain. Omitting Hooks has the same behavior. */
export const layerIdentity: Layer.Layer<Hooks> = layer([])

export const chainPin = (declarations: ReadonlyArray<Declaration>): CapabilityPin => {
  const identities = declarations.map((declaration) => ({
    ...Schema.decodeSync(Identity)(declaration),
    event: declaration.event,
  }))
  if (new Set(identities.map((identity) => identity.key)).size !== identities.length) {
    throw new TypeError("Duplicate hook declaration key")
  }
  return makeCapability({ version: "1", declarations: identities })
}

export const make = (input: { readonly declarations: ReadonlyArray<Declaration> }): Service => {
  const declarations = Object.freeze(input.declarations.map((declaration) => Object.freeze({ ...declaration })))
  return { declarations, pin: chainPin(declarations) }
}

export const onRunStart = (input: Identity & { readonly hook: RunStart["hook"] }): RunStart => ({
  event: "RunStart",
  ...input,
})
export const onTurnStart = (input: Identity & { readonly hook: TurnStart["hook"] }): TurnStart => ({
  event: "TurnStart",
  ...input,
})
export const onModelCall = (input: Identity & { readonly hook: ModelCall["hook"] }): ModelCall => ({
  event: "ModelCall",
  ...input,
})
export const onToolCall = (input: Identity & { readonly hook: ToolCall["hook"] }): ToolCall => ({
  event: "ToolCall",
  ...input,
})
export const onToolResult = (input: Identity & { readonly hook: ToolResult["hook"] }): ToolResult => ({
  event: "ToolResult",
  ...input,
})
export const onApprovalRequest = (input: Identity & { readonly hook: ApprovalRequest["hook"] }): ApprovalRequest => ({
  event: "ApprovalRequest",
  ...input,
})
export const onCompaction = (input: Identity & { readonly hook: Compaction["hook"] }): Compaction => ({
  event: "Compaction",
  ...input,
})
export const onChildStart = (input: Identity & { readonly hook: ChildStart["hook"] }): ChildStart => ({
  event: "ChildStart",
  ...input,
})
export const onChildEnd = (input: Identity & { readonly hook: ChildEnd["hook"] }): ChildEnd => ({
  event: "ChildEnd",
  ...input,
})
export const onSteer = (input: Identity & { readonly hook: Steer["hook"] }): Steer => ({ event: "Steer", ...input })
export const onRunEnd = <Output = unknown>(
  input: Identity & { readonly hook: RunEnd<Output>["hook"] },
): RunEnd<Output> => ({
  event: "RunEnd",
  ...input,
})

export type EvaluationFailure = HookFailed | DriverError | DriverStateInvalid | DriverUnknownReplay | Exhausted

/** @internal One completed declaration chain stored in the driver checkpoint. */
export const Checkpoint = Schema.Struct({
  chain: CapabilityPin,
  key: Schema.String,
  event: Event,
  decisions: Schema.Array(Decision),
  complete: Schema.Boolean,
})
export type Checkpoint = typeof Checkpoint.Type
