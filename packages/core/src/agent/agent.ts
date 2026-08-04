import { type Duration, Effect, Option, Schema, Stream, Types } from "effect"
import { dual } from "effect/Function"
import { AiError, Chat, LanguageModel, Prompt, Tool, Toolkit } from "effect/unstable/ai"
import {
  AgentError,
  AgentSuspended,
  type Completed,
  DuplicateToolCallId,
  type Event,
  MiddlewareViolation,
  ProgressOverflow,
  ResumeMismatch,
  RunEndedWithoutOutput,
  ToolNameCollision,
  type ToolOrigin,
  TurnLimitExceeded,
  TurnPolicyStopped,
} from "./agent-event.js"
import type { DeliveryFailed, InvocationCoordinationFailed } from "../model/model-telemetry.js"
import type { BudgetLimits, RunBudget } from "../durable/run-budget.js"
import type { DriverCheckpoint } from "../durable/driver-contract.js"
import { RunBudgetExhausted } from "../durable/run-budget.js"
import type { DriverError, DriverStateInvalid } from "../durable/durable-driver.js"
import type { DriverUnknownReplay } from "../durable/driver-interpreter.js"
import type { ModelResilienceMisconfigured } from "../model/model-resilience.js"
import type { InvalidToolCallParameters, ToolJsonSchemaCompilerMissing } from "../model/model-tool-call-validation.js"
import { type Key, Memory } from "../context/memory.js"
import { type LanguageModelNotRegistered, type ModelSelection, ModelRegistry } from "../model/model-registry.js"
import type { ToolAuthorizer } from "../tools/tool-authorization.js"
import { ToolContext } from "../tools/tool-context.js"
import { FrameworkFailure } from "../tools/tool-executor.js"
import { HandoffLimitExceeded, HandoffRequirementsMissing, HandoffTargetMissing } from "./handoff-state.js"
import { HandoffProjectionInvalid } from "../policy/handoff-projection.js"
import { HandoffRejected } from "../policy/handoff-runtime.js"
import { defaultPolicy, type TurnPolicy, TurnPolicyError } from "../turn/turn-policy.js"

import { streamInternal } from "./agent-run.js"
import { Runtime } from "./agent-persistence-lock.js"

export { Runtime, layerRuntime } from "./agent-persistence-lock.js"

const AgentTypeId: unique symbol = Symbol.for("@batonfx/core/Agent")
/** @experimental An agent definition: a plain value, not a service. */
export interface HandoffAgent<R> {
  readonly name: string
  readonly description?: string
  readonly requirements: (value: R) => R
}

export interface Agent<
  Tools extends Record<string, Tool.Any> = {},
  R = LanguageModel.LanguageModel,
  PolicyServices = R,
  AuthorizationServices = R,
> {
  readonly handoff: <A>(f: (agent: HandoffAgent<R>) => A) => A
  readonly [AgentTypeId]: {
    readonly tools: Types.Invariant<Tools>
    readonly requirements: Types.Invariant<R>
  }
  readonly name: string
  readonly instructions?: string
  readonly toolkit: Toolkit.Toolkit<Tools>
  readonly policy: TurnPolicy<PolicyServices>
  readonly model?: ModelSelection
  readonly memory?: Key
  readonly authorization?: ToolAuthorizer<AuthorizationServices>
  readonly toolExecution?: ToolExecutionPolicy
  readonly metadata?: Readonly<Record<string, unknown>>
  readonly budget?: BudgetLimits
  readonly toolDeclarations?: ReadonlyArray<ToolDeclaration>
}

/** @experimental Policy for framework-executed tool calls emitted by one model turn. */
export interface ToolExecutionPolicy {
  readonly concurrency: number | "unbounded"
}

/** @experimental One origin-preserving static or Handoff tool declaration. */
export interface ToolDeclaration {
  readonly tool: Tool.Any
  readonly origin: Extract<ToolOrigin, { readonly _tag: "Static" | "Handoff" }>
}

/** @experimental Extract an agent's runtime requirements. */
export type Requirements<A> = A extends Agent<infer _Tools, infer R> ? R : never

/** @experimental */
export interface WithModelDefault {
  readonly model: ModelSelection
}

/** @experimental */
export interface MakeOptions<
  Tools extends Record<string, Tool.Any> = {},
  PolicyServices = never,
  AuthorizationServices = never,
> {
  readonly name: string
  readonly instructions?: string
  readonly toolkit?: Toolkit.Toolkit<Tools>
  readonly tools?: never
  readonly policy?: TurnPolicy<PolicyServices>
  readonly model?: ModelSelection
  readonly memory?: Key
  readonly authorization?: ToolAuthorizer<AuthorizationServices>
  readonly toolExecution?: ToolExecutionPolicy
  readonly metadata?: Readonly<Record<string, unknown>>
  readonly budget?: BudgetLimits
}

/** @experimental Agent options with ordered static declarations instead of a pre-built toolkit. */
export interface MakeToolsOptions<
  StaticTools extends ReadonlyArray<Tool.Any>,
  PolicyServices = never,
  AuthorizationServices = never,
> extends Omit<MakeOptions<{}, PolicyServices, AuthorizationServices>, "toolkit" | "tools"> {
  readonly tools: StaticTools
  readonly toolkit?: never
}

type OptionValue<O, K extends PropertyKey> = K extends keyof O ? O[K] : never
type PresentOption<O, K extends PropertyKey> = O extends unknown ? Exclude<OptionValue<O, K>, undefined> : never
type ModelRequirement<O> = [Exclude<OptionValue<O, "model">, undefined>] extends [never]
  ? LanguageModel.LanguageModel
  : undefined extends OptionValue<O, "model">
    ? LanguageModel.LanguageModel | ModelRegistry
    : ModelRegistry
type MemoryRequirement<O> = [Exclude<OptionValue<O, "memory">, undefined>] extends [never] ? never : Memory
type PolicyRequirement<O> = O extends { readonly policy: TurnPolicy<infer R> } ? R : never
type AuthorizationRequirement<O> = O extends { readonly authorization: ToolAuthorizer<infer R> } ? R : never
type StaticToolServices<Tools extends Record<string, Tool.Any>> =
  | Tool.HandlersFor<Tools>
  | Exclude<Tool.HandlerServices<Tools[keyof Tools]>, ToolContext>
type OptionRequirements<Tools extends Record<string, Tool.Any>, O> =
  | StaticToolServices<Tools>
  | ModelRequirement<O>
  | MemoryRequirement<O>
  | PolicyRequirement<O>
  | AuthorizationRequirement<O>

/** @experimental Defaults: empty toolkit, `defaultPolicy`. */
export function make<
  const StaticTools extends ReadonlyArray<Tool.Any>,
  const O extends MakeToolsOptions<StaticTools, unknown, unknown> = MakeToolsOptions<StaticTools>,
>(
  options: MakeToolsOptions<StaticTools, unknown, unknown> & O,
): Agent<Toolkit.ToolsByName<StaticTools>, OptionRequirements<Toolkit.ToolsByName<StaticTools>, O>>
export function make<
  Tools extends Record<string, Tool.Any> = {},
  const O extends MakeOptions<Tools, unknown, unknown> = MakeOptions<Tools>,
>(options: MakeOptions<Tools, unknown, unknown> & O): Agent<Tools, OptionRequirements<Tools, O>>
export function make<
  Tools extends Record<string, Tool.Any> = {},
  PolicyServices = never,
  AuthorizationServices = never,
>(
  options:
    | MakeOptions<Tools, PolicyServices, AuthorizationServices>
    | MakeToolsOptions<ReadonlyArray<Tool.Any>, PolicyServices, AuthorizationServices>,
): unknown {
  const declaredTools: ReadonlyArray<Tool.Any> | undefined =
    "tools" in options && Array.isArray(options.tools) ? options.tools : undefined
  const toolkit = declaredTools === undefined ? (options.toolkit ?? Toolkit.empty) : Toolkit.make(...declaredTools)
  if (declaredTools !== undefined) {
    for (const tool of declaredTools) {
      if (!Object.hasOwn(toolkit.tools, tool.name)) {
        Object.defineProperty(toolkit.tools, tool.name, {
          configurable: true,
          enumerable: true,
          value: tool,
          writable: true,
        })
      }
    }
  }
  const definition = {
    name: options.name,
    ...(options.instructions === undefined ? {} : { instructions: options.instructions }),
    toolkit,
    policy: options.policy ?? defaultPolicy,
    ...(options.model === undefined ? {} : { model: options.model }),
    ...(options.memory === undefined ? {} : { memory: options.memory }),
    ...(options.authorization === undefined ? {} : { authorization: options.authorization }),
    ...(options.toolExecution === undefined ? {} : { toolExecution: options.toolExecution }),
    ...(options.metadata === undefined ? {} : { metadata: options.metadata }),
    ...(options.budget === undefined ? {} : { budget: options.budget }),
    toolDeclarations: (declaredTools ?? Object.values(toolkit.tools)).map(
      (tool): ToolDeclaration => ({
        tool,
        origin: { _tag: "Static", agent: options.name },
      }),
    ),
  }
  type RuntimeTools = typeof toolkit extends Toolkit.Toolkit<infer CurrentTools> ? CurrentTools : never
  type AgentRequirements = OptionRequirements<RuntimeTools, typeof options>
  const complete = {
    ...definition,
    [AgentTypeId]: {
      tools: (value: RuntimeTools) => value,
      requirements: (value: AgentRequirements) => value,
    },
    handoff: <A>(f: (agent: HandoffAgent<AgentRequirements>) => A): A =>
      f({
        name: options.name,
        ...(options.instructions === undefined ? {} : { description: options.instructions }),
        requirements: (value) => value,
      }),
  }
  return complete
}

/** @experimental Re-entry bound to an authoritative `AgentSuspended` checkpoint. */
export const ResumeResolution = Schema.Union([
  Schema.TaggedStruct("Approved", {}),
  Schema.TaggedStruct("Denied", { reason: Schema.optionalKey(Schema.String) }),
  Schema.TaggedStruct("ToolResult", { result: Schema.Unknown, encodedResult: Schema.Unknown }),
  Schema.TaggedStruct("Signal", { name: Schema.String, payload: Schema.optionalKey(Schema.Unknown) }),
])
export type ResumeResolution = typeof ResumeResolution.Type

export interface Resume {
  readonly suspension: AgentSuspended
  readonly resolution?: ResumeResolution
}

/** @experimental Bounded buffering behavior for tool progress events. */
export type ProgressOverflowPolicy =
  | { readonly _tag: "Backpressure"; readonly capacity: number }
  | { readonly _tag: "Dropping"; readonly capacity: number }
  | { readonly _tag: "Sliding"; readonly capacity: number }
  | { readonly _tag: "Fail"; readonly capacity: number }

/** @experimental Options for an agent run. Set `output` for structured output; set `persistence` for persisted chat. */
export interface RunOptions {
  /** User input for the first turn. Ignored when `resume` is set. */
  readonly prompt: Prompt.RawInput
  /**
   * Prior transcript. When set it is used VERBATIM as the initial chat
   * history (no system message is prepended); otherwise the chat starts
   * with a system message derived from the agent (see below).
   */
  readonly history?: Prompt.RawInput
  /** Overrides the derived system message when `history` is not set. */
  readonly system?: string
  readonly resume?: Resume
  /** @experimental Opaque host-assigned identity for this run/session. */
  readonly sessionId?: string
  /** @experimental Stable host identity for the logical model operations in this run. */
  readonly logicalOperationId?: string
  /** @experimental First model-call ordinal for a host resuming from a durable checkpoint. */
  readonly modelCallOrdinalStart?: number
  /** @experimental First turn number for a host continuing an existing transcript. */
  readonly turnStart?: number
  /** @experimental Runtime-owned checkpoint used to reconstruct the same durable driver. */
  readonly driverCheckpoint?: DriverCheckpoint
  /** @experimental Pinned identity admitted by a durable host. */
  readonly executableRef?: import("../durable/executable-manifest.js").ExecutableRef
  /** @experimental Complete pinned closure used to resolve same-run handoffs exactly. */
  readonly executableManifest?: import("../durable/executable-manifest.js").ExecutableManifest
  /** @experimental Opaque host-assigned write-ownership token, forwarded on every Session append and checkpoint so durable hosts can fence stale writers. */
  readonly sessionOwnerToken?: string
  /** @experimental Spill successful tool outputs whose encoded size exceeds this byte limit. */
  readonly toolOutputMaxBytes?: number
  /** @experimental Per-tool bounded buffering policy for progress events. Defaults to backpressure at capacity 64. */
  readonly toolProgress?: ProgressOverflowPolicy
  /** @experimental Context-window hint for optional compaction. */
  readonly compaction?: {
    readonly contextWindow?: number
  }
  /** @experimental Per-run budget narrowing; dimensions omitted inherit the agent default. */
  readonly budget?: BudgetLimits
  /** @experimental Pre-reserved child grant from a parent run; not for direct caller use. */
  readonly inheritedBudget?: RunBudget
  readonly suspensionPropagation?: "propagate" | "collapse-to-domain-failure"
  /** @experimental Consult the Memory service for this run. */
  readonly memory?: {
    readonly key: Key
  }
  readonly persistence?: {
    readonly chatId: string
    readonly timeToLive?: Duration.Input
  }
  readonly output?: {
    readonly schema: ObjectSchema
    readonly name?: string
    readonly prompt?: Prompt.RawInput
  }
}

type OperationRequirements<O> = [PresentOption<O, "memory">] extends [never] ? never : Memory

type ObjectSchema = Schema.Codec<unknown, Record<string, unknown>, unknown, unknown>
type NoOutputSchema = Schema.Codec<unknown, Record<string, unknown>, never, never>

/** @experimental Default prompt for the terminal structured-output turn. */
export const defaultObjectPrompt = "Return the final structured output for the task above."

/** @experimental The error channel of `stream` and `generate`. */
export type RunError =
  | DeliveryFailed
  | InvocationCoordinationFailed
  | AgentError
  | AgentSuspended
  | ResumeMismatch
  | TurnPolicyError
  | TurnPolicyStopped
  | TurnLimitExceeded
  | RunEndedWithoutOutput
  | MiddlewareViolation
  | ModelResilienceMisconfigured
  | InvalidToolCallParameters
  | ToolJsonSchemaCompilerMissing
  | DuplicateToolCallId
  | ProgressOverflow
  | ToolNameCollision
  | AiError.AiError
  | LanguageModelNotRegistered
  | FrameworkFailure
  | DriverError
  | DriverStateInvalid
  | DriverUnknownReplay
  | RunBudgetExhausted
  | HandoffTargetMissing
  | HandoffLimitExceeded
  | HandoffRequirementsMissing
  | HandoffProjectionInvalid
  | HandoffRejected

/** @experimental Result of a non-streaming run. */
export interface Result {
  readonly text: string
  readonly turns: number
  readonly transcript: Prompt.Prompt
}

/** @experimental Result of a non-streaming structured-output run. */
export interface ObjectResult<A> extends Result {
  readonly value: A
}

type SchemaFromOutput<Output> = Output extends { readonly schema: infer S extends ObjectSchema } ? S : never
type SchemaOf<O> = SchemaFromOutput<PresentOption<O, "output">>
type PersistenceRequirement<O> = [PresentOption<O, "persistence">] extends [never] ? never : Chat.Persistence | Runtime
type OutputRequirement<O> = [SchemaOf<O>] extends [never] ? never : SchemaOf<O>["DecodingServices"]

/** @experimental Services required by one run option set. */
export type RunRequirements<R, O> = R | OperationRequirements<O> | PersistenceRequirement<O> | OutputRequirement<O>

/** @experimental Result selected by one run option set. */
export type RunResult<O> = O extends unknown
  ? O extends { readonly output: { readonly schema: infer S extends ObjectSchema } }
    ? ObjectResult<S["Type"]>
    : [SchemaOf<O>] extends [never]
      ? Result
      : Result | ObjectResult<SchemaOf<O>["Type"]>
  : never

/** @experimental Stream an agent run as Events. Set options.output for structured output; set options.persistence for persisted chat. */
export const stream: {
  <O extends RunOptions>(
    options: O,
  ): <Tools extends Record<string, Tool.Any>, R>(
    agent: Agent<Tools, R>,
  ) => Stream.Stream<Event, RunError, RunRequirements<R, O>>
  <Tools extends Record<string, Tool.Any>, R, O extends RunOptions>(
    agent: Agent<Tools, R>,
    options: O,
  ): Stream.Stream<Event, RunError, RunRequirements<R, O>>
} = dual(2, <Tools extends Record<string, Tool.Any>, R>(agent: Agent<Tools, R>, options: RunOptions) =>
  streamInternal(
    agent,
    options,
    options.output === undefined
      ? undefined
      : {
          schema: options.output.schema,
          objectName: options.output.name ?? "output",
          objectPrompt: options.output.prompt ?? defaultObjectPrompt,
        },
  ),
)

const generateText = <Tools extends Record<string, Tool.Any>, R>(agent: Agent<Tools, R>, options: RunOptions) =>
  Stream.runLast(streamInternal<Tools, R, NoOutputSchema>(agent, options, undefined)).pipe(
    Effect.flatMap(
      Option.match({
        onNone: () => Effect.fail(AgentError.make({ message: "Agent run ended without a Completed event", turn: 0 })),
        onSome: (event) =>
          event._tag === "Completed"
            ? Effect.succeed({ text: event.text, turns: event.turns, transcript: event.transcript })
            : Effect.fail(AgentError.make({ message: "Agent run ended without a Completed event", turn: 0 })),
      }),
    ),
  )

const generateObjectResult = <Tools extends Record<string, Tool.Any>, R, S extends ObjectSchema>(
  agent: Agent<Tools, R>,
  options: RunOptions,
  structured: {
    readonly schema: S
    readonly objectName: string
    readonly objectPrompt: Prompt.RawInput
  },
) =>
  Stream.runFold(
    streamInternal(agent, options, structured),
    () => ({ value: Option.none<unknown>(), completed: Option.none<Completed>() }),
    (acc, event) =>
      event._tag === "StructuredOutput"
        ? { ...acc, value: Option.some(event.value) }
        : event._tag === "Completed"
          ? { ...acc, completed: Option.some(event) }
          : acc,
  ).pipe(
    Effect.flatMap(({ value, completed }) =>
      Option.match(completed, {
        onNone: () =>
          Effect.fail(AgentError.make({ message: "Agent object run ended without a Completed event", turn: 0 })),
        onSome: (event) =>
          Option.match(value, {
            onNone: () =>
              Effect.fail(
                AgentError.make({ message: "Agent object run ended without a StructuredOutput event", turn: 0 }),
              ),
            onSome: (typedValue) =>
              Effect.succeed({
                text: event.text,
                turns: event.turns,
                transcript: event.transcript,
                value: typedValue,
              }),
          }),
      }),
    ),
  )

/** @experimental Run an agent to completion. Returns ObjectResult when options.output is set, otherwise Result. */
export const generate: {
  <O extends RunOptions>(
    options: O,
  ): <Tools extends Record<string, Tool.Any>, R>(
    agent: Agent<Tools, R>,
  ) => Effect.Effect<RunResult<O>, RunError, RunRequirements<R, O>>
  <Tools extends Record<string, Tool.Any>, R, O extends RunOptions>(
    agent: Agent<Tools, R>,
    options: O,
  ): Effect.Effect<RunResult<O>, RunError, RunRequirements<R, O>>
} = dual(2, <Tools extends Record<string, Tool.Any>, R>(agent: Agent<Tools, R>, options: RunOptions) =>
  options.output === undefined
    ? generateText(agent, options)
    : generateObjectResult(agent, options, {
        schema: options.output.schema,
        objectName: options.output.name ?? "output",
        objectPrompt: options.output.prompt ?? defaultObjectPrompt,
      }),
)
