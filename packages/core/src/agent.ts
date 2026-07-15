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
import {
  Compaction,
  type CompactionError,
  DEFAULT_RESERVE_TOKENS,
  type Usage,
  isContextOverflow,
} from "./compaction.js"
import { Instructions, openEpoch } from "./instructions.js"
import { type Item, type Key, Memory, type MemoryError } from "./memory.js"
import { type Middleware, ModelMiddleware, type TurnContext } from "./model-middleware.js"
import { type LanguageModelNotRegistered, type ModelSelection, Service } from "./model-registry.js"
import { ModelResilience, apply } from "./model-resilience.js"
import { Permissions, RuleStore } from "./permissions.js"
import { type Entry, SessionStore, type SessionStoreError } from "./session.js"
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
  readonly metadata?: Readonly<Record<string, unknown>>
  readonly toolDeclarations?: ReadonlyArray<ToolDeclaration>
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
  readonly instructions?: string
  readonly toolkit?: Toolkit.Toolkit<Tools>
  readonly tools?: never
  readonly policy?: TurnPolicy<PolicyServices>
  readonly model?: ModelSelection
  readonly memory?: Key
  readonly authorization?: ToolAuthorizer<AuthorizationServices>
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

/** @experimental */
export interface MakeObjectOptions<
  Tools extends Record<string, Tool.Any> = {},
  PolicyServices = never,
  AuthorizationServices = never,
> extends MakeOptions<Tools, PolicyServices, AuthorizationServices> {
  readonly name: string
}

/** @experimental */
export interface MakeToolsObjectOptions<
  StaticTools extends ReadonlyArray<Tool.Any>,
  PolicyServices = never,
  AuthorizationServices = never,
> extends MakeToolsOptions<StaticTools, PolicyServices, AuthorizationServices> {
  readonly name: string
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
  name: string,
  options: MakeToolsOptions<StaticTools, any, any> & O,
): Agent<Toolkit.ToolsByName<StaticTools>, OptionRequirements<Toolkit.ToolsByName<StaticTools>, O>>
export function make<
  const StaticTools extends ReadonlyArray<Tool.Any>,
  const O extends MakeToolsObjectOptions<StaticTools, any, any> = MakeToolsObjectOptions<StaticTools>,
>(
  options: MakeToolsObjectOptions<StaticTools, any, any> & O,
): Agent<Toolkit.ToolsByName<StaticTools>, OptionRequirements<Toolkit.ToolsByName<StaticTools>, O>>
export function make<
  const StaticTools extends ReadonlyArray<Tool.Any>,
  const O extends MakeToolsOptions<StaticTools, any, any> = MakeToolsOptions<StaticTools>,
>(
  options: MakeToolsOptions<StaticTools, any, any> & O & { readonly name?: never },
): (name: string) => Agent<Toolkit.ToolsByName<StaticTools>, OptionRequirements<Toolkit.ToolsByName<StaticTools>, O>>
export function make<
  Tools extends Record<string, Tool.Any> = {},
  const O extends MakeOptions<Tools, any, any> = MakeOptions<Tools>,
>(name: string, options: MakeOptions<Tools, any, any> & O): Agent<Tools, OptionRequirements<Tools, O>>
export function make(name: string): Agent<{}, LanguageModel.LanguageModel>
export function make<
  Tools extends Record<string, Tool.Any> = {},
  const O extends MakeObjectOptions<Tools, any, any> = MakeObjectOptions<Tools>,
>(options: MakeObjectOptions<Tools, any, any> & O): Agent<Tools, OptionRequirements<Tools, O>>
export function make<
  Tools extends Record<string, Tool.Any> = {},
  const O extends MakeOptions<Tools, any, any> = MakeOptions<Tools>,
>(
  options: MakeOptions<Tools, any, any> & O & { readonly name?: never },
): (name: string) => Agent<Tools, OptionRequirements<Tools, O>>
export function make(): (name: string) => Agent<{}, LanguageModel.LanguageModel>
export function make<
  Tools extends Record<string, Tool.Any> = {},
  PolicyServices = never,
  AuthorizationServices = never,
>(
  nameOrOptions?:
    | string
    | MakeObjectOptions<Tools, PolicyServices, AuthorizationServices>
    | MakeOptions<Tools, PolicyServices, AuthorizationServices>
    | MakeToolsOptions<ReadonlyArray<Tool.Any>, PolicyServices, AuthorizationServices>
    | MakeToolsObjectOptions<ReadonlyArray<Tool.Any>, PolicyServices, AuthorizationServices>,
  options:
    | MakeOptions<Tools, PolicyServices, AuthorizationServices>
    | MakeToolsOptions<ReadonlyArray<Tool.Any>, PolicyServices, AuthorizationServices> = {},
): unknown {
  if (nameOrOptions === undefined || (typeof nameOrOptions !== "string" && !("name" in nameOrOptions))) {
    const curriedOptions = nameOrOptions ?? {}
    if ("tools" in curriedOptions && Array.isArray(curriedOptions.tools)) {
      const tools = curriedOptions.tools
      return (name: string) =>
        make({
          name,
          tools,
          ...(curriedOptions.instructions === undefined ? {} : { instructions: curriedOptions.instructions }),
          ...(curriedOptions.policy === undefined ? {} : { policy: curriedOptions.policy }),
          ...(curriedOptions.model === undefined ? {} : { model: curriedOptions.model }),
          ...(curriedOptions.memory === undefined ? {} : { memory: curriedOptions.memory }),
          ...(curriedOptions.authorization === undefined ? {} : { authorization: curriedOptions.authorization }),
          ...(curriedOptions.metadata === undefined ? {} : { metadata: curriedOptions.metadata }),
        })
    }
    return (name: string) =>
      make({
        name,
        ...(curriedOptions.instructions === undefined ? {} : { instructions: curriedOptions.instructions }),
        ...(curriedOptions.toolkit === undefined ? {} : { toolkit: curriedOptions.toolkit }),
        ...(curriedOptions.policy === undefined ? {} : { policy: curriedOptions.policy }),
        ...(curriedOptions.model === undefined ? {} : { model: curriedOptions.model }),
        ...(curriedOptions.memory === undefined ? {} : { memory: curriedOptions.memory }),
        ...(curriedOptions.authorization === undefined ? {} : { authorization: curriedOptions.authorization }),
        ...(curriedOptions.metadata === undefined ? {} : { metadata: curriedOptions.metadata }),
      })
  }
  const resolved = typeof nameOrOptions === "string" ? { ...options, name: nameOrOptions } : nameOrOptions
  const declaredTools: ReadonlyArray<Tool.Any> | undefined =
    "tools" in resolved && Array.isArray(resolved.tools) ? resolved.tools : undefined
  const toolkit =
    declaredTools === undefined
      ? (resolved.toolkit ?? (Toolkit.empty as unknown as Toolkit.Toolkit<Tools>))
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
    name: resolved.name,
    ...(resolved.instructions === undefined ? {} : { instructions: resolved.instructions }),
    toolkit: toolkit as unknown as Toolkit.Toolkit<Tools>,
    policy: resolved.policy ?? defaultPolicy,
    ...(resolved.model === undefined ? {} : { model: resolved.model }),
    ...(resolved.memory === undefined ? {} : { memory: resolved.memory }),
    ...(resolved.authorization === undefined ? {} : { authorization: resolved.authorization }),
    ...(resolved.metadata === undefined ? {} : { metadata: resolved.metadata }),
    toolDeclarations: (declaredTools ?? Object.values(toolkit.tools)).map((tool) => ({
      tool,
      origin: { _tag: "Static", agent: resolved.name },
    })),
  }
}

/** @experimental Re-entry after `AgentSuspended`: execute this call first. */
export interface Resume {
  readonly token?: string
  readonly call: {
    readonly id: string
    readonly name: string
    readonly params: unknown
  }
  readonly activeTools?: ReadonlyArray<string>
  readonly activatedSkills?: ReadonlyArray<string>
  readonly authorizationStage?: "permission" | "approval"
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

const chatLocks = new WeakMap<Chat.Service, Semaphore.Semaphore>()

const lockForChat = (chat: Chat.Service): Semaphore.Semaphore => {
  const existing = chatLocks.get(chat)
  if (existing !== undefined) return existing
  const created = Semaphore.makeUnsafe(1)
  chatLocks.set(chat, created)
  return created
}

const unresolvedToolCall = (
  messages: ReadonlyArray<Prompt.Message>,
): { readonly call: Prompt.ToolCallPart; readonly messages: ReadonlyArray<Prompt.Message> } | undefined => {
  const calls: Array<{ readonly call: Prompt.ToolCallPart; readonly messageIndex: number }> = []
  const results = new Set<string>()
  for (const [messageIndex, message] of messages.entries()) {
    if (typeof message.content === "string") continue
    for (const part of message.content) {
      if (part.type === "tool-call" && !part.providerExecuted) calls.push({ call: part, messageIndex })
      if (part.type === "tool-result") results.add(part.id)
    }
  }
  const unresolved = calls.filter(({ call }) => !results.has(call.id))
  const pending = unresolved[0]
  return unresolved.length === 1 && pending !== undefined
    ? { call: pending.call, messages: messages.slice(0, pending.messageIndex) }
    : undefined
}

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

const suspended = (call: AnyToolCall, token: string, reason: "tool-wait" | "approval") =>
  AgentSuspended.make({
    token,
    reason,
    tool_call_id: call.id,
    tool_name: call.name,
    tool_params: call.params,
  })

const withSystem = (instructions: string, prompt: Prompt.Prompt): Prompt.Prompt =>
  Prompt.fromMessages([Prompt.makeMessage("system", { content: instructions }), ...prompt.content])

const skillListingsInstructions = (listings: string): string =>
  `Available skills:\n${listings}\n\nCall ${activateSkillToolName} with a listed skill name to load its full body before using it.`

/** Fold the prompt through every `transformPrompt` hook in array order. */
const applyPromptChain = (
  chain: ReadonlyArray<Middleware>,
  prompt: Prompt.Prompt,
  context: TurnContext,
): Effect.Effect<Prompt.Prompt, AgentError> =>
  Effect.gen(function* () {
    let current = prompt
    for (const middleware of chain) {
      if (middleware.transformPrompt !== undefined) {
        current = yield* middleware.transformPrompt(current, context)
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

      if (options.history !== undefined && options.persistence !== undefined) {
        return yield* AgentError.make({
          message: "RunOptions.history and RunOptions.persistence are mutually exclusive",
          turn: 0,
        })
      }

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

      // Resolve `Chat.Persistence` optionally so `stream`'s `R` does not grow.
      const persistenceService = yield* Effect.serviceOption(Chat.Persistence)
      const resilienceService = yield* Effect.serviceOption(ModelResilience)
      const modelRegistryService = yield* Effect.serviceOption(Service)
      const permissionsService = yield* Effect.serviceOption(Permissions)
      const ruleStoreService = yield* Effect.serviceOption(RuleStore)
      const authorizationService = yield* Effect.serviceOption(ToolAuthorizerService)
      const steeringService = yield* Effect.serviceOption(Steering)
      const compactionService = yield* Effect.serviceOption(Compaction)
      const memoryService = yield* Effect.serviceOption(Memory)
      const sessionService = yield* Effect.serviceOption(SessionStore)
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
      const persistenceOptions = options.persistence
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
                service
                  .getOrCreate(
                    persistenceOptions.chatId,
                    persistenceOptions.timeToLive === undefined
                      ? undefined
                      : { timeToLive: persistenceOptions.timeToLive },
                  )
                  .pipe(
                    Effect.mapError((error) =>
                      AgentError.make({ message: errorMessage(error), turn: 0, cause: error }),
                    ),
                  ),
            })

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
      const chat: Chat.Service = persisted ?? (yield* freshChat)
      const chatLock = lockForChat(chat)

      const savePersisted: Effect.Effect<void, AgentError> =
        persisted === undefined
          ? Effect.void
          : persisted.save.pipe(
              Effect.mapError((error) => AgentError.make({ message: errorMessage(error), turn: 0, cause: error })),
            )

      const failSuspended = (call: AnyToolCall, token: string, reason: "tool-wait" | "approval") =>
        Stream.fail<RunError>(suspended(call, token, reason))

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

      if (options.resume !== undefined) yield* Ref.get(chat.history).pipe(Effect.flatMap(restoreActivatedSkills))

      let sessionSyncedMessages = 0
      let sessionInitialized = false

      const activeSession = Option.isSome(compactionService)
        ? sessionService
        : Option.none<typeof SessionStore.Service>()

      const sessionError = (turn: number, error: SessionStoreError): AgentError =>
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
        const memoryMessage = Prompt.makeMessage("user", { content })
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
      ): Effect.Effect<void, AgentError> =>
        memoryRuntime === undefined
          ? Effect.void
          : memoryRuntime.service
              .remember({ key: memoryRuntime.key, turn, transcript, terminal })
              .pipe(Effect.mapError((error) => memoryError(turn, error)))

      const syncSession = (turn: number, transcript: Prompt.Prompt): Effect.Effect<ReadonlyArray<Entry>, AgentError> =>
        Option.match(activeSession, {
          onNone: () => Effect.succeed([]),
          onSome: (session) =>
            Effect.gen(function* () {
              const existingPath = yield* session.path()
              if (!sessionInitialized) {
                sessionInitialized = true
                if (existingPath.length > 0) {
                  sessionSyncedMessages = transcript.content.length
                  return existingPath
                }
              }
              for (const message of transcript.content.slice(sessionSyncedMessages)) {
                yield* session.append({ _tag: "Message", message })
              }
              sessionSyncedMessages = transcript.content.length
              return yield* session.path()
            }).pipe(Effect.mapError((error) => sessionError(turn, error))),
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

      const applyCompactionResult = (turn: number, result: CompactionResult): Effect.Effect<void, AgentError> =>
        Effect.gen(function* () {
          yield* Ref.set(chat.history, result.history)
          sessionSyncedMessages = result.history.content.length
          if (result._tag === "Summarize" && Option.isSome(activeSession)) {
            yield* activeSession.value
              .append({
                _tag: "Compaction",
                summary: result.summary,
                firstKeptEntryId: result.firstKeptEntryId,
              })
              .pipe(Effect.mapError((error) => sessionError(turn, error)))
          }
        })

      const preparePrompt = (
        turn: number,
        prompt: Prompt.Prompt,
        overflow: boolean,
      ): Effect.Effect<Prompt.Prompt, AgentError, LanguageModel.LanguageModel> =>
        Option.match(compactionService, {
          onNone: () => Effect.succeed(prompt),
          onSome: (compaction) =>
            Effect.gen(function* () {
              const history = yield* Ref.get(chat.history)
              const path = yield* syncSession(turn, history)
              const usage = yield* compactionUsage(turn, history, prompt)
              const compacted = yield* compaction
                .maybeCompact({
                  agentName: agent.name,
                  sessionId,
                  turn,
                  history,
                  prompt,
                  path,
                  usage,
                  overflow,
                  ...(options.toolOutputMaxBytes === undefined
                    ? {}
                    : { toolOutputMaxBytes: options.toolOutputMaxBytes }),
                })
                .pipe(Effect.mapError((error) => compactionError(turn, error)))
              if (Option.isNone(compacted)) return prompt
              yield* applyCompactionResult(turn, compacted.value)
              return compacted.value.prompt
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
              Effect.map((result) => {
                state.pending.push(result)
                return Stream.fromIterable<Event>([{ _tag: "ToolExecutionCompleted", turn, call, result, ...metadata }])
              }),
            )
          case "DomainFailure": {
            const result = domainFailureResult(call, outcome)
            state.pending.push(result)
            return Effect.succeed(
              Stream.fromIterable<Event>([{ _tag: "ToolExecutionCompleted", turn, call, result, ...metadata }]),
            )
          }
          case "Suspend":
            return Effect.succeed(failSuspended(call, outcome.token, "tool-wait"))
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
                        Effect.flatMap((dropped) => outcomeEvents(turn, call, outcome, dropped, registry)),
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
        call: AnyToolCall,
        messages: ReadonlyArray<Prompt.Message>,
        registry: Registry,
        authorizationStage?: "permission" | "approval",
        authorizationToken?: string,
      ): Stream.Stream<Event, RunError, StaticToolServices<Tools> | R> => {
        const request: Request = { call, turn, agentName: agent.name, sessionId }
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
                          tool_call_id: call.id,
                          tool_name: call.name,
                          tool_params: call.params,
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
              effect.pipe(Effect.provideService(LanguageModel.LanguageModel, apply(model, resilience))),
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
        messages: ReadonlyArray<Prompt.Message>,
        registry: Registry,
      ): Stream.Stream<Event, RunError, StaticToolServices<Tools> | R> => {
        if (part.type === "error") {
          if (isToolNameCollision(part.error)) return Stream.fail(part.error)
          return Stream.fail(AgentError.make({ message: errorMessage(part.error), turn, cause: part.error }))
        }
        const modelPart = Stream.fromIterable<Event>([{ _tag: "ModelPart", turn, part }])
        if (part.type === "tool-call") {
          const call = part as AnyToolCall
          return call.providerExecuted === true
            ? modelPart
            : Stream.concat(modelPart, toolCallEvents(turn, call, messages, registry))
        }
        if (part.type === "text-delta") {
          state.text = `${state.text}${part.delta}`
        }
        if (part.type === "finish") {
          return modelPart.pipe(Stream.tap(() => captureFinishPart(part)))
        }
        return modelPart
      }

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
          const transformedParts = new Array<Response.StreamPart<any>>()
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
              isContextOverflow(failure.value) &&
              Option.isSome(compactionService)
            )
          }
          return Stream.fromChannel(
            Channel.acquireUseRelease(
              Effect.gen(function* () {
                yield* chatLock.take(1)
                const history = yield* Ref.get(chat.history)
                const toolCallIds = yield* Ref.make<ToolCallIdState>({
                  nextIndex: 0,
                  firstIndexes: HashMap.empty(),
                })
                return { history, toolCallIds }
              }),
              ({ history, toolCallIds }) => {
                const responsePrompt = Prompt.concat(history, activePrompt)
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
                  Stream.toChannel,
                )
              },
              ({ history }, exit) =>
                (Exit.isFailure(exit) && retryableOverflow(exit.cause, emitted)
                  ? Effect.void
                  : Ref.set(
                      chat.history,
                      Prompt.concat(Prompt.concat(history, activePrompt), Prompt.fromResponseParts(transformedParts)),
                    ).pipe(Effect.andThen(persisted === undefined ? Effect.void : persisted.save), Effect.orDie)
                ).pipe(Effect.ensuring(chatLock.release(1)), Effect.asVoid),
            ),
          ).pipe(
            Stream.catchCause((cause) => {
              if (Cause.hasInterrupts(cause) || Cause.hasDies(cause)) return Stream.failCause(cause)
              if (retryableOverflow(cause, emitted)) {
                return Stream.unwrap(
                  preparePrompt(turn, activePrompt, true).pipe(
                    Effect.map((compactedPrompt) => attempt(compactedPrompt, false)),
                  ),
                )
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
            Effect.flatMap((transformedPrompt) => preparePrompt(turn, transformedPrompt, false)),
            Effect.map((preparedPrompt) =>
              attempt(preparedPrompt, true).pipe(
                Stream.flatMap(({ accept, part, messages }) =>
                  Stream.fromEffect(accept).pipe(
                    Stream.flatMap(() => partEvents(turn, part, messages, activeRegistry)),
                  ),
                ),
              ),
            ),
          ),
        )
        const resilientParts = Option.match(resilienceService, {
          onNone: () => parts,
          onSome: (resilience) =>
            Stream.unwrap(
              LanguageModel.LanguageModel.pipe(
                Effect.map((model) =>
                  parts.pipe(Stream.provideService(LanguageModel.LanguageModel, apply(model, resilience))),
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
            const response = yield* chat
              .generateObject({
                prompt: transformedPrompt,
                schema: config.schema,
                objectName: config.objectName,
                toolChoice: "none",
              })
              .pipe(
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
            yield* savePersisted
            const transcript = yield* Ref.get(chat.history)
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
          const transcript = yield* Ref.get(chat.history)
          yield* syncSession(turn, transcript)
          const pending = state.pending
          yield* rememberTurn(turn, transcript, pending.length === 0)
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
            yield* savePersisted
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
          const toolPrompt = Prompt.fromResponseParts(pending)
          const basePrompt =
            steering.length === 0 ? toolPrompt : Prompt.concat(promptFromSteeringMessages(steering), toolPrompt)
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
        resume: Resume,
      ): Stream.Stream<Event, RunError, LanguageModel.LanguageModel | StructuredOutputSchema["DecodingServices"]> => {
        let next:
          | {
              readonly prompt: Prompt.RawInput
              readonly overrides?: TurnOverrides
            }
          | undefined
        const suppliedCall = Response.makePart("tool-call", {
          id: resume.call.id,
          name: resume.call.name,
          params: resume.call.params,
          providerExecuted: false,
        })
        const currentTurn = resetTurnState(0).pipe(
          Stream.concat(
            Stream.unwrap(
              Effect.all({ history: Ref.get(chat.history), tools: Ref.get(toolState) }).pipe(
                Effect.map(({ history, tools }) => {
                  const checkpoint =
                    resume.authorizationStage === undefined
                      ? { call: suppliedCall, messages: history.content }
                      : unresolvedToolCall(history.content)
                  if (
                    checkpoint === undefined ||
                    checkpoint.call.id !== suppliedCall.id ||
                    checkpoint.call.name !== suppliedCall.name ||
                    !Equal.equals(checkpoint.call.params, suppliedCall.params)
                  ) {
                    return Stream.fail(
                      AgentError.make({
                        message: "Resume call does not match the unresolved checkpoint call",
                        turn: 0,
                      }),
                    )
                  }
                  const registry =
                    resume.authorizationStage === undefined && resume.activeTools === undefined
                      ? tools.registry
                      : select(tools.registry, resume.activeTools ?? [])
                  return toolCallEvents(
                    0,
                    checkpoint.call as AnyToolCall,
                    checkpoint.messages,
                    registry,
                    resume.authorizationStage,
                    resume.token,
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
      const runStream = options.resume === undefined ? runTurn(0, initialPrompt) : resumeStream(options.resume)
      return runStream.pipe(
        Stream.catchCause((cause) => {
          const reason = cause.reasons.length === 1 ? cause.reasons[0] : undefined
          if (reason !== undefined && Cause.isFailReason(reason) && Schema.is(AgentSuspended)(reason.error)) {
            return Stream.unwrap(
              Effect.gen(function* () {
                const transcript = yield* Ref.get(chat.history)
                const checkpoint =
                  state.pending.length === 0
                    ? transcript
                    : Prompt.concat(transcript, Prompt.fromResponseParts(state.pending))
                yield* Ref.set(chat.history, checkpoint)
                yield* savePersisted
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
