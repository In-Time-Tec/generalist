import { Effect, type Layer, Option, Predicate, Schema, Stream, Types } from "effect"
import { dual } from "effect/Function"
import { LanguageModel, Prompt, Tool, Toolkit } from "effect/unstable/ai"
import { AgentError, type AgentSuspended, type Event, type ToolOrigin } from "./event.js"
import type { BudgetLimits, RunBudget } from "../durable/run-budget.js"
import type { DriverCheckpoint } from "../durable/driver/contract.js"
import { type Key, Memory } from "../context/memory.js"
import { type ModelSelection, ModelRegistry } from "../model/registry.js"
import type { Authorizer } from "../tools/tool-authorization.js"
import { ToolContext } from "../tools/tool-context.js"
import { defaultPolicy, type Policy } from "../turn/policy.js"
import type { RunId as RunIdType } from "../durable/run-id.js"
import { RunError } from "./run/error.js"

import { allocateRun, defaultObjectPrompt, type RunHandle } from "./lifecycle/run-handle.js"
import { encode as encodeInput } from "./lifecycle/input.js"
import { defaultToolScheduling } from "./tools/scheduler.js"
import type { ToolBatchResolution } from "./tools/checkpoint.js"

export { close, withTools } from "./lifecycle/definition.js"
export { ResumeResolution, type WithModelDefault } from "./lifecycle/resume.js"
export { start, type StartEvent, type StartOptions } from "./lifecycle/start.js"
export { streamToolCalls } from "./tool-calls.js"
export { defaultObjectPrompt, type RunHandle }
/** @experimental Allocate one scoped Run and its producer handle before consuming its event stream. */
export { allocateRun }
export type * from "./tool-calls.js"
export const AgentTypeId = "generalist/core/Agent"
/** @experimental Agent-owned metadata values. */
type AgentMetadata = Readonly<Record<string, Schema.Json>>
/** @experimental An agent definition: a plain value, not a service. */
export interface HandoffAgent<R> {
  readonly name: string
  readonly description?: string
  readonly requirements: (value: R) => R
}

export interface Agent<
  Tools extends Record<string, Tool.Any> = Record<never, never>,
  R = LanguageModel.LanguageModel,
  PolicyServices extends R = R,
  AuthorizationServices extends R = R,
  InputSchema extends Schema.Top = Schema.Top,
  OutputSchema extends Schema.Top = Schema.Top,
> {
  readonly handoff: <A>(f: (agent: HandoffAgent<R>) => A) => A
  readonly [AgentTypeId]: {
    readonly tools: Types.Invariant<Tools>
    readonly requirements: Types.Invariant<R>
  }
  readonly name: string
  readonly input: InputSchema
  readonly output: OutputSchema
  readonly instructions?: string
  readonly supplemental?: string
  readonly toolkit: Toolkit.Toolkit<Tools>
  readonly policy: Policy<PolicyServices>
  readonly model?: ModelSelection
  readonly memory?: Key
  readonly authorization?: Authorizer<AuthorizationServices>
  readonly toolScheduling: ToolSchedulingPolicy
  readonly metadata?: AgentMetadata
  readonly budget?: BudgetLimits
  readonly toolDeclarations?: ReadonlyArray<ToolDeclaration>
}

/**
 * @experimental Safe scheduling policy for framework-executed calls emitted by one model turn. Tools not explicitly
 * listed as parallel-safe execute as authored-order exclusive barriers.
 */
export interface ToolSchedulingPolicy {
  readonly maxConcurrency: number
  readonly parallelSafe: ReadonlyArray<string>
}

/** @experimental One origin-preserving static or Handoff tool declaration. */
export interface ToolDeclaration {
  readonly tool: Tool.Any
  readonly origin: Extract<ToolOrigin, { readonly _tag: "Static" | "Handoff" }>
}

/** @experimental One Agent observed where its tool and requirement types are hidden. */
export interface Any {
  readonly [AgentTypeId]: unknown
  readonly name: string
  readonly input: Schema.Top
  readonly output: Schema.Top
  readonly instructions?: string
  readonly toolkit: Toolkit.Any
  readonly policy: Policy<unknown>
  readonly model?: ModelSelection
  readonly memory?: Key
  readonly toolScheduling: ToolSchedulingPolicy
  readonly metadata?: AgentMetadata
  readonly budget?: BudgetLimits
  readonly toolDeclarations?: ReadonlyArray<ToolDeclaration>
}
/** @experimental Services closed over with an Agent. */
export type ClosedServices<Tools extends Record<string, Tool.Any>, R> =
  | R
  | Tool.HandlersFor<Tools>
  | Exclude<Tool.HandlerServices<Tools[keyof Tools]>, ToolContext>
/** @experimental Consumer of a hidden Agent identity and its environment. */
export interface Opened<A> {
  <Tools extends Record<string, Tool.Any>, R, InputSchema extends Schema.Top, OutputSchema extends Schema.Top>(
    agent: Agent<Tools, R, R, R, InputSchema, OutputSchema>,
    environment: Layer.Layer<ClosedServices<Tools, R>>,
  ): A
}
/** @experimental An Agent closed over its exact environment. */
export interface Closed extends Any {
  readonly open: <A>(f: Opened<A>) => A
}
/** @experimental Extract an agent's runtime requirements. */
export type Requirements<A> = A extends Agent<infer _Tools, infer R> ? R : never
/** @experimental Extract an Agent's decoded input type. */
export type Input<A> = A extends { readonly input: infer InputCodec extends Schema.Top } ? InputCodec["Type"] : never
/** @experimental Extract an Agent's encoded input type. */
export type EncodedInput<A> =
  A extends { readonly input: infer InputCodec extends Schema.Top } ? InputCodec["Encoded"] : never
/** @experimental Extract an Agent's decoded output type. */
export type Output<A> =
  A extends { readonly output: infer OutputCodec extends Schema.Top } ? OutputCodec["Type"] : never
/** @experimental Extract an Agent's encoded output type. */
export type EncodedOutput<A> =
  A extends { readonly output: infer OutputCodec extends Schema.Top } ? OutputCodec["Encoded"] : never

/** @experimental */
export interface MakeOptions<
  Tools extends Record<string, Tool.Any> = Record<never, never>,
  PolicyServices = never,
  AuthorizationServices = never,
  InputSchema extends Schema.Top = typeof Schema.String,
  OutputSchema extends Schema.Top = typeof Schema.String,
> {
  readonly name: string
  readonly input?: InputSchema
  readonly output?: OutputSchema
  readonly instructions?: string
  readonly supplemental?: string
  readonly toolkit?: Toolkit.Toolkit<Tools>
  readonly tools?: never
  readonly policy?: Policy<PolicyServices>
  readonly model?: ModelSelection
  readonly memory?: Key
  readonly authorization?: Authorizer<AuthorizationServices>
  readonly toolScheduling?: ToolSchedulingPolicy
  readonly metadata?: AgentMetadata
  readonly budget?: BudgetLimits
}

/** @experimental Agent options with ordered static declarations instead of a pre-built toolkit. */
export interface MakeToolsOptions<
  StaticTools extends ReadonlyArray<Tool.Any>,
  PolicyServices = never,
  AuthorizationServices = never,
  InputSchema extends Schema.Top = typeof Schema.String,
  OutputSchema extends Schema.Top = typeof Schema.String,
> extends Omit<
    MakeOptions<Record<never, never>, PolicyServices, AuthorizationServices, InputSchema, OutputSchema>,
    "toolkit" | "tools"
  > {
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
type PolicyRequirement<O> = O extends { readonly policy: Policy<infer R> } ? R : never
type AuthorizationRequirement<O> = O extends { readonly authorization: Authorizer<infer R> } ? R : never
type InputCodecOf<O> = O extends { readonly input: infer S extends Schema.Top } ? S : typeof Schema.String
type OutputCodecOf<O> = O extends { readonly output: infer S extends Schema.Top } ? S : typeof Schema.String
type StaticToolServices<Tools extends Record<string, Tool.Any>> =
  | Tool.HandlersFor<Tools>
  | Exclude<Tool.HandlerServices<Tools[keyof Tools]>, ToolContext>
type OptionRequirements<Tools extends Record<string, Tool.Any>, O> =
  | StaticToolServices<Tools>
  | ModelRequirement<O>
  | MemoryRequirement<O>
  | PolicyRequirement<O>
  | AuthorizationRequirement<O>
  | InputCodecOf<O>["EncodingServices"]
  | OutputCodecOf<O>["DecodingServices"]
  | OutputCodecOf<O>["EncodingServices"]
interface MakeImplementationResult {
  readonly name: string
}

/** @experimental Defaults: empty toolkit, `defaultPolicy`. */
export function make<
  const StaticTools extends ReadonlyArray<Tool.Any>,
  const O extends MakeToolsOptions<
    StaticTools,
    unknown,
    unknown,
    Schema.Top,
    Schema.Top
  > = MakeToolsOptions<StaticTools>,
>(
  options: MakeToolsOptions<StaticTools, unknown, unknown, Schema.Top, Schema.Top> & O,
): Agent<
  Toolkit.ToolsByName<StaticTools>,
  OptionRequirements<Toolkit.ToolsByName<StaticTools>, O>,
  PolicyRequirement<O>,
  AuthorizationRequirement<O>,
  InputCodecOf<O>,
  OutputCodecOf<O>
>
export function make<
  Tools extends Record<string, Tool.Any> = Record<never, never>,
  const O extends MakeOptions<Tools, unknown, unknown, Schema.Top, Schema.Top> = MakeOptions<Tools>,
>(
  options: MakeOptions<Tools, unknown, unknown, Schema.Top, Schema.Top> & O,
): Agent<
  Tools,
  OptionRequirements<Tools, O>,
  PolicyRequirement<O>,
  AuthorizationRequirement<O>,
  InputCodecOf<O>,
  OutputCodecOf<O>
>
export function make<
  Tools extends Record<string, Tool.Any> = Record<never, never>,
  PolicyServices = never,
  AuthorizationServices = never,
  InputSchema extends Schema.Top = typeof Schema.String,
  OutputSchema extends Schema.Top = typeof Schema.String,
>(
  options:
    | MakeOptions<Tools, PolicyServices, AuthorizationServices, InputSchema, OutputSchema>
    | MakeToolsOptions<ReadonlyArray<Tool.Any>, PolicyServices, AuthorizationServices, InputSchema, OutputSchema>,
): MakeImplementationResult {
  const declaredTools: ReadonlyArray<Tool.Any> | undefined =
    "tools" in options && Array.isArray(options.tools) ? options.tools : undefined
  const toolkit = declaredTools === undefined ? (options.toolkit ?? Toolkit.empty) : Toolkit.make(...declaredTools)
  if (declaredTools !== undefined) {
    for (const tool of declaredTools) {
      const toolName = Schema.decodeSync(Schema.Struct({ name: Schema.String }))(tool).name
      if (!Object.hasOwn(toolkit.tools, toolName)) {
        Object.defineProperty(toolkit.tools, toolName, {
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
    input: options.input ?? Schema.String,
    output: options.output ?? Schema.String,
    instructions: options.instructions,
    supplemental: options.supplemental,
    toolkit,
    policy: options.policy ?? defaultPolicy,
    model: options.model,
    memory: options.memory,
    authorization: options.authorization,
    toolScheduling: options.toolScheduling ?? defaultToolScheduling,
    metadata: options.metadata,
    budget: options.budget,
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
    handoff: <A>(f: (agent: HandoffAgent<AgentRequirements>) => A): A => {
      const handoffAgent: HandoffAgent<AgentRequirements> = {
        name: options.name,
        requirements: (value) => value,
      }
      if (options.instructions !== undefined) return f({ ...handoffAgent, description: options.instructions })
      return f(handoffAgent)
    },
  }
  return complete
}

export interface Resume {
  readonly suspension: AgentSuspended
  readonly resolutions?: ReadonlyArray<ToolBatchResolution>
}
/** @experimental Bounded buffering behavior for tool progress events. */
export type ProgressOverflowPolicy =
  | { readonly _tag: "Backpressure"; readonly capacity: number }
  | { readonly _tag: "Dropping"; readonly capacity: number }
  | { readonly _tag: "Sliding"; readonly capacity: number }
  | { readonly _tag: "Fail"; readonly capacity: number }

/** @experimental Internal prompt-level options for an Agent run. */
export interface RunOptions {
  /** Schema-encoded Agent input for the first turn. Ignored when `resume` is set. */
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
  /** @experimental Authoritative invocation facts supplied by a durable host. */
  readonly invocation?: {
    readonly runId: RunIdType
    readonly rootRunId: RunIdType
    readonly attempt: number
    readonly admittedAt?: string
  }
  /** @experimental First model-call ordinal for a host resuming from a durable checkpoint. */
  readonly modelCallOrdinalStart?: number
  /** @experimental First turn number for a host continuing an existing transcript. */
  readonly turnStart?: number
  /** @experimental Runtime-owned checkpoint used to reconstruct the same durable driver. */
  readonly driverCheckpoint?: DriverCheckpoint
  /** @experimental Pinned identity admitted by a durable host. */
  readonly executableRef?: import("../durable/manifest/executable-manifest.js").ExecutableRef
  /** @experimental Complete pinned closure used to resolve same-run handoffs exactly. */
  readonly executableManifest?: import("../durable/manifest/executable-manifest.js").ExecutableManifest
  readonly toolOutputMaxBytes?: number
  /** @experimental Per-tool bounded buffering policy for progress events. Defaults to backpressure at capacity 64. */
  readonly toolProgress?: ProgressOverflowPolicy
  /** @experimental Finite process-local input policy for this Run. */
  readonly steering?: import("../turn/steering.js").Options
  /** @experimental Context-window hint for optional compaction. */
  readonly compaction?: {
    readonly contextWindow?: number
    readonly reserveTokens?: number
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
}

type OperationRequirements<O> = [PresentOption<O, "memory">] extends [never] ? never : Memory
export { RunError }

/** @experimental Per-invocation options after the Agent input has moved to the second argument. */
export type InvocationOptions = Omit<RunOptions, "prompt">

/** @experimental Services required by one run option set. */
export type RunRequirements<Tools extends Record<string, Tool.Any>, R, O> =
  | R
  | StaticToolServices<Tools>
  | OperationRequirements<O>

const isDataFirst = (args: IArguments): boolean => args.length >= 2 && Predicate.hasProperty(args[0], AgentTypeId)

interface StreamFunction {
  <InputValue, O extends InvocationOptions = Record<never, never>>(
    input: InputValue,
    options?: O,
  ): <
    Tools extends Record<string, Tool.Any>,
    R,
    PolicyServices extends R,
    AuthorizationServices extends R,
    InputCodec extends Schema.Top,
    OutputCodec extends Schema.Top,
  >(
    agent: InputValue extends InputCodec["Type"]
      ? Agent<Tools, R, PolicyServices, AuthorizationServices, InputCodec, OutputCodec>
      : never,
  ) => Stream.Stream<Event<OutputCodec["Type"]>, RunError, RunRequirements<Tools, R, O>>
  <
    Tools extends Record<string, Tool.Any>,
    R,
    PolicyServices extends R,
    AuthorizationServices extends R,
    InputCodec extends Schema.Top,
    OutputCodec extends Schema.Top,
    O extends InvocationOptions = Record<never, never>,
  >(
    agent: Agent<Tools, R, PolicyServices, AuthorizationServices, InputCodec, OutputCodec>,
    input: InputCodec["Type"],
    options?: O,
  ): Stream.Stream<Event<OutputCodec["Type"]>, RunError, RunRequirements<Tools, R, O>>
}

/** @experimental Stream an Agent run as Events ending in `Completed { output }`. */
export const stream: StreamFunction = dual(
  isDataFirst,
  <
    Tools extends Record<string, Tool.Any>,
    R,
    PolicyServices extends R,
    AuthorizationServices extends R,
    InputCodec extends Schema.Top,
    OutputCodec extends Schema.Top,
  >(
    agent: Agent<Tools, R, PolicyServices, AuthorizationServices, InputCodec, OutputCodec>,
    input: InputCodec["Type"],
    options: InvocationOptions = {},
  ) =>
    Stream.unwrap(
      encodeInput(agent.input, input).pipe(
        Effect.map((prompt) =>
          Stream.scoped(
            Stream.unwrap(allocateRun(agent, { ...options, prompt }).pipe(Effect.map((current) => current.events))),
          ),
        ),
      ),
    ),
)

interface RunFunction {
  <InputValue, O extends InvocationOptions = Record<never, never>>(
    input: InputValue,
    options?: O,
  ): <
    Tools extends Record<string, Tool.Any>,
    R,
    PolicyServices extends R,
    AuthorizationServices extends R,
    InputCodec extends Schema.Top,
    OutputCodec extends Schema.Top,
  >(
    agent: InputValue extends InputCodec["Type"]
      ? Agent<Tools, R, PolicyServices, AuthorizationServices, InputCodec, OutputCodec>
      : never,
  ) => Effect.Effect<OutputCodec["Type"], RunError, RunRequirements<Tools, R, O>>
  <
    Tools extends Record<string, Tool.Any>,
    R,
    PolicyServices extends R,
    AuthorizationServices extends R,
    InputCodec extends Schema.Top,
    OutputCodec extends Schema.Top,
    O extends InvocationOptions = Record<never, never>,
  >(
    agent: Agent<Tools, R, PolicyServices, AuthorizationServices, InputCodec, OutputCodec>,
    input: InputCodec["Type"],
    options?: O,
  ): Effect.Effect<OutputCodec["Type"], RunError, RunRequirements<Tools, R, O>>
}

/** @experimental Run an Agent to its schema-decoded output. */
export const run: RunFunction = dual(
  isDataFirst,
  <
    Tools extends Record<string, Tool.Any>,
    R,
    PolicyServices extends R,
    AuthorizationServices extends R,
    InputCodec extends Schema.Top,
    OutputCodec extends Schema.Top,
  >(
    agent: Agent<Tools, R, PolicyServices, AuthorizationServices, InputCodec, OutputCodec>,
    input: InputCodec["Type"],
    options: InvocationOptions = {},
  ) =>
    Stream.runLast(stream(agent, input, options)).pipe(
      Effect.flatMap(
        Option.match({
          onNone: () => Effect.fail(AgentError.make({ message: "Agent run ended without a Completed event", turn: 0 })),
          onSome: (event) =>
            event._tag === "Completed"
              ? Effect.succeed(event.output)
              : Effect.fail(AgentError.make({ message: "Agent run ended without a Completed event", turn: 0 })),
        }),
      ),
    ),
)
