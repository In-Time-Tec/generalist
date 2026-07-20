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
  ProgressOverflowError,
  ResumeMismatch,
  ToolNameCollision,
  type ToolOrigin,
  TurnLimitExceeded,
  TurnPolicyStopped,
} from "./agent-event.js"
import { type Key, Memory } from "./memory.js"
import { type LanguageModelNotRegistered, type ModelSelection, ModelRegistry } from "./model-registry.js"
import type { ToolAuthorizer } from "./tool-authorization.js"
import { ToolContext } from "./tool-context.js"
import { FrameworkFailure } from "./tool-executor.js"
import { defaultPolicy, type TurnPolicy, TurnPolicyError } from "./turn-policy.js"

import { streamInternal } from "./agent-run.js"

const AgentTypeId: unique symbol = Symbol.for("@batonfx/core/Agent")
/** @experimental An agent definition: a plain value, not a service. */
export interface Agent<Tools extends Record<string, Tool.Any> = {}, R = LanguageModel.LanguageModel> {
  readonly [AgentTypeId]: {
    readonly tools: Types.Invariant<Tools>
    readonly requirements: Types.Invariant<R>
  }
  readonly name: string
  readonly instructions?: string
  readonly toolkit: Toolkit.Toolkit<Tools>
  readonly policy: TurnPolicy<R>
  readonly model?: ModelSelection
  readonly memory?: Key
  readonly authorization?: ToolAuthorizer<R>
  readonly toolExecution?: ToolExecutionPolicy
  readonly metadata?: Readonly<Record<string, unknown>>
  readonly toolDeclarations?: ReadonlyArray<ToolDeclaration>
}

/** @experimental Policy for framework-executed tool calls emitted by one model turn. */
export interface ToolExecutionPolicy {
  readonly concurrency: number
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
  const O extends MakeToolsOptions<StaticTools, any, any> = MakeToolsOptions<StaticTools>,
>(
  options: MakeToolsOptions<StaticTools, any, any> & O,
): Agent<Toolkit.ToolsByName<StaticTools>, OptionRequirements<Toolkit.ToolsByName<StaticTools>, O>>
export function make<
  Tools extends Record<string, Tool.Any> = {},
  const O extends MakeOptions<Tools, any, any> = MakeOptions<Tools>,
>(options: MakeOptions<Tools, any, any> & O): Agent<Tools, OptionRequirements<Tools, O>>
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
  const toolkit =
    declaredTools === undefined
      ? (options.toolkit ?? (Toolkit.empty as unknown as Toolkit.Toolkit<Tools>))
      : Toolkit.make(...declaredTools)
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
  return {
    [AgentTypeId]: {
      tools: (value: Tools) => value,
      requirements: (value: unknown) => value,
    },
    name: options.name,
    ...(options.instructions === undefined ? {} : { instructions: options.instructions }),
    toolkit: toolkit as unknown as Toolkit.Toolkit<Tools>,
    policy: options.policy ?? defaultPolicy,
    ...(options.model === undefined ? {} : { model: options.model }),
    ...(options.memory === undefined ? {} : { memory: options.memory }),
    ...(options.authorization === undefined ? {} : { authorization: options.authorization }),
    ...(options.toolExecution === undefined ? {} : { toolExecution: options.toolExecution }),
    ...(options.metadata === undefined ? {} : { metadata: options.metadata }),
    toolDeclarations: (declaredTools ?? Object.values(toolkit.tools)).map((tool) => ({
      tool,
      origin: { _tag: "Static", agent: options.name },
    })),
  }
}

/** @experimental Re-entry bound to an authoritative `AgentSuspended` checkpoint. */
export interface Resume {
  readonly suspension: AgentSuspended
}

/** @experimental Bounded buffering behavior for tool progress events. */
export type ProgressOverflowPolicy =
  | { readonly _tag: "Backpressure"; readonly capacity: number }
  | { readonly _tag: "Dropping"; readonly capacity: number }
  | { readonly _tag: "Sliding"; readonly capacity: number }
  | { readonly _tag: "Fail"; readonly capacity: number }

/** @experimental Options for an agent run. Set `schema` for a structured-output run; set `persistence` for a persisted run. */
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
  /** @experimental Spill successful tool outputs whose encoded size exceeds this byte limit. */
  readonly toolOutputMaxBytes?: number
  /** @experimental Per-tool bounded buffering policy for progress events. Defaults to backpressure at capacity 64. */
  readonly toolProgress?: ProgressOverflowPolicy
  /** @experimental Context-window hint for optional compaction. */
  readonly compaction?: {
    readonly contextWindow?: number
  }
  /** @experimental Consult the Memory service for this run. */
  readonly memory?: {
    readonly key: Key
  }
  readonly persistence?: {
    readonly chatId: string
    readonly timeToLive?: Duration.Input
  }
  readonly schema?: ObjectSchema
  readonly objectName?: string
  readonly objectPrompt?: Prompt.RawInput
}

type OperationRequirements<O> = [Exclude<OptionValue<O, "memory">, undefined>] extends [never] ? never : Memory

type ObjectSchema = Schema.Codec<unknown, Record<string, any>, unknown, unknown>

/** @experimental Default prompt for the terminal structured-output turn. */
export const defaultObjectPrompt = "Return the final structured output for the task above."

/** @experimental The error channel of `stream` and `generate`. */
export type RunError =
  | AgentError
  | AgentSuspended
  | ResumeMismatch
  | TurnPolicyError
  | TurnPolicyStopped
  | TurnLimitExceeded
  | MiddlewareViolation
  | DuplicateToolCallId
  | ProgressOverflowError
  | ToolNameCollision
  | AiError.AiError
  | LanguageModelNotRegistered
  | FrameworkFailure

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

type SchemaOf<O> = O extends { readonly schema: infer S extends ObjectSchema } ? S : never

type RunRequirements<R, O> =
  | R
  | OperationRequirements<O>
  | (O extends { readonly persistence: object } ? Chat.Persistence : never)
  | ([SchemaOf<O>] extends [never] ? never : SchemaOf<O>["DecodingServices"])

type RunResult<O> = [SchemaOf<O>] extends [never] ? Result : ObjectResult<SchemaOf<O>["Type"]>

/** @experimental Stream an agent run as Events. Set options.schema for structured output; set options.persistence for a persisted run. */
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
    options.schema === undefined
      ? undefined
      : {
          schema: options.schema,
          objectName: options.objectName ?? "output",
          objectPrompt: options.objectPrompt ?? defaultObjectPrompt,
        },
  ),
)

const generateText = <Tools extends Record<string, Tool.Any>, R>(agent: Agent<Tools, R>, options: RunOptions) =>
  Stream.runLast(stream(agent, options)).pipe(
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

const generateObjectResult = <Tools extends Record<string, Tool.Any>, R>(agent: Agent<Tools, R>, options: RunOptions) =>
  Stream.runFold(
    stream(agent, options),
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

/** @experimental Run an agent to completion. Returns ObjectResult when options.schema is set, otherwise Result. */
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
} = dual(
  2,
  <Tools extends Record<string, Tool.Any>, R>(agent: Agent<Tools, R>, options: RunOptions) =>
    (options.schema === undefined ? generateText(agent, options) : generateObjectResult(agent, options)) as any,
)
