import {
  Cause,
  Channel,
  type Duration,
  Effect,
  Equal,
  Exit,
  Fiber,
  HashMap,
  Layer,
  Option,
  Queue,
  Ref,
  Schema,
  Semaphore,
  Stream,
  Types,
} from "effect"
import { dual } from "effect/Function"
import { AiError, Chat, LanguageModel, Prompt, Response, Telemetry, Tokenizer, Tool, Toolkit } from "effect/unstable/ai"
import {
  addUsage,
  AgentError,
  AgentSuspended,
  type Completed,
  DuplicateToolCallId,
  type Event,
  MiddlewareViolation,
  ProgressOverflowError,
  ResumeMismatch,
  type SteeringDrained,
  type StructuredOutput,
  type ToolProgress,
  ToolNameCollision,
  type ToolOrigin,
  type TurnCompleted,
  TurnLimitExceeded,
  TurnPolicyStopped,
} from "./agent-event.js"
import { Approvals } from "./approvals.js"
import { Compaction, type CompactionError, DEFAULT_RESERVE_TOKENS, type Usage } from "./compaction.js"
import { Instructions, openEpoch } from "./instructions.js"
import {
  type Item,
  type Key,
  Memory,
  type MemoryError,
  isMessageFromRecall,
  messageFromRecall,
  projectTranscript,
  recalledMessageIdentity,
  replaceRecalledMessage,
} from "./memory.js"
import { type Middleware, ModelMiddleware, type TurnContext } from "./model-middleware.js"
import {
  classifyFailure as classifyModelFailure,
  type FailureClassifier,
  type LanguageModelNotRegistered,
  type ModelSelection,
  Service,
} from "./model-registry.js"
import { ModelResilience, apply } from "./model-resilience.js"
import { Permissions, RuleStore } from "./permissions.js"
import {
  type Entry,
  SessionStore,
  type SessionConflict,
  type SessionStoreError,
  buildContext,
  buildMemoryContext,
} from "./session.js"
import { SkillSource, type SkillSourceError, selectListings } from "./skill-source.js"
import { type Message, Steering } from "./steering.js"
import {
  type AuthorizationError,
  ToolAuthorizerService,
  type ToolAuthorizer,
  make as makeToolAuthorizer,
} from "./tool-authorization.js"
import { ToolContext } from "./tool-context.js"
import {
  type DomainFailure,
  FrameworkFailure,
  type Outcome,
  type Request,
  RemoteRetryError,
  type Success,
  ToolExecutor,
  executeToolkit,
} from "./tool-executor.js"
import { bound } from "./tool-output.js"
import { type Candidate, type Registry, assemble, get, select } from "./tool-registry.js"
import {
  type Decision,
  defaultPolicy,
  StopReason,
  type TurnOverrides,
  type TurnPolicy,
  TurnPolicyError,
} from "./turn-policy.js"

type CompactionResult = import("./compaction.js").Result
const AgentTypeId: unique symbol = Symbol.for("@batonfx/core/Agent")
const ModelLayerTypeId: unique symbol = Symbol.for("@batonfx/core/Agent/ModelLayer")
const classifyOtherFailure: FailureClassifier = () => "other"

/** @experimental An agent definition: a plain value, not a service. */
export interface Agent<Tools extends Record<string, Tool.Any> = {}, R = LanguageModel.LanguageModel> {
  readonly [AgentTypeId]: {
    readonly tools: Types.Invariant<Tools>
    readonly requirements: Types.Invariant<R>
  }
  readonly [ModelLayerTypeId]?: Layer.Layer<LanguageModel.LanguageModel, never, R>
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
    ? LanguageModel.LanguageModel | Service
    : Service
type MemoryRequirement<O> = [Exclude<OptionValue<O, "memory">, undefined>] extends [never] ? never : Memory
type PolicyRequirement<O> = O extends { readonly policy: TurnPolicy<infer R> } ? R : never
type AuthorizationRequirement<O> = O extends { readonly authorization: ToolAuthorizer<infer R> } ? R : never
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

const defaultProgressOverflowPolicy: ProgressOverflowPolicy = { _tag: "Backpressure", capacity: 64 }

const progressCapacitySchema = Schema.Finite.pipe(Schema.check(Schema.isInt(), Schema.isGreaterThan(0)))

const progressOverflowPolicySchema = Schema.Union([
  Schema.TaggedStruct("Backpressure", { capacity: progressCapacitySchema }),
  Schema.TaggedStruct("Dropping", { capacity: progressCapacitySchema }),
  Schema.TaggedStruct("Sliding", { capacity: progressCapacitySchema }),
  Schema.TaggedStruct("Fail", { capacity: progressCapacitySchema }),
])

/** @experimental */
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
  /** @experimental Persisted execution uses the dedicated persisted entrypoints. */
  readonly persistence?: never
}

/** @experimental Options for a run backed by persisted chat history. */
export interface PersistedRunOptions extends Omit<RunOptions, "history" | "persistence"> {
  readonly history?: never
  readonly persistence: {
    readonly chatId: string
    readonly timeToLive?: Duration.Input
  }
}

type InternalRunOptions = Omit<RunOptions, "persistence"> & {
  readonly persistence?: PersistedRunOptions["persistence"]
}

type OperationRequirements<O> = [Exclude<OptionValue<O, "memory">, undefined>] extends [never] ? never : Memory

type ObjectSchema = Schema.Codec<unknown, Record<string, any>, unknown, unknown>

/** @experimental Default prompt for the terminal structured-output turn. */
export const defaultObjectPrompt = "Return the final structured output for the task above."

const steeringDrainedEvent = (
  turn: number,
  queue: SteeringDrained["queue"],
  messages: ReadonlyArray<Message>,
): SteeringDrained => ({
  _tag: "SteeringDrained",
  turn,
  queue,
  count: messages.length,
})

/** @experimental Options for a run that ends in a schema-validated result. */
export interface ObjectRunOptions<StructuredOutputSchema extends ObjectSchema> extends RunOptions {
  readonly schema: StructuredOutputSchema
  readonly objectName?: string
  readonly objectPrompt?: Prompt.RawInput
}

/** @experimental Persisted options for a schema-validated run. */
export interface PersistedObjectRunOptions<StructuredOutputSchema extends ObjectSchema> extends PersistedRunOptions {
  readonly schema: StructuredOutputSchema
  readonly objectName?: string
  readonly objectPrompt?: Prompt.RawInput
}

interface StructuredRunConfig<StructuredOutputSchema extends ObjectSchema> {
  readonly schema: StructuredOutputSchema
  readonly objectName: string
  readonly objectPrompt: Prompt.RawInput
}

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

type StaticToolServices<Tools extends Record<string, Tool.Any>> =
  | Tool.HandlersFor<Tools>
  | Exclude<Tool.HandlerServices<Tools[keyof Tools]>, ToolContext>

type AnyToolCall = Response.ToolCallPart<string, unknown>

type PendingToolResult = Response.ToolResultPart<string, unknown, unknown>

interface ToolCallIdState {
  readonly nextIndex: number
  readonly firstIndexes: HashMap.HashMap<string, number>
}

interface PersistedChatLock {
  readonly semaphore: Semaphore.Semaphore
  users: number
}

const persistenceLocks = new WeakMap<Chat.Persistence.Service, Map<string, PersistedChatLock>>()

const reservePersistedChatLock = (persistence: Chat.Persistence.Service, chatId: string): PersistedChatLock => {
  const locks = persistenceLocks.get(persistence) ?? new Map<string, PersistedChatLock>()
  if (!persistenceLocks.has(persistence)) persistenceLocks.set(persistence, locks)
  const existing = locks.get(chatId)
  if (existing !== undefined) {
    existing.users += 1
    return existing
  }
  const created = { semaphore: Semaphore.makeUnsafe(1), users: 1 }
  locks.set(chatId, created)
  return created
}

interface SuspensionCheckpoint {
  readonly call: Prompt.ToolCallPart
  readonly messages: ReadonlyArray<Prompt.Message>
  readonly suspension: AgentSuspended
}

const suspensionCheckpointOption = "@batonfx/core/suspension" as const

const suspensionMetadata = Schema.Struct({
  token: Schema.String,
  reason: Schema.Literals(["tool-wait", "approval"]),
  authorization_stage: Schema.optional(Schema.Literals(["permission", "approval"])),
  tool_call_index: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  tool_call_batch_ids: Schema.Array(Schema.String),
  active_tools: Schema.optional(Schema.Array(Schema.String)),
  activated_skills: Schema.optional(Schema.Array(Schema.String)),
})

const releasePersistedChatLock = (
  persistence: Chat.Persistence.Service,
  chatId: string,
  lock: PersistedChatLock,
): void => {
  lock.users -= 1
  if (lock.users !== 0) return
  const locks = persistenceLocks.get(persistence)
  if (locks?.get(chatId) !== lock) return
  locks.delete(chatId)
  if (locks.size === 0) persistenceLocks.delete(persistence)
}

const unresolvedToolCall = (
  messages: ReadonlyArray<Prompt.Message>,
  toolCallId?: string,
):
  | {
      readonly call: Prompt.ToolCallPart
      readonly messages: ReadonlyArray<Prompt.Message>
      readonly messageIndex: number
      readonly partIndex: number
      readonly toolCallBatch: ReadonlyArray<AnyToolCall>
    }
  | undefined => {
  interface Occurrence {
    readonly call: Prompt.ToolCallPart
    readonly messageIndex: number
    readonly partIndex: number
  }
  const unpaired = new Map<string, Array<Occurrence>>()
  const ambiguous = new Set<string>()
  for (const [messageIndex, message] of messages.entries()) {
    if (typeof message.content === "string") continue
    for (const [partIndex, part] of message.content.entries()) {
      if (part.type === "tool-call") {
        const occurrences = unpaired.get(part.id) ?? []
        if (!part.providerExecuted && occurrences.some(({ call }) => !call.providerExecuted)) ambiguous.add(part.id)
        occurrences.push({ call: part, messageIndex, partIndex })
        unpaired.set(part.id, occurrences)
      }
      if (part.type === "tool-result") {
        const occurrences = unpaired.get(part.id)
        if (occurrences === undefined) continue
        const matched = occurrences.findLastIndex(({ call }) => call.name === part.name)
        if (matched !== -1) occurrences.splice(matched, 1)
        if (occurrences.length === 0) {
          unpaired.delete(part.id)
          ambiguous.delete(part.id)
        }
      }
    }
  }
  const unresolved = [...unpaired.entries()].flatMap(([id, occurrences]) =>
    ambiguous.has(id) ? [] : occurrences.filter(({ call }) => !call.providerExecuted),
  )
  const pending =
    toolCallId === undefined
      ? unresolved.find(({ call }) =>
          Option.isSome(Schema.decodeUnknownOption(suspensionMetadata)(call.options[suspensionCheckpointOption])),
        )
      : unresolved.find(({ call }) => call.id === toolCallId)
  const pendingMessage = pending === undefined ? undefined : messages[pending.messageIndex]
  const toolCallBatch =
    pendingMessage?.role === "assistant"
      ? pendingMessage.content.flatMap((part) =>
          part.type === "tool-call" && !part.providerExecuted
            ? [
                Response.makePart("tool-call", {
                  id: part.id,
                  name: part.name,
                  params: part.params,
                  providerExecuted: false,
                }),
              ]
            : [],
        )
      : []
  return pending !== undefined
    ? {
        call: pending.call,
        messages: messages.slice(0, pending.messageIndex),
        messageIndex: pending.messageIndex,
        partIndex: pending.partIndex,
        toolCallBatch,
      }
    : undefined
}

const suspensionCheckpoint = (messages: ReadonlyArray<Prompt.Message>): SuspensionCheckpoint | undefined => {
  const unresolved = unresolvedToolCall(messages)
  if (unresolved === undefined) return undefined
  const metadata = Schema.decodeUnknownOption(suspensionMetadata)(unresolved.call.options[suspensionCheckpointOption])
  if (Option.isNone(metadata)) return undefined
  if (
    !Equal.equals(
      metadata.value.tool_call_batch_ids,
      unresolved.toolCallBatch.map((call) => call.id),
    )
  )
    return undefined
  return {
    call: unresolved.call,
    messages: unresolved.messages,
    suspension: AgentSuspended.make({
      ...metadata.value,
      tool_call_batch: unresolved.toolCallBatch,
      tool_call_id: unresolved.call.id,
      tool_name: unresolved.call.name,
      tool_params: unresolved.call.params,
    }),
  }
}

const sameSuspension = (left: AgentSuspended, right: AgentSuspended): boolean =>
  left.token === right.token &&
  left.reason === right.reason &&
  left.authorization_stage === right.authorization_stage &&
  left.tool_call_index === right.tool_call_index &&
  Equal.equals(left.tool_call_batch, right.tool_call_batch) &&
  left.tool_call_id === right.tool_call_id &&
  left.tool_name === right.tool_name &&
  Equal.equals(left.tool_params, right.tool_params) &&
  Equal.equals(left.active_tools, right.active_tools) &&
  Equal.equals(left.activated_skills, right.activated_skills)

const skillListingBudgetTokens = 2_048

const activateSkillToolName = "activate_skill"

const activateSkillParameters = Schema.Struct({ name: Schema.String })

const activateSkillSuccess = Schema.Struct({
  name: Schema.String,
  body: Schema.String,
  allowedTools: Schema.Array(Schema.String),
})

const activateSkillFailure = Schema.Struct({
  reason: Schema.Literals(["not-found", "not-model-invocable"]),
  message: Schema.String,
})

const activateSkillTool = Tool.make(activateSkillToolName, {
  description: "Load the full body for one listed Baton skill by name before applying that skill.",
  parameters: activateSkillParameters,
  success: activateSkillSuccess,
  failure: activateSkillFailure,
  failureMode: "return",
})

const errorMessage = (error: unknown) => (error instanceof Error ? `${error.name}: ${error.message}` : String(error))

const isToolNameCollision = Schema.is(ToolNameCollision)

const appendInstructionFragment = (base: string | undefined, fragment: string | undefined): string | undefined => {
  if (fragment === undefined || fragment.length === 0) return base
  if (base === undefined || base.length === 0) return fragment
  return `${base}\n\n${fragment}`
}

const isTurnPolicyDecision = (input: unknown): input is Decision => {
  if (typeof input !== "object" || input === null || !("_tag" in input)) return false
  if (input._tag === "Continue") return true
  return input._tag === "Stop" && "reason" in input && Schema.is(StopReason)(input.reason)
}

const successResult = (call: AnyToolCall, outcome: Success): PendingToolResult =>
  Response.toolResultPart({
    id: call.id,
    name: call.name,
    isFailure: false,
    result: outcome.result,
    encodedResult: outcome.encodedResult,
    providerExecuted: false,
    preliminary: false,
  })

const domainFailureResult = (call: AnyToolCall, outcome: DomainFailure): PendingToolResult =>
  Response.toolResultPart({
    id: call.id,
    name: call.name,
    isFailure: true,
    result: outcome.failure,
    encodedResult: outcome.encodedFailure,
    providerExecuted: false,
    preliminary: false,
  })

const suspended = (
  call: AnyToolCall,
  toolCallBatch: Request["toolCallBatch"],
  toolCallIndex: number,
  token: string,
  reason: "tool-wait" | "approval",
) =>
  AgentSuspended.make({
    token,
    reason,
    tool_call_index: toolCallIndex,
    tool_call_id: call.id,
    tool_name: call.name,
    tool_params: call.params,
    tool_call_batch: toolCallBatch.calls,
  })

const withSystem = (instructions: string, prompt: Prompt.Prompt): Prompt.Prompt =>
  Prompt.fromMessages([Prompt.makeMessage("system", { content: instructions }), ...prompt.content])

const skillListingsInstructions = (listings: string): string =>
  `Available skills:\n${listings}\n\nCall ${activateSkillToolName} with a listed skill name to load its full body before using it.`

const recalledMessages = (prompt: Prompt.Prompt): ReadonlyArray<Prompt.Message> =>
  prompt.content.filter(isMessageFromRecall).map(recalledMessageIdentity)

const messageJsonStringCodec = Schema.fromJsonString(Schema.toCodecJson(Prompt.Message))
const encodeMessage = Schema.encodeEffect(messageJsonStringCodec)
const decodeMessage = Schema.decodeEffect(messageJsonStringCodec)

const detachMessage = (message: Prompt.Message) =>
  encodeMessage(message).pipe(
    Effect.flatMap(decodeMessage),
    Effect.map((detached) =>
      isMessageFromRecall(message) && message.role === "user" && detached.role === "user"
        ? replaceRecalledMessage(message, detached.content)
        : detached,
    ),
  )

const detachPrompt = (prompt: Prompt.Prompt) =>
  Effect.forEach(prompt.content, detachMessage).pipe(Effect.map(Prompt.fromMessages))

const detachEntry = (entry: Entry) =>
  entry._tag === "Message" || entry._tag === "Steering"
    ? detachMessage(entry.message).pipe(Effect.map((message): Entry => ({ ...entry, message })))
    : Effect.succeed(entry)

const preservesRecalledMessages = (
  allowed: ReadonlyArray<Prompt.Message>,
  required: ReadonlyArray<Prompt.Message>,
  transformed: Prompt.Prompt,
): boolean => {
  const allowedSet = new Set(allowed)
  const transformedMessages = recalledMessages(transformed)
  const transformedSet = new Set(transformedMessages)
  return (
    transformedSet.size === transformedMessages.length &&
    transformedMessages.every((message) => allowedSet.has(message)) &&
    required.every((message) => transformedSet.has(message))
  )
}

/** Fold the prompt through every `transformPrompt` hook in array order. */
const applyPromptChain = (
  chain: ReadonlyArray<Middleware>,
  prompt: Prompt.Prompt,
  context: TurnContext,
): Effect.Effect<Prompt.Prompt, AgentError | MiddlewareViolation> =>
  Effect.gen(function* () {
    let current = prompt
    for (const middleware of chain) {
      if (middleware.transformPrompt !== undefined) {
        const recalled = recalledMessages(current)
        const transformed = yield* middleware.transformPrompt(current, context)
        if (!preservesRecalledMessages(recalled, recalled, transformed)) {
          return yield* MiddlewareViolation.make({
            turn: context.turn,
            detail: "Prompt middleware must preserve recalled-memory message lineage",
          })
        }
        current = transformed
      }
    }
    return current
  })

/** Thread a stream part through every `transformPart` hook; the first `none()` short-circuits. */
const applyPartChain = (
  chain: ReadonlyArray<Middleware>,
  part: Response.StreamPart<any>,
  context: TurnContext,
): Effect.Effect<Option.Option<Response.StreamPart<any>>, AgentError> =>
  Effect.gen(function* () {
    let current: Option.Option<Response.StreamPart<any>> = Option.some(part)
    for (const middleware of chain) {
      if (Option.isNone(current)) break
      if (middleware.transformPart !== undefined) {
        current = yield* middleware.transformPart(current.value, context)
      }
    }
    return current
  })

const streamInternal = <Tools extends Record<string, Tool.Any>, R, StructuredOutputSchema extends ObjectSchema>(
  agent: Agent<Tools, R>,
  options: InternalRunOptions,
  structured: StructuredRunConfig<StructuredOutputSchema> | undefined,
): Stream.Stream<Event, RunError, R | StructuredOutputSchema["DecodingServices"]> =>
  Stream.unwrap(
    Effect.gen(function* () {
      if (options.history !== undefined && options.persistence !== undefined) {
        return yield* AgentError.make({
          message: "RunOptions.history and RunOptions.persistence are mutually exclusive",
          turn: 0,
        })
      }

      const persistenceOptions = options.persistence
      const resume = options.resume
      const persistenceService = yield* Effect.serviceOption(Chat.Persistence)
      const compactionService = yield* Effect.serviceOption(Compaction)
      const sessionService = yield* Effect.serviceOption(SessionStore)
      const persisted: Chat.Persisted | undefined =
        persistenceOptions === undefined
          ? undefined
          : yield* Option.match(persistenceService, {
              onNone: () =>
                Effect.fail(
                  AgentError.make({
                    message: "RunOptions.persistence requires Chat.Persistence in context",
                    turn: 0,
                  }),
                ),
              onSome: (service) =>
                Effect.gen(function* () {
                  const lock = yield* Effect.acquireRelease(
                    Effect.sync(() => reservePersistedChatLock(service, persistenceOptions.chatId)),
                    (reserved) =>
                      Effect.sync(() => releasePersistedChatLock(service, persistenceOptions.chatId, reserved)),
                  )
                  yield* Effect.acquireRelease(lock.semaphore.take(1), () => lock.semaphore.release(1), {
                    interruptible: true,
                  })
                  const getOptions =
                    persistenceOptions.timeToLive === undefined
                      ? undefined
                      : { timeToLive: persistenceOptions.timeToLive }
                  return yield* resume === undefined
                    ? service
                        .getOrCreate(persistenceOptions.chatId, getOptions)
                        .pipe(
                          Effect.mapError((error) =>
                            AgentError.make({ message: errorMessage(error), turn: 0, cause: error }),
                          ),
                        )
                    : service.get(persistenceOptions.chatId, getOptions).pipe(
                        Effect.mapError((error) =>
                          error._tag === "ChatNotFoundError"
                            ? ResumeMismatch.make({
                                reason: "checkpoint-not-found",
                                received: resume.suspension,
                              })
                            : AgentError.make({ message: errorMessage(error), turn: 0, cause: error }),
                        ),
                      )
                }),
            })

      let recoveredHistory: Prompt.Prompt | undefined
      if (
        resume !== undefined &&
        persisted !== undefined &&
        Option.isSome(compactionService) &&
        Option.isSome(sessionService)
      ) {
        yield* Effect.gen(function* () {
          const path = yield* sessionService.value.path()
          const checkpoint = path.at(-1)
          if (checkpoint?._tag !== "Compaction" || checkpoint.version !== 2) return
          const history = yield* Ref.get(persisted.history)
          const before = buildContext(path.slice(0, -1))
          if (!Schema.toEquivalence(Prompt.Prompt)(before, history)) return
          recoveredHistory = buildContext(path)
        }).pipe(Effect.mapError((error) => AgentError.make({ message: errorMessage(error), turn: 0, cause: error })))
      }

      let resumeChat: Chat.Service | undefined
      let validatedResume: SuspensionCheckpoint | undefined
      if (resume !== undefined) {
        resumeChat = persisted ?? (yield* options.history === undefined ? Chat.empty : Chat.fromPrompt(options.history))
        const received = resume.suspension
        const resumeHistory = recoveredHistory ?? (yield* Ref.get(resumeChat.history))
        validatedResume = yield* Effect.succeed(resumeHistory).pipe(
          Effect.flatMap((history) => {
            const expected = suspensionCheckpoint(history.content)
            if (expected === undefined) {
              return ResumeMismatch.make({ reason: "checkpoint-not-found", received })
            }
            return sameSuspension(expected.suspension, received)
              ? Effect.succeed(expected)
              : ResumeMismatch.make({
                  reason: "identity-mismatch",
                  expected: expected.suspension,
                  received,
                })
          }),
        )
        if (recoveredHistory !== undefined && persisted !== undefined) {
          yield* Ref.set(persisted.history, recoveredHistory)
          yield* persisted.save.pipe(
            Effect.mapError((error) => AgentError.make({ message: errorMessage(error), turn: 0, cause: error })),
          )
        }
      }

      const staticCandidates: ReadonlyArray<Candidate> = (
        agent.toolDeclarations ??
        Object.values(agent.toolkit.tools).map((tool) => ({
          tool,
          origin: { _tag: "Static" as const, agent: agent.name },
        }))
      ).map(({ origin, tool }) => ({
        origin,
        tool,
        dispatch: "Static",
      }))
      const staticRegistry = yield* assemble(staticCandidates)
      const staticToolkit = staticRegistry.toolkit as unknown as Toolkit.Toolkit<Tools>
      if (
        agent.toolDeclarations !== undefined &&
        (agent.toolDeclarations.length !== Object.keys(agent.toolkit.tools).length ||
          agent.toolDeclarations.some((declaration) => agent.toolkit.tools[declaration.tool.name] !== declaration.tool))
      ) {
        return yield* AgentError.make({
          message: "Agent tool declarations and toolkit must contain the same tool instances",
          turn: 0,
        })
      }
      const executor = yield* Effect.serviceOption(ToolExecutor)
      const approvals = yield* Effect.serviceOption(Approvals)
      const chain = yield* Effect.serviceOption(ModelMiddleware).pipe(
        Effect.map(Option.match({ onNone: () => [], onSome: (service) => service })),
      )

      if (
        options.toolOutputMaxBytes !== undefined &&
        (!Number.isFinite(options.toolOutputMaxBytes) || options.toolOutputMaxBytes < 0)
      ) {
        return yield* AgentError.make({
          message: "RunOptions.toolOutputMaxBytes must be a non-negative finite number",
          turn: 0,
        })
      }

      const decodedProgressPolicy = Schema.decodeUnknownOption(progressOverflowPolicySchema)(
        options.toolProgress === undefined ? defaultProgressOverflowPolicy : options.toolProgress,
      )
      if (Option.isNone(decodedProgressPolicy)) {
        return yield* AgentError.make({
          message: "RunOptions.toolProgress must select a supported policy with a positive safe-integer capacity",
          turn: 0,
        })
      }
      const progressPolicy: ProgressOverflowPolicy = decodedProgressPolicy.value

      if (
        agent.toolExecution !== undefined &&
        (!Number.isSafeInteger(agent.toolExecution.concurrency) || agent.toolExecution.concurrency <= 0)
      ) {
        return yield* AgentError.make({
          message: "Agent.toolExecution.concurrency must be a positive safe integer",
          turn: 0,
        })
      }

      if (
        options.compaction?.contextWindow !== undefined &&
        (!Number.isFinite(options.compaction.contextWindow) || options.compaction.contextWindow <= 0)
      ) {
        return yield* AgentError.make({
          message: "RunOptions.compaction.contextWindow must be a positive finite number",
          turn: 0,
        })
      }

      const sessionId = options.sessionId ?? "local"

      const instructionsService = yield* Effect.serviceOption(Instructions)
      const skillSourceService = yield* Effect.serviceOption(SkillSource)
      const skillRuntime = Option.isNone(skillSourceService)
        ? undefined
        : {
            source: skillSourceService.value,
            skills: yield* skillSourceService.value.all.pipe(
              Effect.mapError((error) => AgentError.make({ message: error.message, turn: 0, cause: error })),
            ),
          }
      const selectedSkills =
        skillRuntime === undefined ? [] : selectListings(skillRuntime.skills, skillListingBudgetTokens, [])
      const skillListings = selectedSkills.map((skill) => skill.listing).join("\n")
      const hasActivatableSkills = selectedSkills.length > 0
      const initialRegistry = yield* assemble([
        ...staticCandidates,
        ...(hasActivatableSkills
          ? [
              {
                tool: activateSkillTool,
                origin: { _tag: "Builtin", builtin: "activate_skill" } as const,
                dispatch: "Builtin" as const,
              },
            ]
          : []),
      ])
      const instructionsEpoch =
        options.system === undefined && options.history === undefined && Option.isSome(instructionsService)
          ? yield* openEpoch(instructionsService.value, { agentName: agent.name, turn: 0 })
          : undefined
      const baseSystem =
        options.system ??
        (instructionsEpoch === undefined
          ? agent.instructions
          : instructionsEpoch.baseline.length === 0
            ? agent.instructions
            : instructionsEpoch.baseline)
      const system = appendInstructionFragment(
        baseSystem,
        options.history === undefined && skillListings.length > 0
          ? skillListingsInstructions(skillListings)
          : undefined,
      )

      const resilienceService = yield* Effect.serviceOption(ModelResilience)
      const modelRegistryService = yield* Effect.serviceOption(Service)
      const permissionsService = yield* Effect.serviceOption(Permissions)
      const ruleStoreService = yield* Effect.serviceOption(RuleStore)
      const authorizationService = yield* Effect.serviceOption(ToolAuthorizerService)
      const steeringService = yield* Effect.serviceOption(Steering)
      const memoryService = yield* Effect.serviceOption(Memory)
      const tokenizerService = yield* Effect.serviceOption(Tokenizer.Tokenizer)
      const authorizer =
        agent.authorization ??
        Option.getOrElse(authorizationService, () =>
          makeToolAuthorizer({
            ...(Option.isNone(permissionsService) ? {} : { permissions: permissionsService.value }),
            ...(Option.isNone(approvals) ? {} : { approvals: approvals.value }),
            ...(Option.isNone(ruleStoreService) ? {} : { ruleStore: ruleStoreService.value }),
          }),
        )
      const memoryOptions = options.memory ?? (agent.memory === undefined ? undefined : { key: agent.memory })
      const agentModel = agent.model
      const agentModelRegistry =
        agentModel === undefined
          ? undefined
          : yield* Option.match(modelRegistryService, {
              onNone: () =>
                Effect.fail(
                  AgentError.make({
                    message: "Agent.model requires ModelRegistry in context",
                    turn: 0,
                  }),
                ),
              onSome: Effect.succeed,
            })
      const memoryRuntime: { readonly key: Key; readonly service: typeof Memory.Service } | undefined =
        memoryOptions === undefined
          ? undefined
          : {
              key: memoryOptions.key,
              service: yield* Option.match(memoryService, {
                onNone: () =>
                  Effect.fail(
                    AgentError.make({
                      message:
                        options.memory === undefined
                          ? "Agent.memory requires Memory in context"
                          : "RunOptions.memory requires Memory in context",
                      turn: 0,
                    }),
                  ),
                onSome: Effect.succeed,
              }),
            }
      // On a persisted chat with no stored history, seed the system message into
      // the first turn's prompt; on a non-empty history it is already stored.
      const seedSystem =
        persisted !== undefined && system !== undefined && (yield* Ref.get(persisted.history)).content.length === 0
          ? system
          : undefined

      const freshChat =
        options.history !== undefined
          ? Chat.fromPrompt(options.history)
          : system !== undefined
            ? Chat.fromPrompt([Prompt.makeMessage("system", { content: system })])
            : Chat.empty
      const chat: Chat.Service = resumeChat ?? persisted ?? (yield* freshChat)

      const savePersisted = (turn: number): Effect.Effect<void, AgentError> =>
        persisted === undefined
          ? Effect.void
          : persisted.save.pipe(
              Effect.mapError((error) => AgentError.make({ message: errorMessage(error), turn, cause: error })),
            )

      const appendPending = (
        turn: number,
        pending: ReadonlyArray<PendingToolResult>,
      ): Effect.Effect<Prompt.Prompt, AgentError> =>
        pending.length === 0
          ? Ref.get(chat.history)
          : Ref.updateAndGet(chat.history, (history) => Prompt.concat(history, Prompt.fromResponseParts(pending))).pipe(
              Effect.tap(() => savePersisted(turn)),
            )

      const checkpointSuspended = (
        turn: number,
        pending: ReadonlyArray<PendingToolResult>,
        suspension: AgentSuspended,
      ): Effect.Effect<Prompt.Prompt, AgentError> =>
        Effect.gen(function* () {
          const withPending = yield* appendPending(turn, pending)
          const unresolved = unresolvedToolCall(withPending.content, suspension.tool_call_id)
          if (
            unresolved === undefined ||
            unresolved.call.id !== suspension.tool_call_id ||
            unresolved.call.name !== suspension.tool_name ||
            !Equal.equals(unresolved.call.params, suspension.tool_params)
          ) {
            return yield* AgentError.make({
              message: "Suspension does not match the unresolved checkpoint call",
              turn,
            })
          }
          const metadata = {
            token: suspension.token,
            reason: suspension.reason,
            ...(suspension.authorization_stage === undefined
              ? {}
              : { authorization_stage: suspension.authorization_stage }),
            ...(suspension.tool_call_index === undefined ? {} : { tool_call_index: suspension.tool_call_index }),
            tool_call_batch_ids: suspension.tool_call_batch.map((call) => call.id),
            ...(suspension.active_tools === undefined ? {} : { active_tools: suspension.active_tools }),
            ...(suspension.activated_skills === undefined ? {} : { activated_skills: suspension.activated_skills }),
          }
          const messages = withPending.content.map((message, messageIndex): Prompt.Message => {
            if (messageIndex !== unresolved.messageIndex || message.role !== "assistant") return message
            return Prompt.makeMessage("assistant", {
              content: message.content.map(
                (part, partIndex): Prompt.AssistantMessagePart =>
                  partIndex === unresolved.partIndex && part.type === "tool-call"
                    ? Prompt.makePart("tool-call", {
                        id: part.id,
                        name: part.name,
                        params: part.params,
                        providerExecuted: part.providerExecuted,
                        options: { ...part.options, [suspensionCheckpointOption]: metadata },
                      })
                    : part,
              ),
              options: message.options,
            })
          })
          const checkpoint = Prompt.fromMessages(messages)
          const path = yield* syncSession(turn, withPending)
          const parentId = path.at(-1)?.id ?? null
          yield* applyCompactionResult(
            turn,
            { _tag: "Microcompact", history: checkpoint, prompt: Prompt.empty },
            parentId,
          )
          if (Option.isNone(activeSession)) yield* savePersisted(turn)
          return yield* Ref.get(chat.history)
        })

      const checkpointPending = (
        turn: number,
        pending: ReadonlyArray<PendingToolResult>,
      ): Effect.Effect<Prompt.Prompt, AgentError> =>
        appendPending(turn, pending).pipe(Effect.tap((checkpoint) => syncSession(turn, checkpoint)))

      const failSuspended = (
        call: AnyToolCall,
        toolCallBatch: Request["toolCallBatch"],
        toolCallIndex: number,
        token: string,
        reason: "tool-wait" | "approval",
      ) => Stream.fail<RunError>(suspended(call, toolCallBatch, toolCallIndex, token, reason))

      const state = {
        text: "",
        turn: 0,
        pending: [] as Array<PendingToolResult>,
        finish: undefined as { readonly usage: Response.Usage; readonly reason: Response.FinishReason } | undefined,
        usage: undefined as Response.Usage | undefined,
      }

      const toolState = yield* Ref.make({
        registry: initialRegistry,
        activatedSkillBodies: new Map<string, string>(),
      })

      const restoreActivatedSkills = (history: Prompt.Prompt): Effect.Effect<void, AgentError | ToolNameCollision> =>
        Effect.gen(function* () {
          for (const message of history.content) {
            if (!Array.isArray(message.content)) continue
            for (const part of message.content) {
              if (
                String(part.type) !== "tool-result" ||
                String(part.name) !== activateSkillToolName ||
                part.isFailure === true
              )
                continue
              const activation = Schema.decodeUnknownOption(activateSkillSuccess)(part.result)
              if (Option.isNone(activation)) continue
              if (skillRuntime === undefined) {
                return yield* AgentError.make({
                  message: "Resuming activated skill tools requires SkillSource in context",
                  turn: 0,
                })
              }
              const skill = yield* skillRuntime.source.get(activation.value.name)
              if (skill === undefined) {
                return yield* AgentError.make({
                  message: `Skill not found while restoring resume state: ${activation.value.name}`,
                  turn: 0,
                })
              }
              const current = yield* Ref.get(toolState)
              if (current.activatedSkillBodies.has(skill.frontmatter.name)) continue
              const registry = yield* assemble([
                ...current.registry.entries,
                ...skill.tools.map(
                  (tool): Candidate => ({
                    tool,
                    origin: { _tag: "Skill", skill: skill.frontmatter.name },
                    dispatch: "Skill",
                  }),
                ),
              ])
              const activatedSkillBodies = new Map(current.activatedSkillBodies)
              activatedSkillBodies.set(skill.frontmatter.name, activation.value.body)
              yield* Ref.set(toolState, { registry, activatedSkillBodies })
            }
          }
        }).pipe(
          Effect.mapError((error) =>
            isToolNameCollision(error) ? error : AgentError.make({ message: error.message, turn: 0, cause: error }),
          ),
        )

      if (validatedResume !== undefined) yield* Ref.get(chat.history).pipe(Effect.flatMap(restoreActivatedSkills))

      const activeSession = Option.isSome(compactionService)
        ? sessionService
        : Option.none<typeof SessionStore.Service>()

      const sessionError = (turn: number, error: SessionStoreError | SessionConflict): AgentError =>
        AgentError.make({ message: error.message, turn, cause: error })

      const compactionError = (turn: number, error: CompactionError): AgentError =>
        AgentError.make({ message: error.message, turn, cause: error })

      const memoryError = (turn: number, error: MemoryError): AgentError =>
        AgentError.make({ message: error.message, turn, cause: error })

      const skillError = (turn: number, error: SkillSourceError): AgentError =>
        AgentError.make({ message: error.message, turn, cause: error })

      const isSkillActivationCall = (call: AnyToolCall, registry: Registry): boolean =>
        get(registry, call.name)?.dispatch === "Builtin" && skillRuntime !== undefined

      const insertRecalledItems = (prompt: Prompt.Prompt, items: ReadonlyArray<Item>): Prompt.Prompt => {
        const content = items.flatMap((item) => item.content)
        if (content.length === 0) return prompt
        const memoryMessage = messageFromRecall(content)
        const [first, ...rest] = prompt.content
        return first?.role === "system"
          ? Prompt.fromMessages([first, memoryMessage, ...rest])
          : Prompt.fromMessages([memoryMessage, ...prompt.content])
      }

      const recallInitialPrompt = (prompt: Prompt.Prompt): Effect.Effect<Prompt.Prompt, AgentError> =>
        memoryRuntime === undefined
          ? Effect.succeed(prompt)
          : memoryRuntime.service.recall({ key: memoryRuntime.key, turn: 0, prompt }).pipe(
              Effect.mapError((error) => memoryError(0, error)),
              Effect.map((items) => insertRecalledItems(prompt, items)),
            )

      const rememberTurn = (
        turn: number,
        transcript: Prompt.Prompt,
        terminal: boolean,
        path: ReadonlyArray<Entry>,
      ): Effect.Effect<void, AgentError> =>
        memoryRuntime === undefined
          ? Effect.void
          : memoryRuntime.service
              .remember({
                key: memoryRuntime.key,
                turn,
                transcript: Option.isSome(activeSession) ? buildMemoryContext(path) : projectTranscript(transcript),
                terminal,
              })
              .pipe(Effect.mapError((error) => memoryError(turn, error)))

      const messageEquivalence = Schema.toEquivalence(Prompt.Message)
      const promptEquivalence = Schema.toEquivalence(Prompt.Prompt)
      const sessionTranscriptCursor = (
        projection: ReadonlyArray<Prompt.Message>,
        transcript: ReadonlyArray<Prompt.Message>,
      ): Option.Option<number> => {
        if (projection.length === 0) return Option.some(0)
        const matches: Array<number> = []
        for (let start = 0; start <= transcript.length - projection.length; start += 1) {
          if (
            transcript.slice(0, start).every((message) => message.role === "system") &&
            projection.every((message, index) =>
              messageEquivalence(message, transcript[start + index] as Prompt.Message),
            )
          ) {
            matches.push(start + projection.length)
          }
        }
        return matches.length === 1 ? Option.some(matches[0] as number) : Option.none()
      }

      const syncSession = (turn: number, transcript: Prompt.Prompt): Effect.Effect<ReadonlyArray<Entry>, AgentError> =>
        Option.match(activeSession, {
          onNone: () => Effect.succeed([]),
          onSome: (session) =>
            Effect.gen(function* () {
              let path = yield* session.path()
              const projection = buildContext(path)
              const cursor = sessionTranscriptCursor(projection.content, transcript.content)
              if (Option.isNone(cursor)) {
                const checkpoint = path.at(-1)
                const before = buildContext(path.slice(0, -1))
                if (
                  checkpoint?._tag === "Compaction" &&
                  checkpoint.version === 2 &&
                  promptEquivalence(before, transcript)
                ) {
                  yield* Ref.set(chat.history, projection)
                  yield* savePersisted(turn)
                  return path
                }
                return yield* AgentError.make({
                  message: "Session projection is not a prefix of authoritative Chat history",
                  turn,
                })
              }
              let expectedLeafId = path.at(-1)?.id ?? null
              for (const message of transcript.content.slice(cursor.value)) {
                const appended = yield* session.append({ _tag: "Message", message }, { expectedLeafId })
                expectedLeafId = appended.id
              }
              if (expectedLeafId !== (path.at(-1)?.id ?? null)) path = yield* session.path()
              return path
            }).pipe(Effect.mapError((error) => (Schema.is(AgentError)(error) ? error : sessionError(turn, error)))),
        })

      const countTokens = (turn: number, prompt: Prompt.Prompt): Effect.Effect<number, AgentError> =>
        Option.match(tokenizerService, {
          onNone: () => Effect.succeed(Math.ceil(JSON.stringify(prompt.content).length / 4)),
          onSome: (tokenizer) =>
            tokenizer.tokenize(prompt).pipe(
              Effect.map((tokens) => tokens.length),
              Effect.mapError((error) => AgentError.make({ message: errorMessage(error), turn, cause: error })),
            ),
        })

      const compactionUsage = (
        turn: number,
        history: Prompt.Prompt,
        prompt: Prompt.Prompt,
      ): Effect.Effect<Usage, AgentError> =>
        countTokens(turn, Prompt.concat(history, prompt)).pipe(
          Effect.map((contextTokens) => ({
            contextTokens,
            contextWindow: options.compaction?.contextWindow ?? Number.POSITIVE_INFINITY,
            reserveTokens: DEFAULT_RESERVE_TOKENS,
          })),
        )

      const validateCompactionProjection = (
        turn: number,
        result: CompactionResult,
      ): Effect.Effect<void, AgentError> => {
        const pending = new Set<string>()
        const optional = new Set<string>()
        for (const message of Prompt.concat(result.history, result.prompt).content) {
          if (typeof message.content === "string") {
            if (pending.size > 0) {
              return Effect.fail(
                AgentError.make({ message: "Compaction projection separates a tool call from its result", turn }),
              )
            }
            optional.clear()
            continue
          }
          const hasResult = message.content.some((part) => part.type === "tool-result")
          if (pending.size > 0 && !hasResult) {
            return Effect.fail(
              AgentError.make({ message: "Compaction projection separates a tool call from its result", turn }),
            )
          }
          if (!hasResult) optional.clear()
          const responseCalls = new Set<string>()
          for (const part of message.content) {
            if (part.type === "tool-call") {
              if (responseCalls.has(part.id)) {
                return Effect.fail(
                  AgentError.make({ message: `Compaction projection contains duplicate tool call ${part.id}`, turn }),
                )
              }
              responseCalls.add(part.id)
              if (part.providerExecuted) optional.add(part.id)
              else pending.add(part.id)
            }
            if (part.type === "tool-result") {
              if (!pending.delete(part.id) && !optional.delete(part.id)) {
                return Effect.fail(
                  AgentError.make({ message: `Compaction projection contains orphan tool result ${part.id}`, turn }),
                )
              }
            }
          }
        }
        return pending.size === 0
          ? Effect.void
          : Effect.fail(AgentError.make({ message: "Compaction projection contains an unresolved tool call", turn }))
      }

      const applyCompactionResult = (
        turn: number,
        result: CompactionResult,
        parentId: string | null,
      ): Effect.Effect<void, AgentError> =>
        Option.match(activeSession, {
          onNone: () => Ref.set(chat.history, result.history),
          onSome: (session) =>
            Effect.gen(function* () {
              const id = yield* session.reserveEntryId
              yield* Effect.uninterruptibleMask((restore) =>
                restore(
                  session.appendCheckpoint({
                    id,
                    parentId,
                    projectedHistory: result.history,
                    ...(result._tag === "Summarize" ? { summary: result.summary } : {}),
                  }),
                ).pipe(
                  Effect.flatMap((appended) => restore(session.path(appended.leafId))),
                  Effect.map(buildContext),
                  Effect.tap((projection) => Ref.set(chat.history, projection)),
                  Effect.andThen(restore(savePersisted(turn))),
                ),
              )
            }).pipe(Effect.mapError((error) => (Schema.is(AgentError)(error) ? error : sessionError(turn, error)))),
        })

      const preparePrompt = (
        turn: number,
        prompt: Prompt.Prompt,
        overflow: boolean,
      ): Effect.Effect<
        { readonly prompt: Prompt.Prompt; readonly changed: boolean },
        AgentError | MiddlewareViolation,
        LanguageModel.LanguageModel
      > =>
        Option.match(compactionService, {
          onNone: () => Effect.succeed({ prompt, changed: false }),
          onSome: (compaction) =>
            Effect.gen(function* () {
              const history = yield* Ref.get(chat.history)
              const path = yield* syncSession(turn, history)
              const usage = yield* compactionUsage(turn, history, prompt)
              const historyRecalled = recalledMessages(history)
              const promptRecalled = recalledMessages(prompt)
              const detachedHistory = yield* detachPrompt(history).pipe(
                Effect.mapError((error) => AgentError.make({ message: error.message, turn, cause: error })),
              )
              const detachedPrompt = yield* detachPrompt(prompt).pipe(
                Effect.mapError((error) => AgentError.make({ message: error.message, turn, cause: error })),
              )
              const originalHistory = yield* detachPrompt(detachedHistory).pipe(
                Effect.mapError((error) => AgentError.make({ message: error.message, turn, cause: error })),
              )
              const originalPrompt = yield* detachPrompt(detachedPrompt).pipe(
                Effect.mapError((error) => AgentError.make({ message: error.message, turn, cause: error })),
              )
              const detachedPath = yield* Effect.forEach(path, detachEntry).pipe(
                Effect.mapError((error) => AgentError.make({ message: error.message, turn, cause: error })),
              )
              const compacted = yield* compaction
                .maybeCompact({
                  agentName: agent.name,
                  sessionId,
                  turn,
                  history: detachedHistory,
                  prompt: detachedPrompt,
                  path: detachedPath,
                  usage,
                  overflow,
                  ...(options.toolOutputMaxBytes === undefined
                    ? {}
                    : { toolOutputMaxBytes: options.toolOutputMaxBytes }),
                })
                .pipe(Effect.mapError((error) => compactionError(turn, error)))
              if (Option.isNone(compacted)) return { prompt, changed: false }
              const changed =
                !Equal.equals(originalHistory.content, compacted.value.history.content) ||
                !Equal.equals(originalPrompt.content, compacted.value.prompt.content)
              if (!changed) return { prompt, changed: false }
              const allowed = [...historyRecalled, ...promptRecalled]
              const required = Option.isSome(activeSession) ? promptRecalled : allowed
              if (
                !preservesRecalledMessages(
                  allowed,
                  required,
                  Prompt.concat(compacted.value.history, compacted.value.prompt),
                )
              ) {
                return yield* MiddlewareViolation.make({
                  turn,
                  detail: "Compaction must preserve recalled-memory message lineage outside the lossless Session path",
                })
              }
              yield* validateCompactionProjection(turn, compacted.value)
              yield* applyCompactionResult(turn, compacted.value, path.at(-1)?.id ?? null)
              return { prompt: compacted.value.prompt, changed: true }
            }),
        })

      const boundedSuccessResult = (call: AnyToolCall, outcome: Success): Effect.Effect<PendingToolResult> =>
        options.toolOutputMaxBytes === undefined
          ? Effect.succeed(successResult(call, outcome))
          : bound(outcome, { toolCallId: call.id, maxBytes: options.toolOutputMaxBytes }).pipe(
              Effect.map((bounded) => successResult(call, bounded)),
            )

      const outcomeEvents = (
        turn: number,
        toolCallBatch: Request["toolCallBatch"],
        toolCallIndex: number,
        call: AnyToolCall,
        outcome: Outcome,
        droppedProgress: number,
        registry: Registry,
      ): Effect.Effect<Stream.Stream<Event, RunError>, AgentError> => {
        const metadata = droppedProgress === 0 ? {} : { metadata: { toolProgress: { dropped: droppedProgress } } }
        switch (outcome._tag) {
          case "Success":
            return (
              isSkillActivationCall(call, registry)
                ? Effect.succeed(successResult(call, outcome))
                : boundedSuccessResult(call, outcome)
            ).pipe(
              Effect.map((result) =>
                Stream.fromIterable<Event>([{ _tag: "ToolExecutionCompleted", turn, call, result, ...metadata }]),
              ),
            )
          case "DomainFailure": {
            const result = domainFailureResult(call, outcome)
            return Effect.succeed(
              Stream.fromIterable<Event>([{ _tag: "ToolExecutionCompleted", turn, call, result, ...metadata }]),
            )
          }
          case "Suspend":
            return Effect.succeed(failSuspended(call, toolCallBatch, toolCallIndex, outcome.token, "tool-wait"))
        }
      }

      const defaultExecute = (
        request: Request,
        registry: Registry,
      ): Effect.Effect<
        Outcome,
        FrameworkFailure,
        Tool.HandlersFor<Tools> | Tool.HandlerServices<Tools[keyof Tools]>
      > => {
        const registered = get(registry, request.call.name)
        if (registered?.dispatch === "Static") {
          return executeToolkit(staticToolkit, request)
        }
        return registered === undefined
          ? Effect.fail(
              FrameworkFailure.make({
                stage: "missing-handler",
                tool: request.call.name,
                message: `Tool ${request.call.name} is not registered`,
              }),
            )
          : Effect.fail(
              FrameworkFailure.make({
                stage: "missing-handler",
                tool: request.call.name,
                message: `Activated skill tool ${request.call.name} requires ToolExecutor`,
              }),
            )
      }

      const makeProgressQueue = (): Effect.Effect<Queue.Queue<ToolProgress, Cause.Done | ProgressOverflowError>> => {
        switch (progressPolicy._tag) {
          case "Backpressure":
            return Queue.bounded(progressPolicy.capacity)
          case "Dropping":
          case "Fail":
            return Queue.dropping(progressPolicy.capacity)
          case "Sliding":
            return Queue.sliding(progressPolicy.capacity)
        }
      }

      const executeApproved = (
        turn: number,
        call: AnyToolCall,
        request: Request,
        registry: Registry,
      ): Stream.Stream<Event, RunError, StaticToolServices<Tools>> =>
        Stream.concat(
          Stream.fromIterable<Event>([{ _tag: "ToolExecutionStarted", turn, call }]),
          Stream.unwrap(
            Effect.gen(function* () {
              const progressQueue = yield* Effect.acquireRelease(makeProgressQueue(), Queue.shutdown)
              const droppedProgress = yield* Ref.make(0)
              const emitSemaphore = yield* Semaphore.make(1)
              const signal = yield* Effect.abortSignal
              const context = ToolContext.of({
                signal,
                sessionId,
                emit: (progress) => {
                  const event: ToolProgress = {
                    _tag: "ToolProgress",
                    turn,
                    toolCallId: progress.toolCallId,
                    ...(progress.message === undefined ? {} : { message: progress.message }),
                    ...(progress.data === undefined ? {} : { data: progress.data }),
                  }
                  return emitSemaphore.withPermit(
                    Effect.gen(function* () {
                      if (progressPolicy._tag === "Sliding") {
                        const dropped = yield* Effect.sync(() => {
                          const full = Queue.isFullUnsafe(progressQueue)
                          Queue.offerUnsafe(progressQueue, event)
                          return full
                        })
                        if (dropped) yield* Ref.update(droppedProgress, (count) => count + 1)
                        return
                      }
                      const offered = yield* Queue.offer(progressQueue, event)
                      if (progressPolicy._tag === "Dropping" && !offered) {
                        yield* Ref.update(droppedProgress, (count) => count + 1)
                      } else if (progressPolicy._tag === "Fail" && !offered) {
                        yield* Queue.fail(
                          progressQueue,
                          ProgressOverflowError.make({ turn, toolCallId: call.id, capacity: progressPolicy.capacity }),
                        )
                      }
                    }),
                  )
                },
              })
              const execution: Effect.Effect<
                Outcome,
                AgentError | ToolNameCollision | FrameworkFailure,
                ToolContext | Tool.HandlersFor<Tools> | Tool.HandlerServices<Tools[keyof Tools]>
              > = isSkillActivationCall(call, registry)
                ? activateSkillOutcome(turn, call)
                : Option.isNone(executor)
                  ? defaultExecute(request, registry)
                  : executor.value
                      .execute(request)
                      .pipe(
                        Effect.mapError((error) =>
                          Schema.is(RemoteRetryError)(error)
                            ? AgentError.make({ message: error.message, turn, cause: error })
                            : error,
                        ),
                      )
              const fiber = yield* execution.pipe(
                Effect.provideService(ToolContext, context),
                Effect.ensuring(Queue.end(progressQueue).pipe(Effect.asVoid)),
                Effect.forkScoped({ startImmediately: true }),
              )
              return Stream.concat(
                Stream.fromQueue(progressQueue),
                Stream.fromEffect(Fiber.join(fiber)).pipe(
                  Stream.flatMap((outcome) =>
                    Stream.unwrap(
                      Ref.get(droppedProgress).pipe(
                        Effect.flatMap((dropped) =>
                          outcomeEvents(
                            turn,
                            request.toolCallBatch,
                            request.toolCallIndex,
                            call,
                            outcome,
                            dropped,
                            registry,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              )
            }),
          ),
        )

      const activateSkillOutcome = (
        turn: number,
        call: AnyToolCall,
      ): Effect.Effect<Outcome, AgentError | ToolNameCollision | FrameworkFailure> =>
        Effect.gen(function* () {
          if (skillRuntime === undefined) {
            return yield* FrameworkFailure.make({
              stage: "missing-handler",
              tool: call.name,
              message: "SkillSource is not available",
            })
          }
          const params = Schema.decodeUnknownOption(activateSkillParameters)(call.params)
          if (Option.isNone(params)) {
            return yield* FrameworkFailure.make({
              stage: "decode-input",
              tool: call.name,
              message: "Skill activation requires a name",
            })
          }
          const skill = yield* skillRuntime.source.get(params.value.name)
          if (skill === undefined) {
            const failure = { reason: "not-found" as const, message: `Skill not found: ${params.value.name}` }
            return { _tag: "DomainFailure", failure, encodedFailure: failure } satisfies DomainFailure
          }
          if (skill.frontmatter.disableModelInvocation === true) {
            const failure = {
              reason: "not-model-invocable" as const,
              message: `Skill is not model-invocable: ${params.value.name}`,
            }
            return { _tag: "DomainFailure", failure, encodedFailure: failure } satisfies DomainFailure
          }
          const current = yield* Ref.get(toolState)
          let body = current.activatedSkillBodies.get(skill.frontmatter.name)
          if (body === undefined) {
            const registry = yield* assemble([
              ...current.registry.entries,
              ...skill.tools.map(
                (tool): Candidate => ({
                  tool,
                  origin: { _tag: "Skill", skill: skill.frontmatter.name },
                  dispatch: "Skill",
                }),
              ),
            ])
            body = yield* skill.body
            const activatedSkillBodies = new Map(current.activatedSkillBodies)
            activatedSkillBodies.set(skill.frontmatter.name, body)
            yield* Ref.set(toolState, { registry, activatedSkillBodies })
          }
          const output = {
            name: skill.frontmatter.name,
            body,
            allowedTools: [...(skill.frontmatter.allowedTools ?? [])],
          }
          return { _tag: "Success", result: output, encodedResult: output } satisfies Success
        }).pipe(
          Effect.mapError((error) =>
            isToolNameCollision(error) || Schema.is(FrameworkFailure)(error) ? error : skillError(turn, error),
          ),
        )

      const authorizationError = (turn: number, error: AuthorizationError): AgentError =>
        AgentError.make({ message: error.message, turn, cause: error })

      const toolCallEvents = (
        turn: number,
        toolCallBatch: Request["toolCallBatch"],
        toolCallIndex: number,
        call: AnyToolCall,
        messages: ReadonlyArray<Prompt.Message>,
        registry: Registry,
        authorizationStage?: "permission" | "approval",
        authorizationToken?: string,
      ): Stream.Stream<Event, RunError, StaticToolServices<Tools> | R> => {
        const request: Request = { call, toolCallBatch, turn, toolCallIndex, agentName: agent.name, sessionId }
        const candidate = get(registry, call.name)
        if (candidate === undefined)
          return Stream.fail(
            FrameworkFailure.make({
              stage: "authorization",
              tool: call.name,
              message: `Tool ${call.name} is not active for turn ${turn}`,
            }),
          )
        const activeTools = registry.entries.map((entry) => entry.tool.name)
        return Stream.unwrap(
          Effect.gen(function* () {
            const activatedSkills = [...(yield* Ref.get(toolState)).activatedSkillBodies.keys()]
            const approvalEvents = yield* Queue.bounded<Event, Cause.Done>(1)
            const fiber = yield* authorizer
              .authorize({
                call,
                tool: candidate.tool,
                active: true,
                activeTools,
                activatedSkills,
                ...(authorizationStage === undefined ? {} : { authorizationStage }),
                ...(authorizationToken === undefined ? {} : { authorizationToken }),
                messages,
                execution: request,
                onApprovalRequired: Queue.offer(approvalEvents, { _tag: "ApprovalRequested", turn, call }).pipe(
                  Effect.asVoid,
                ),
              })
              .pipe(
                Effect.mapError((error) => authorizationError(turn, error)),
                Effect.ensuring(Queue.end(approvalEvents).pipe(Effect.asVoid)),
                Effect.forkScoped({ startImmediately: true }),
              )
            return Stream.concat(
              Stream.fromQueue(approvalEvents),
              Stream.fromEffect(Fiber.join(fiber)).pipe(
                Stream.flatMap((decision) => {
                  switch (decision._tag) {
                    case "Execute":
                      return executeApproved(turn, call, request, registry)
                    case "Deny":
                      return Stream.fail(
                        FrameworkFailure.make({
                          stage: "authorization",
                          tool: call.name,
                          message: decision.error.message,
                        }),
                      )
                    case "Suspend":
                      return Stream.fail(
                        AgentSuspended.make({
                          token: decision.suspension.token,
                          reason: "approval",
                          authorization_stage: decision.suspension.authorization_stage ?? "approval",
                          tool_call_index: toolCallIndex,
                          tool_call_id: call.id,
                          tool_name: call.name,
                          tool_params: call.params,
                          tool_call_batch: toolCallBatch.calls,
                          active_tools: activeTools,
                          activated_skills: activatedSkills,
                        }),
                      )
                  }
                }),
              ),
            )
          }),
        )
      }

      const captureFinishPart = (part: Response.FinishPart): Effect.Effect<void> =>
        Effect.gen(function* () {
          const span = yield* Effect.currentSpan
          state.finish = {
            usage: state.finish === undefined ? part.usage : addUsage(state.finish.usage, part.usage),
            reason: part.reason,
          }
          state.usage = state.usage === undefined ? part.usage : addUsage(state.usage, part.usage)
          Telemetry.addGenAIAnnotations(span, {
            operation: { name: "chat" },
            usage: {
              inputTokens: part.usage.inputTokens.total,
              outputTokens: part.usage.outputTokens.total,
            },
            response: { finishReasons: [part.reason] },
          })
        }).pipe(Effect.orDie)

      const captureStructuredUsage = (content: ReadonlyArray<Response.Part<any>>): Effect.Effect<void> =>
        Effect.gen(function* () {
          const span = yield* Effect.currentSpan
          for (const part of content) {
            if (part.type === "finish") {
              state.usage = state.usage === undefined ? part.usage : addUsage(state.usage, part.usage)
              Telemetry.addGenAIAnnotations(span, {
                operation: { name: "chat" },
                usage: {
                  inputTokens: part.usage.inputTokens.total,
                  outputTokens: part.usage.outputTokens.total,
                },
                response: { finishReasons: [part.reason] },
              })
            }
          }
        }).pipe(Effect.orDie)

      const withModelResilience = <A, E, R2>(effect: Effect.Effect<A, E, R2>) =>
        Option.match(resilienceService, {
          onNone: () => effect,
          onSome: (resilience) =>
            Effect.flatMap(LanguageModel.LanguageModel, (model) =>
              effect.pipe(
                Effect.provideService(
                  LanguageModel.LanguageModel,
                  apply(model, {
                    ...resilience,
                    classify: (error) =>
                      classifyModelFailure(model, error) === "context-overflow"
                        ? "terminal"
                        : resilience.classify(error),
                  }),
                ),
              ),
            ),
        })

      const withAgentModel = <A, E, R2>(
        effect: Effect.Effect<A, E, R2>,
      ): Effect.Effect<A, E | LanguageModelNotRegistered, R2> =>
        agentModelRegistry === undefined || agentModel === undefined
          ? effect
          : agentModelRegistry.operate(agentModel, effect)

      function provideAgentModel<A, E, R2>(stream: Stream.Stream<A, E, R2>): Stream.Stream<A, E, R2 | Service>
      function provideAgentModel<A, E, R2>(
        stream: Stream.Stream<A, E, R2>,
      ): Stream.Stream<A, E | AgentError, R2 | Service> {
        return agentModelRegistry === undefined || agentModel === undefined
          ? stream
          : agentModelRegistry
              .stream(agentModel, stream)
              .pipe(
                Stream.catchTag("LanguageModelNotRegistered", (error) =>
                  Stream.fail(AgentError.make({ message: errorMessage(error), turn: state.turn, cause: error })),
                ),
              )
      }

      const partEvents = (
        turn: number,
        part: Response.StreamPart<Record<string, Tool.Any>>,
      ): Stream.Stream<Event, RunError> => {
        if (part.type === "error") {
          if (isToolNameCollision(part.error)) return Stream.fail(part.error)
          return Stream.fail(AgentError.make({ message: errorMessage(part.error), turn, cause: part.error }))
        }
        const modelPart = Stream.fromIterable<Event>([{ _tag: "ModelPart", turn, part }])
        if (part.type === "text-delta") {
          state.text = `${state.text}${part.delta}`
        }
        if (part.type === "finish") {
          return modelPart.pipe(Stream.tap(() => captureFinishPart(part)))
        }
        return modelPart
      }

      const recordPending = (event: Event): Effect.Effect<void> =>
        Effect.sync(() => {
          if (event._tag === "ToolExecutionCompleted") state.pending.push(event.result)
        })

      const transformPart = (
        turn: number,
        part: Response.StreamPart<any>,
      ): Effect.Effect<Option.Option<Response.StreamPart<any>>, RunError> =>
        applyPartChain(chain, part, { agentName: agent.name, turn }).pipe(
          Effect.flatMap(
            Option.match({
              onSome: (transformed) => Effect.succeed(Option.some(transformed)),
              onNone: () =>
                part.type === "tool-call"
                  ? Effect.fail(
                      MiddlewareViolation.make({
                        turn,
                        detail: "ModelMiddleware dropped a tool-call part",
                      }),
                    )
                  : Effect.succeed(Option.none()),
            }),
          ),
        )

      const validateToolCallId = (
        idState: Ref.Ref<ToolCallIdState>,
        part: Response.StreamPart<any>,
      ): Effect.Effect<void, DuplicateToolCallId> => {
        if (part.type !== "tool-call") return Effect.void
        return Ref.modify(idState, (current) => {
          const existingFirstIndex = HashMap.get(current.firstIndexes, part.id)
          const duplicate = Option.map(existingFirstIndex, (index) =>
            DuplicateToolCallId.make({ id: part.id, firstIndex: index, duplicateIndex: current.nextIndex }),
          )
          return [
            duplicate,
            {
              nextIndex: current.nextIndex + 1,
              firstIndexes: Option.isSome(existingFirstIndex)
                ? current.firstIndexes
                : HashMap.set(current.firstIndexes, part.id, current.nextIndex),
            },
          ]
        }).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.void,
              onSome: Effect.fail,
            }),
          ),
        )
      }

      const modelTurn = (turn: number, prompt: Prompt.RawInput, registry: Registry, overrides?: TurnOverrides) => {
        const activeRegistry = overrides?.activeTools === undefined ? registry : select(registry, overrides.activeTools)
        const attempt = (
          activePrompt: Prompt.Prompt,
          retryOverflow: boolean,
          compactOverflow = false,
          overflowCause?: Cause.Cause<RunError>,
        ): Stream.Stream<
          {
            readonly part: Response.StreamPart<any>
            readonly messages: ReadonlyArray<Prompt.Message>
            readonly accept: Effect.Effect<void, DuplicateToolCallId>
          },
          RunError,
          LanguageModel.LanguageModel
        > => {
          let emitted = false
          let classifyFailure = classifyOtherFailure
          const transformedParts = new Array<Response.StreamPart<any>>()
          let preparedState: { readonly history: Prompt.Prompt; readonly preparedPrompt: Prompt.Prompt } | undefined
          const singleFailure = (cause: Cause.Cause<unknown>) => {
            const reason = cause.reasons.length === 1 ? cause.reasons[0] : undefined
            return reason !== undefined && Cause.isFailReason(reason) ? Option.some(reason.error) : Option.none()
          }
          const retryableOverflow = (cause: Cause.Cause<unknown>, hasEmitted: boolean): boolean => {
            const failure = singleFailure(cause)
            return (
              retryOverflow &&
              !hasEmitted &&
              Option.isSome(failure) &&
              classifyFailure(failure.value) === "context-overflow" &&
              Option.isSome(compactionService)
            )
          }
          return Stream.fromChannel(
            Channel.acquireUseRelease(
              Ref.make<ToolCallIdState>({
                nextIndex: 0,
                firstIndexes: HashMap.empty(),
              }),
              (toolCallIds) =>
                Stream.unwrap(
                  Effect.gen(function* () {
                    const activeModel = yield* LanguageModel.LanguageModel
                    classifyFailure = (error) => classifyModelFailure(activeModel, error)
                    const prepared = yield* preparePrompt(turn, activePrompt, compactOverflow)
                    if (compactOverflow && !prepared.changed && overflowCause !== undefined) {
                      return yield* Effect.failCause(overflowCause)
                    }
                    const preparedPrompt = prepared.prompt
                    const history = yield* Ref.get(chat.history)
                    preparedState = { history, preparedPrompt }
                    const responsePrompt = Prompt.concat(history, preparedPrompt)
                    const messages = responsePrompt.content
                    const rawParts = LanguageModel.streamText({
                      prompt: responsePrompt,
                      toolkit: activeRegistry.toolkit,
                      disableToolCallResolution: true,
                    }).pipe(
                      Stream.tap(() =>
                        Effect.sync(() => {
                          emitted = true
                        }),
                      ),
                      Stream.catchCause((cause) => {
                        if (Cause.hasInterrupts(cause) || Cause.hasDies(cause)) return Stream.failCause(cause)
                        if (retryableOverflow(cause, emitted)) return Stream.failCause(cause)
                        const error = singleFailure(cause)
                        if (Option.isNone(error)) return Stream.failCause(cause)
                        return Stream.make(Response.makePart("error", { error: error.value }))
                      }),
                    )
                    return rawParts.pipe(
                      Stream.mapEffect((part) => transformPart(turn, part)),
                      Stream.flatMap(Option.match({ onNone: () => Stream.empty, onSome: Stream.make })),
                      Stream.map((part) => ({
                        part,
                        messages,
                        accept: validateToolCallId(toolCallIds, part).pipe(
                          Effect.andThen(
                            Effect.sync(() => {
                              transformedParts.push(part)
                            }),
                          ),
                        ),
                      })),
                    )
                  }),
                ).pipe(Stream.toChannel),
              (_, exit) =>
                preparedState === undefined || (Exit.isFailure(exit) && retryableOverflow(exit.cause, emitted))
                  ? Effect.void
                  : Ref.set(
                      chat.history,
                      Prompt.concat(
                        Prompt.concat(preparedState.history, preparedState.preparedPrompt),
                        Prompt.fromResponseParts(transformedParts),
                      ),
                    ).pipe(
                      Effect.andThen(persisted === undefined ? Effect.void : persisted.save),
                      Effect.orDie,
                      Effect.asVoid,
                    ),
            ),
          ).pipe(
            Stream.catchCause((cause) => {
              if (Cause.hasInterrupts(cause) || Cause.hasDies(cause)) return Stream.failCause(cause)
              if (retryableOverflow(cause, emitted)) {
                return attempt(preparedState?.preparedPrompt ?? activePrompt, false, true, cause)
              }
              return Stream.failCause(cause)
            }),
            Stream.catchCause((cause) => {
              const failure = singleFailure(cause)
              return Option.isSome(failure) && AiError.isAiError(failure.value)
                ? Stream.fail(AgentError.make({ message: errorMessage(failure.value), turn, cause: failure.value }))
                : Stream.failCause(cause)
            }),
          )
        }
        const parts = Stream.unwrap(
          applyPromptChain(chain, Prompt.make(prompt), { agentName: agent.name, turn }).pipe(
            Effect.map((transformedPrompt) => {
              let nextToolCallIndex = 0
              const calls = new Array<AnyToolCall>()
              const executions = new Array<{
                readonly call: AnyToolCall
                readonly messages: ReadonlyArray<Prompt.Message>
                readonly toolCallIndex: number
              }>()
              const toolCallBatch: Request["toolCallBatch"] = { calls }
              const accepted = attempt(transformedPrompt, true).pipe(
                Stream.mapEffect(({ accept, part, messages }) => accept.pipe(Effect.as({ part, messages }))),
                Stream.map(({ part, messages }) => {
                  const toolCallIndex = nextToolCallIndex
                  if (part.type === "tool-call" && part.providerExecuted !== true) {
                    const call = part as AnyToolCall
                    nextToolCallIndex += 1
                    calls.push(call)
                    executions.push({ call, messages, toolCallIndex })
                  }
                  return { part, messages, toolCallIndex }
                }),
                Stream.flatMap(({ part }) => partEvents(turn, part)),
              )
              return Stream.concat(
                accepted,
                Stream.suspend(() => {
                  Object.freeze(calls)
                  Object.freeze(toolCallBatch)
                  const concurrency = agent.toolExecution?.concurrency ?? 1
                  const executionStreams = Stream.fromIterable(executions)
                  return concurrency === 1
                    ? executionStreams.pipe(
                        Stream.flatMap(({ call, messages, toolCallIndex }) =>
                          toolCallEvents(turn, toolCallBatch, toolCallIndex, call, messages, activeRegistry),
                        ),
                        Stream.tap(recordPending),
                      )
                    : executionStreams.pipe(
                        Stream.mapEffect(
                          ({ call, messages, toolCallIndex }) =>
                            Stream.runCollect(
                              toolCallEvents(turn, toolCallBatch, toolCallIndex, call, messages, activeRegistry),
                            ),
                          { concurrency },
                        ),
                        Stream.flatMap(Stream.fromIterable),
                        Stream.tap(recordPending),
                      )
                }),
              )
            }),
          ),
        )
        const resilientParts = Option.match(resilienceService, {
          onNone: () => parts,
          onSome: (resilience) =>
            Stream.unwrap(
              LanguageModel.LanguageModel.pipe(
                Effect.map((model) =>
                  parts.pipe(
                    Stream.provideService(
                      LanguageModel.LanguageModel,
                      apply(model, {
                        ...resilience,
                        classify: (error) =>
                          classifyModelFailure(model, error) === "context-overflow"
                            ? "terminal"
                            : resilience.classify(error),
                      }),
                    ),
                  ),
                ),
              ),
            ),
        })
        return overrides?.model === undefined
          ? provideAgentModel(resilientParts)
          : resilientParts.pipe(Stream.provide(overrides.model))
      }

      const turnCompletedEvent = (turn: number, transcript: Prompt.Prompt): TurnCompleted => ({
        _tag: "TurnCompleted",
        turn,
        transcript,
        ...(state.finish === undefined ? {} : { usage: state.finish.usage, finishReason: state.finish.reason }),
      })

      const terminalCompletedEvent = (turn: number, transcript: Prompt.Prompt): Completed => ({
        _tag: "Completed",
        turns: turn + 1,
        text: state.text,
        transcript,
        ...(state.usage === undefined ? {} : { usage: state.usage }),
      })

      const structuredFinalEvents = (
        structuredTurn: number,
        config: StructuredRunConfig<StructuredOutputSchema>,
      ): Stream.Stream<Event, RunError, LanguageModel.LanguageModel | StructuredOutputSchema["DecodingServices"]> =>
        Stream.fromEffect(
          Effect.gen(function* () {
            const transformedPrompt = yield* applyPromptChain(chain, Prompt.make(config.objectPrompt), {
              agentName: agent.name,
              turn: structuredTurn,
            })
            const history = yield* Ref.get(chat.history)
            const response = yield* LanguageModel.generateObject({
              prompt: Prompt.concat(history, transformedPrompt),
              schema: config.schema,
              objectName: config.objectName,
              toolChoice: "none",
            }).pipe(
              withModelResilience,
              withAgentModel,
              Effect.catchCause(
                (cause): Effect.Effect<never, AgentError | AiError.AiError | LanguageModelNotRegistered> => {
                  const reason = cause.reasons.length === 1 ? cause.reasons[0] : undefined
                  return reason !== undefined && Cause.isFailReason(reason)
                    ? Effect.fail(
                        AgentError.make({
                          message: errorMessage(reason.error),
                          turn: structuredTurn,
                          cause: reason.error,
                        }),
                      )
                    : Effect.failCause(cause)
                },
              ),
            )
            yield* captureStructuredUsage(response.content)
            const transcript = Prompt.concat(
              Prompt.concat(history, transformedPrompt),
              Prompt.fromResponseParts(response.content),
            )
            const path = yield* syncSession(structuredTurn, history)
            yield* applyCompactionResult(
              structuredTurn,
              { _tag: "Microcompact", history: transcript, prompt: Prompt.empty },
              path.at(-1)?.id ?? null,
            )
            if (Option.isNone(activeSession)) yield* savePersisted(structuredTurn)
            const structuredOutput: StructuredOutput = {
              _tag: "StructuredOutput",
              turn: structuredTurn,
              value: response.value,
              content: response.content as ReadonlyArray<Response.Part<Record<string, Tool.Any>>>,
            }
            return [structuredOutput, terminalCompletedEvent(structuredTurn, transcript)]
          }),
        ).pipe(Stream.flatMap((events) => Stream.fromIterable<Event>(events)))

      const promptFromSteeringMessages = (messages: ReadonlyArray<Message>): Prompt.Prompt =>
        messages.reduce<Prompt.Prompt>((prompt, message) => Prompt.concat(prompt, message.prompt), Prompt.empty)

      const takeSteering = (): Effect.Effect<ReadonlyArray<Message>> =>
        Option.match(steeringService, {
          onNone: () => Effect.succeed([]),
          onSome: (service) => service.takeSteering,
        })

      const takeFollowUp = (): Effect.Effect<ReadonlyArray<Message>> =>
        Option.match(steeringService, {
          onNone: () => Effect.succeed([]),
          onSome: (service) => service.takeFollowUp,
        })

      const afterTurn = (
        turn: number,
      ): Effect.Effect<
        {
          readonly events: Stream.Stream<
            Event,
            RunError,
            LanguageModel.LanguageModel | StructuredOutputSchema["DecodingServices"]
          >
          readonly next?: {
            readonly prompt: Prompt.RawInput
            readonly overrides?: TurnOverrides
          }
          readonly structuredTurn?: number
        },
        AgentError | TurnPolicyError,
        R
      > =>
        Effect.gen(function* () {
          const pending = state.pending
          const transcript = yield* checkpointPending(turn, pending)
          const path = yield* syncSession(turn, transcript)
          yield* rememberTurn(turn, transcript, pending.length === 0, path)
          const completed: Event = turnCompletedEvent(turn, transcript)
          if (pending.length === 0) {
            const followUp = yield* takeFollowUp()
            if (followUp.length > 0) {
              return {
                events: Stream.fromIterable<Event>([completed, steeringDrainedEvent(turn, "followUp", followUp)]),
                next: { prompt: promptFromSteeringMessages(followUp) },
              }
            }
            if (structured !== undefined) {
              return {
                events: Stream.fromIterable<Event>([completed]),
                structuredTurn: turn + 1,
              }
            }
            yield* savePersisted(turn)
            return {
              events: Stream.fromIterable<Event>([completed, terminalCompletedEvent(turn, transcript)]),
            }
          }
          const evaluated = yield* agent.policy.decide({
            turn: turn + 1,
            history: transcript,
            pendingToolResults: pending,
          })
          if (!isTurnPolicyDecision(evaluated)) {
            return yield* TurnPolicyError.make({
              message:
                "TurnPolicy returned an invalid decision; reasonless Stop decisions must be adapted with TurnPolicy.fromLegacy",
              cause: evaluated,
            })
          }
          const decision = evaluated
          if (decision._tag === "Stop") {
            const pendingCalls = pending.map((result) => ({
              tool_call_id: result.id,
              tool_name: result.name,
            }))
            return {
              events: Stream.concat(
                Stream.fromIterable<Event>([completed]),
                Stream.fail(
                  decision.reason._tag === "TurnLimit"
                    ? TurnLimitExceeded.make({
                        turn: turn + 1,
                        limit: decision.reason.limit,
                        pending: pendingCalls,
                      })
                    : TurnPolicyStopped.make({
                        turn: turn + 1,
                        reason: decision.reason,
                        pending: pendingCalls,
                      }),
                ),
              ),
            }
          }
          state.pending = []
          const steering = yield* takeSteering()
          const basePrompt = steering.length === 0 ? Prompt.empty : promptFromSteeringMessages(steering)
          const prompt =
            decision.overrides?.instructions === undefined
              ? basePrompt
              : withSystem(decision.overrides.instructions, basePrompt)
          return {
            events: Stream.fromIterable<Event>(
              steering.length === 0 ? [completed] : [completed, steeringDrainedEvent(turn, "steering", steering)],
            ),
            next: { prompt, ...(decision.overrides === undefined ? {} : { overrides: decision.overrides }) },
          }
        })

      const resetTurnState = (turn: number) =>
        Stream.sync(() => {
          state.turn = turn
          state.finish = undefined
        }).pipe(Stream.drain)

      const runTurn = (
        turn: number,
        prompt: Prompt.RawInput,
        overrides?: TurnOverrides,
      ): Stream.Stream<Event, RunError, LanguageModel.LanguageModel | StructuredOutputSchema["DecodingServices"]> => {
        let next:
          | {
              readonly prompt: Prompt.RawInput
              readonly overrides?: TurnOverrides
            }
          | undefined
        let structuredTurn: number | undefined
        const currentTurn = Stream.fromIterable<Event>([{ _tag: "TurnStarted", turn }]).pipe(
          Stream.concat(resetTurnState(turn)),
          Stream.concat(
            Stream.unwrap(
              Ref.get(toolState).pipe(Effect.map(({ registry }) => modelTurn(turn, prompt, registry, overrides))),
            ),
          ),
          Stream.concat(
            Stream.unwrap(
              afterTurn(turn).pipe(
                Effect.map((result) => {
                  next = result.next
                  structuredTurn = result.structuredTurn
                  return result.events
                }),
              ),
            ),
          ),
          Stream.withSpan("Baton.Agent.turn", { attributes: { "baton.turn": turn } }),
        )
        return Stream.concat(
          currentTurn,
          Stream.suspend(() => {
            if (structuredTurn !== undefined && structured !== undefined) {
              return structuredFinalEvents(structuredTurn, structured).pipe(
                Stream.withSpan("Baton.Agent.turn", { attributes: { "baton.turn": structuredTurn } }),
              )
            }
            return next === undefined ? Stream.empty : runTurn(turn + 1, next.prompt, next.overrides)
          }),
        )
      }

      const resumeStream = (
        checkpoint: SuspensionCheckpoint,
      ): Stream.Stream<Event, RunError, LanguageModel.LanguageModel | StructuredOutputSchema["DecodingServices"]> => {
        let next:
          | {
              readonly prompt: Prompt.RawInput
              readonly overrides?: TurnOverrides
            }
          | undefined
        const currentTurn = resetTurnState(0).pipe(
          Stream.concat(
            Stream.unwrap(
              Ref.get(toolState).pipe(
                Effect.map((tools) => {
                  const suspension = checkpoint.suspension
                  const registry =
                    suspension.authorization_stage === undefined && suspension.active_tools === undefined
                      ? tools.registry
                      : select(tools.registry, suspension.active_tools ?? [])
                  const calls = suspension.tool_call_batch.map((call) =>
                    Response.makePart("tool-call", {
                      id: call.id,
                      name: call.name,
                      params: call.params,
                      providerExecuted: call.providerExecuted,
                      metadata: call.metadata,
                    }),
                  )
                  const toolCallBatch: Request["toolCallBatch"] = { calls }
                  const startIndex = suspension.tool_call_index ?? 0
                  if (calls[startIndex] === undefined) {
                    return Stream.fail(
                      AgentError.make({ message: "Suspension tool call index is outside its batch", turn: 0 }),
                    )
                  }
                  const executions = Stream.fromIterable(
                    calls.slice(startIndex).map((call, offset) => ({ call, toolCallIndex: startIndex + offset })),
                  )
                  const execute = ({
                    call,
                    toolCallIndex,
                  }: {
                    readonly call: AnyToolCall
                    readonly toolCallIndex: number
                  }) =>
                    toolCallEvents(
                      0,
                      toolCallBatch,
                      toolCallIndex,
                      call,
                      checkpoint.messages,
                      registry,
                      toolCallIndex === startIndex ? suspension.authorization_stage : undefined,
                      toolCallIndex === startIndex ? suspension.token : undefined,
                    )
                  const concurrency = agent.toolExecution?.concurrency ?? 1
                  return concurrency === 1
                    ? executions.pipe(Stream.flatMap(execute), Stream.tap(recordPending))
                    : executions.pipe(
                        Stream.mapEffect((execution) => Stream.runCollect(execute(execution)), { concurrency }),
                        Stream.flatMap(Stream.fromIterable),
                        Stream.tap(recordPending),
                      )
                }),
              ),
            ),
          ),
          Stream.concat(
            Stream.unwrap(
              afterTurn(0).pipe(
                Effect.map((result) => {
                  next = result.next
                  return result.events
                }),
              ),
            ),
          ),
          Stream.withSpan("Baton.Agent.turn", { attributes: { "baton.turn": 0 } }),
        )
        return Stream.concat(
          currentTurn,
          Stream.suspend(() => (next === undefined ? Stream.empty : runTurn(1, next.prompt, next.overrides))),
        )
      }

      const baseInitialPrompt =
        seedSystem === undefined ? Prompt.make(options.prompt) : withSystem(seedSystem, Prompt.make(options.prompt))
      const initialPrompt =
        options.resume === undefined ? yield* recallInitialPrompt(baseInitialPrompt) : baseInitialPrompt
      const runStream = validatedResume === undefined ? runTurn(0, initialPrompt) : resumeStream(validatedResume)
      return runStream.pipe(
        Stream.catchCause((cause) => {
          const reason = cause.reasons.length === 1 ? cause.reasons[0] : undefined
          if (reason !== undefined && Cause.isFailReason(reason) && Schema.is(DuplicateToolCallId)(reason.error)) {
            return Stream.unwrap(
              checkpointPending(state.turn, state.pending).pipe(Effect.map(() => Stream.failCause<RunError>(cause))),
            )
          }
          if (reason !== undefined && Cause.isFailReason(reason) && Schema.is(AgentSuspended)(reason.error)) {
            const suspension = reason.error
            return Stream.unwrap(
              Effect.gen(function* () {
                const checkpoint = yield* checkpointSuspended(state.turn, state.pending, suspension)
                yield* syncSession(state.turn, checkpoint)
                return Stream.concat(
                  Stream.fromIterable<Event>([turnCompletedEvent(state.turn, checkpoint)]),
                  Stream.failCause<RunError>(cause),
                )
              }),
            )
          }
          return Stream.failCause<RunError>(cause)
        }),
      )
    }),
  ).pipe(Stream.withSpan("Baton.Agent.run", { attributes: { "baton.agent.name": agent.name } }), (run) =>
    agent[ModelLayerTypeId] === undefined ? run : run.pipe(Stream.provide(agent[ModelLayerTypeId])),
  )

type Requires<R, Required> = Required extends R ? unknown : never

/** @experimental Provide the default language model for an agent. */
export const provideModel: {
  <RM>(
    layer: Layer.Layer<LanguageModel.LanguageModel, never, RM>,
  ): <Tools extends Record<string, Tool.Any>, R>(
    agent: Agent<Tools, R> & Requires<R, LanguageModel.LanguageModel>,
  ) => Agent<Tools, Exclude<R, LanguageModel.LanguageModel> | RM>
  <Tools extends Record<string, Tool.Any>, R, RM>(
    agent: Agent<Tools, R> & Requires<R, LanguageModel.LanguageModel>,
    layer: Layer.Layer<LanguageModel.LanguageModel, never, RM>,
  ): Agent<Tools, Exclude<R, LanguageModel.LanguageModel> | RM>
} = dual(
  2,
  <Tools extends Record<string, Tool.Any>, R, RM>(
    agent: Agent<Tools, R> & Requires<R, LanguageModel.LanguageModel>,
    layer: Layer.Layer<LanguageModel.LanguageModel, never, RM>,
  ): Agent<Tools, Exclude<R, LanguageModel.LanguageModel> | RM> => ({
    ...agent,
    policy: agent.policy as TurnPolicy<Exclude<R, LanguageModel.LanguageModel> | RM>,
    ...(agent.authorization === undefined
      ? {}
      : {
          authorization: agent.authorization as ToolAuthorizer<Exclude<R, LanguageModel.LanguageModel> | RM>,
        }),
    [AgentTypeId]: {
      tools: (value: Tools) => value,
      requirements: (value: Exclude<R, LanguageModel.LanguageModel> | RM) => value,
    },
    [ModelLayerTypeId]: layer,
  }),
)

/** @experimental The text primitive; everything else derives from it. */
export const stream: {
  <O extends RunOptions>(
    options: O,
  ): <Tools extends Record<string, Tool.Any>, R>(
    agent: Agent<Tools, R>,
  ) => Stream.Stream<Event, RunError, R | OperationRequirements<O>>
  <Tools extends Record<string, Tool.Any>, R, O extends RunOptions>(
    agent: Agent<Tools, R>,
    options: O,
  ): Stream.Stream<Event, RunError, R | OperationRequirements<O>>
} = dual(2, <Tools extends Record<string, Tool.Any>, R>(agent: Agent<Tools, R>, options: RunOptions) =>
  streamInternal(agent, options, undefined),
)

/** @experimental The persisted text streaming primitive. */
export const persisted: {
  <O extends PersistedRunOptions>(
    options: O,
  ): <Tools extends Record<string, Tool.Any>, R>(
    agent: Agent<Tools, R>,
  ) => Stream.Stream<Event, RunError, R | Chat.Persistence | OperationRequirements<O>>
  <Tools extends Record<string, Tool.Any>, R, O extends PersistedRunOptions>(
    agent: Agent<Tools, R>,
    options: O,
  ): Stream.Stream<Event, RunError, R | Chat.Persistence | OperationRequirements<O>>
} = dual(2, <Tools extends Record<string, Tool.Any>, R>(agent: Agent<Tools, R>, options: PersistedRunOptions) =>
  streamInternal(agent, options, undefined),
)

/** @experimental `stream` plus one terminal structured-output turn before `Completed`. */
export const streamObject: {
  <O extends ObjectRunOptions<ObjectSchema>>(
    options: O,
  ): <Tools extends Record<string, Tool.Any>, R>(
    agent: Agent<Tools, R>,
  ) => Stream.Stream<Event, RunError, R | OperationRequirements<O> | O["schema"]["DecodingServices"]>
  <Tools extends Record<string, Tool.Any>, R, O extends ObjectRunOptions<ObjectSchema>>(
    agent: Agent<Tools, R>,
    options: O,
  ): Stream.Stream<Event, RunError, R | OperationRequirements<O> | O["schema"]["DecodingServices"]>
} = dual(
  2,
  <Tools extends Record<string, Tool.Any>, R, StructuredOutputSchema extends ObjectSchema>(
    agent: Agent<Tools, R>,
    options: ObjectRunOptions<StructuredOutputSchema>,
  ): Stream.Stream<Event, RunError, R | StructuredOutputSchema["DecodingServices"]> =>
    streamInternal(agent, options, {
      schema: options.schema,
      objectName: options.objectName ?? "output",
      objectPrompt: options.objectPrompt ?? defaultObjectPrompt,
    }),
)

/** @experimental Persisted structured-output streaming. */
export const persistedObject: {
  <O extends PersistedObjectRunOptions<ObjectSchema>>(
    options: O,
  ): <Tools extends Record<string, Tool.Any>, R>(
    agent: Agent<Tools, R>,
  ) => Stream.Stream<Event, RunError, R | Chat.Persistence | OperationRequirements<O> | O["schema"]["DecodingServices"]>
  <Tools extends Record<string, Tool.Any>, R, O extends PersistedObjectRunOptions<ObjectSchema>>(
    agent: Agent<Tools, R>,
    options: O,
  ): Stream.Stream<Event, RunError, R | Chat.Persistence | OperationRequirements<O> | O["schema"]["DecodingServices"]>
} = dual(
  2,
  <Tools extends Record<string, Tool.Any>, R, S extends ObjectSchema>(
    agent: Agent<Tools, R>,
    options: PersistedObjectRunOptions<S>,
  ) =>
    streamInternal(agent, options, {
      schema: options.schema,
      objectName: options.objectName ?? "output",
      objectPrompt: options.objectPrompt ?? defaultObjectPrompt,
    }),
)

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

/** @experimental `stream` folded to its `Completed` event. */
export const generate: {
  <O extends RunOptions>(
    options: O,
  ): <Tools extends Record<string, Tool.Any>, R>(
    agent: Agent<Tools, R>,
  ) => Effect.Effect<Result, RunError, R | OperationRequirements<O>>
  <Tools extends Record<string, Tool.Any>, R, O extends RunOptions>(
    agent: Agent<Tools, R>,
    options: O,
  ): Effect.Effect<Result, RunError, R | OperationRequirements<O>>
} = dual(
  2,
  <Tools extends Record<string, Tool.Any>, R>(
    agent: Agent<Tools, R>,
    options: RunOptions,
  ): Effect.Effect<Result, RunError, R | Memory> =>
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
    ),
)

/** @experimental A persisted run folded to its completed event. */
export const generatePersisted: {
  <O extends PersistedRunOptions>(
    options: O,
  ): <Tools extends Record<string, Tool.Any>, R>(
    agent: Agent<Tools, R>,
  ) => Effect.Effect<Result, RunError, R | Chat.Persistence | OperationRequirements<O>>
  <Tools extends Record<string, Tool.Any>, R, O extends PersistedRunOptions>(
    agent: Agent<Tools, R>,
    options: O,
  ): Effect.Effect<Result, RunError, R | Chat.Persistence | OperationRequirements<O>>
} = dual(2, <Tools extends Record<string, Tool.Any>, R>(agent: Agent<Tools, R>, options: PersistedRunOptions) =>
  Stream.runLast(persisted(agent, options)).pipe(
    Effect.flatMap(
      Option.match({
        onNone: () => Effect.fail(AgentError.make({ message: "Agent run ended without a Completed event", turn: 0 })),
        onSome: (event) =>
          event._tag === "Completed"
            ? Effect.succeed({ text: event.text, turns: event.turns, transcript: event.transcript })
            : Effect.fail(AgentError.make({ message: "Agent run ended without a Completed event", turn: 0 })),
      }),
    ),
  ),
)

/** @experimental `streamObject` folded to its `StructuredOutput` and `Completed` events. */
export const generateObject: {
  <O extends ObjectRunOptions<ObjectSchema>>(
    options: O,
  ): <Tools extends Record<string, Tool.Any>, R>(
    agent: Agent<Tools, R>,
  ) => Effect.Effect<
    ObjectResult<O["schema"]["Type"]>,
    RunError,
    R | OperationRequirements<O> | O["schema"]["DecodingServices"]
  >
  <Tools extends Record<string, Tool.Any>, R, O extends ObjectRunOptions<ObjectSchema>>(
    agent: Agent<Tools, R>,
    options: O,
  ): Effect.Effect<
    ObjectResult<O["schema"]["Type"]>,
    RunError,
    R | OperationRequirements<O> | O["schema"]["DecodingServices"]
  >
} = dual(
  2,
  <Tools extends Record<string, Tool.Any>, R, StructuredOutputSchema extends ObjectSchema>(
    agent: Agent<Tools, R>,
    options: ObjectRunOptions<StructuredOutputSchema>,
  ): Effect.Effect<
    ObjectResult<StructuredOutputSchema["Type"]>,
    RunError,
    R | StructuredOutputSchema["DecodingServices"]
  > =>
    Stream.runFold(
      streamObject(agent, options),
      () => ({
        value: Option.none<StructuredOutputSchema["Type"]>(),
        completed: Option.none<Completed>(),
      }),
      (acc, event) => {
        if (event._tag === "StructuredOutput") {
          return { ...acc, value: Option.some(event.value as StructuredOutputSchema["Type"]) }
        }
        if (event._tag === "Completed") {
          return { ...acc, completed: Option.some(event) }
        }
        return acc
      },
    ).pipe(
      Effect.flatMap(({ value, completed }) =>
        Option.match(completed, {
          onNone: () =>
            Effect.fail(AgentError.make({ message: "Agent object run ended without a Completed event", turn: 0 })),
          onSome: (event) =>
            Option.match(value, {
              onNone: () =>
                Effect.fail(
                  AgentError.make({
                    message: "Agent object run ended without a StructuredOutput event",
                    turn: 0,
                  }),
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
    ),
)

/** @experimental A persisted structured-output run folded to its result. */
export const generatePersistedObject: {
  <O extends PersistedObjectRunOptions<ObjectSchema>>(
    options: O,
  ): <Tools extends Record<string, Tool.Any>, R>(
    agent: Agent<Tools, R>,
  ) => Effect.Effect<
    ObjectResult<O["schema"]["Type"]>,
    RunError,
    R | Chat.Persistence | OperationRequirements<O> | O["schema"]["DecodingServices"]
  >
  <Tools extends Record<string, Tool.Any>, R, O extends PersistedObjectRunOptions<ObjectSchema>>(
    agent: Agent<Tools, R>,
    options: O,
  ): Effect.Effect<
    ObjectResult<O["schema"]["Type"]>,
    RunError,
    R | Chat.Persistence | OperationRequirements<O> | O["schema"]["DecodingServices"]
  >
} = dual(
  2,
  <Tools extends Record<string, Tool.Any>, R, S extends ObjectSchema>(
    agent: Agent<Tools, R>,
    options: PersistedObjectRunOptions<S>,
  ) =>
    Stream.runFold(
      persistedObject(agent, options),
      () => ({ value: Option.none<S["Type"]>(), completed: Option.none<Completed>() }),
      (acc, event) =>
        event._tag === "StructuredOutput"
          ? { ...acc, value: Option.some(event.value as S["Type"]) }
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
    ),
)
