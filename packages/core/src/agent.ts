import {
  Cause,
  Channel,
  type Duration,
  Effect,
  Exit,
  Fiber,
  Option,
  Queue,
  Ref,
  Schema,
  Semaphore,
  Stream,
} from "effect"
import { dual } from "effect/Function"
import { AiError, Chat, LanguageModel, Prompt, Response, Telemetry, Tokenizer, Tool, Toolkit } from "effect/unstable/ai"
import {
  addUsage,
  AgentError,
  AgentSuspended,
  type Completed,
  type Event,
  MiddlewareViolation,
  ProgressOverflowError,
  type SteeringDrained,
  type StructuredOutput,
  type ToolProgress,
  type TurnCompleted,
  TurnLimitExceeded,
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
import { type ModelEnvironment, type ModelSelection, Service } from "./model-registry.js"
import { ModelResilience, apply } from "./model-resilience.js"
import { type Answer, type Pending, type PermissionError, Permissions, RuleStore } from "./permissions.js"
import { type Entry, SessionStore, type SessionStoreError } from "./session.js"
import { SkillSource, type SkillSourceError, selectListings } from "./skill-source.js"
import { type Message, Steering } from "./steering.js"
import { ToolContext } from "./tool-context.js"
import {
  type Outcome,
  type Request,
  RemoteRetryError,
  type Success,
  ToolExecutor,
  executeToolkit,
} from "./tool-executor.js"
import { bound } from "./tool-output.js"
import { defaultPolicy, type TurnOverrides, type TurnPolicy } from "./turn-policy.js"

type CompactionResult = import("./compaction.js").Result
/** @experimental An agent definition: a plain value, not a service. */
export interface Agent<Tools extends Record<string, Tool.Any> = {}, HasModel extends boolean = boolean> {
  readonly name: string
  readonly instructions?: string
  readonly toolkit: Toolkit.Toolkit<Tools>
  readonly policy: TurnPolicy
  readonly model?: HasModel extends true ? ModelSelection : ModelSelection
  readonly memory?: Key
  readonly metadata?: Readonly<Record<string, unknown>>
}

/** @experimental */
export interface WithModelDefault {
  readonly model: ModelSelection
}

/** @experimental */
export interface MakeOptions<Tools extends Record<string, Tool.Any> = {}> {
  readonly instructions?: string
  readonly toolkit?: Toolkit.Toolkit<Tools>
  readonly policy?: TurnPolicy
  readonly model?: ModelSelection
  readonly memory?: Key
  readonly metadata?: Readonly<Record<string, unknown>>
}

/** @experimental */
export interface MakeObjectOptions<Tools extends Record<string, Tool.Any> = {}> extends MakeOptions<Tools> {
  readonly name: string
}

/** @experimental Defaults: empty toolkit, `defaultPolicy`. */
export function make<Tools extends Record<string, Tool.Any> = {}>(
  name: string,
  options: MakeOptions<Tools> & WithModelDefault,
): Agent<Tools, true>
export function make<Tools extends Record<string, Tool.Any> = {}>(
  name: string,
  options?: MakeOptions<Tools>,
): Agent<Tools, false>
export function make<Tools extends Record<string, Tool.Any> = {}>(
  options: MakeObjectOptions<Tools> & WithModelDefault,
): Agent<Tools, true>
export function make<Tools extends Record<string, Tool.Any> = {}>(
  options: MakeObjectOptions<Tools>,
): Agent<Tools, false>
export function make<Tools extends Record<string, Tool.Any> = {}>(
  options: MakeOptions<Tools> & WithModelDefault,
): (name: string) => Agent<Tools, true>
export function make<Tools extends Record<string, Tool.Any> = {}>(
  options?: MakeOptions<Tools>,
): (name: string) => Agent<Tools, false>
export function make<Tools extends Record<string, Tool.Any> = {}>(
  nameOrOptions?: string | MakeObjectOptions<Tools> | MakeOptions<Tools>,
  options: MakeOptions<Tools> = {},
): Agent<Tools, boolean> | ((name: string) => Agent<Tools, boolean>) {
  if (nameOrOptions === undefined || (typeof nameOrOptions !== "string" && !("name" in nameOrOptions))) {
    return (name) => make(name, nameOrOptions ?? {})
  }
  const resolved = typeof nameOrOptions === "string" ? { ...options, name: nameOrOptions } : nameOrOptions
  return {
    name: resolved.name,
    ...(resolved.instructions === undefined ? {} : { instructions: resolved.instructions }),
    toolkit: resolved.toolkit ?? (Toolkit.empty as unknown as Toolkit.Toolkit<Tools>),
    policy: resolved.policy ?? defaultPolicy,
    ...(resolved.model === undefined ? {} : { model: resolved.model }),
    ...(resolved.memory === undefined ? {} : { memory: resolved.memory }),
    ...(resolved.metadata === undefined ? {} : { metadata: resolved.metadata }),
  }
}

/** @experimental Re-entry after `AgentSuspended`: execute this call first. */
export interface Resume {
  readonly call: {
    readonly id: string
    readonly name: string
    readonly params: unknown
  }
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
  /**
   * @experimental Run this agent on a persisted chat. Requires `Chat.Persistence`
   * to be provided in context (e.g. via `Chat.layerPersisted({ storeId })` over a
   * `BackingPersistence` layer). The chat identified by `chatId` is created on
   * first use and accumulates history across runs. Mutually exclusive with
   * `history`.
   */
  readonly persistence?: {
    readonly chatId: string
    readonly timeToLive?: Duration.Input
  }
}

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

interface StructuredRunConfig<StructuredOutputSchema extends ObjectSchema> {
  readonly schema: StructuredOutputSchema
  readonly objectName: string
  readonly objectPrompt: Prompt.RawInput
}

/** @experimental The error channel of `stream` and `generate`. */
export type RunError = AgentError | AgentSuspended | TurnLimitExceeded | MiddlewareViolation | ProgressOverflowError

type ModelRunServices<HasModel extends boolean> = [HasModel] extends [true] ? Service : LanguageModel.LanguageModel
type StaticToolServices<Tools extends Record<string, Tool.Any>> =
  | Tool.HandlersFor<Tools>
  | Exclude<Tool.HandlerServices<Tools[keyof Tools]>, ToolContext>

/** @experimental Services required to run an agent. */
export type RunServices<Tools extends Record<string, Tool.Any> = {}, HasModel extends boolean = boolean> =
  | StaticToolServices<Tools>
  | ModelRunServices<HasModel>

type AnyToolCall = Response.ToolCallPart<string, unknown>

type PendingToolResult = Response.ToolResultPart<string, unknown, unknown>

const chatLocks = new WeakMap<Chat.Service, Semaphore.Semaphore>()

const lockForChat = (chat: Chat.Service): Semaphore.Semaphore => {
  const existing = chatLocks.get(chat)
  if (existing !== undefined) return existing
  const created = Semaphore.makeUnsafe(1)
  chatLocks.set(chat, created)
  return created
}

const skillListingBudgetTokens = 2_048

const activateSkillToolName = "activate_skill"

const activateSkillParameters = Schema.Struct({ name: Schema.String })

const activateSkillTool = Tool.make(activateSkillToolName, {
  description: "Load the full body for one listed Baton skill by name before applying that skill.",
  parameters: activateSkillParameters,
  success: Schema.Struct({
    name: Schema.String,
    body: Schema.String,
    allowedTools: Schema.Array(Schema.String),
  }),
})

const errorMessage = (error: unknown) => (error instanceof Error ? `${error.name}: ${error.message}` : String(error))

const appendInstructionFragment = (base: string | undefined, fragment: string | undefined): string | undefined => {
  if (fragment === undefined || fragment.length === 0) return base
  if (base === undefined || base.length === 0) return fragment
  return `${base}\n\n${fragment}`
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

const failedResult = (call: AnyToolCall, message: string): PendingToolResult =>
  Response.toolResultPart({
    id: call.id,
    name: call.name,
    isFailure: true,
    result: { error: message },
    encodedResult: { error: message },
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

const approvalRequired = (
  tool: Tool.Any | undefined,
  call: AnyToolCall,
  messages: ReadonlyArray<Prompt.Message>,
): Effect.Effect<boolean> => {
  const needsApproval = tool?.needsApproval
  if (needsApproval === undefined) return Effect.succeed(false)
  if (typeof needsApproval === "boolean") return Effect.succeed(needsApproval)
  return Effect.suspend(() => {
    const result = needsApproval(call.params as never, { toolCallId: call.id, messages })
    return Effect.isEffect(result) ? result : Effect.succeed(result)
  }).pipe(Effect.catchCause((cause) => (Cause.hasInterrupts(cause) ? Effect.interrupt : Effect.succeed(true))))
}

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

const streamInternal = <
  Tools extends Record<string, Tool.Any>,
  HasModel extends boolean,
  StructuredOutputSchema extends ObjectSchema,
>(
  agent: Agent<Tools, HasModel>,
  options: RunOptions,
  structured: StructuredRunConfig<StructuredOutputSchema> | undefined,
): Stream.Stream<Event, RunError, RunServices<Tools, HasModel> | StructuredOutputSchema["DecodingServices"]> =>
  Stream.unwrap(
    Effect.gen(function* () {
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
      const steeringService = yield* Effect.serviceOption(Steering)
      const compactionService = yield* Effect.serviceOption(Compaction)
      const memoryService = yield* Effect.serviceOption(Memory)
      const sessionService = yield* Effect.serviceOption(SessionStore)
      const tokenizerService = yield* Effect.serviceOption(Tokenizer.Tokenizer)
      const persistenceOptions = options.persistence
      const memoryOptions = options.memory ?? (agent.memory === undefined ? undefined : { key: agent.memory })
      const agentModel = agent.model
      const agentModelContext =
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
              onSome: (registry) =>
                registry
                  .provide(agentModel, Effect.context<ModelEnvironment>())
                  .pipe(
                    Effect.mapError((error) =>
                      AgentError.make({ message: errorMessage(error), turn: 0, cause: error }),
                    ),
                  ),
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

      const activatedSkillBodies = new Map<string, string>()
      const activatedSkillTools = new Map<string, Tool.Any>()

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

      const isSkillActivationCall = (call: AnyToolCall): boolean =>
        call.name === activateSkillToolName && skillRuntime !== undefined && hasActivatableSkills

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

      const boundedSuccessResult = (
        turn: number,
        call: AnyToolCall,
        outcome: Success,
      ): Effect.Effect<PendingToolResult, AgentError> =>
        (options.toolOutputMaxBytes === undefined
          ? Effect.succeed(outcome)
          : bound(outcome, { toolCallId: call.id, maxBytes: options.toolOutputMaxBytes }).pipe(
              Effect.mapError((error) => AgentError.make({ message: error.message, turn, cause: error })),
            )
        ).pipe(Effect.map((bounded) => successResult(call, bounded)))

      const outcomeEvents = (
        turn: number,
        call: AnyToolCall,
        outcome: Outcome,
        droppedProgress: number,
      ): Effect.Effect<Stream.Stream<Event, RunError>, AgentError> => {
        const metadata = droppedProgress === 0 ? {} : { metadata: { toolProgress: { dropped: droppedProgress } } }
        switch (outcome._tag) {
          case "Success":
            return (
              isSkillActivationCall(call)
                ? Effect.succeed(successResult(call, outcome))
                : boundedSuccessResult(turn, call, outcome)
            ).pipe(
              Effect.map((result) => {
                state.pending.push(result)
                return Stream.fromIterable<Event>([{ _tag: "ToolExecutionCompleted", turn, call, result, ...metadata }])
              }),
            )
          case "Failure": {
            const result = failedResult(call, outcome.message)
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
      ): Effect.Effect<Outcome, never, Tool.HandlersFor<Tools> | Tool.HandlerServices<Tools[keyof Tools]>> => {
        if (agent.toolkit.tools[request.call.name] !== undefined) {
          return executeToolkit(agent.toolkit, request)
        }
        const activated = activatedSkillTools.get(request.call.name)
        return activated === undefined
          ? Effect.succeed({ _tag: "Failure", message: `Tool ${request.call.name} is not registered` })
          : Effect.succeed({
              _tag: "Failure",
              message: `Activated skill tool ${request.call.name} requires ToolExecutor`,
            })
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
                AgentError,
                ToolContext | Tool.HandlersFor<Tools> | Tool.HandlerServices<Tools[keyof Tools]>
              > = isSkillActivationCall(call)
                ? activateSkillOutcome(turn, call)
                : Option.isNone(executor)
                  ? defaultExecute(request)
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
                        Effect.flatMap((dropped) => outcomeEvents(turn, call, outcome, dropped)),
                      ),
                    ),
                  ),
                ),
              )
            }),
          ),
        )

      const permissionError = (turn: number, error: PermissionError): AgentError =>
        AgentError.make({ message: error.message, turn, cause: error })

      const permissionDeniedEvents = (
        turn: number,
        call: AnyToolCall,
        reason: string | undefined,
      ): Stream.Stream<Event> => {
        const result = failedResult(call, reason ?? "Permission denied")
        state.pending.push(result)
        return Stream.fromIterable<Event>([{ _tag: "ToolExecutionCompleted", turn, call, result }])
      }

      const activateSkillOutcome = (turn: number, call: AnyToolCall): Effect.Effect<Outcome, AgentError> =>
        Effect.gen(function* () {
          if (skillRuntime === undefined)
            return { _tag: "Failure", message: "SkillSource is not available" } satisfies Outcome
          const params = Schema.decodeUnknownOption(activateSkillParameters)(call.params)
          if (Option.isNone(params))
            return { _tag: "Failure", message: "Skill activation requires a name" } satisfies Outcome
          const skill = yield* skillRuntime.source.get(params.value.name)
          if (skill === undefined)
            return { _tag: "Failure", message: `Skill not found: ${params.value.name}` } satisfies Outcome
          if (skill.frontmatter.disableModelInvocation === true) {
            return { _tag: "Failure", message: `Skill is not model-invocable: ${params.value.name}` } satisfies Outcome
          }
          let body = activatedSkillBodies.get(skill.frontmatter.name)
          if (body === undefined) {
            body = yield* skill.body
            activatedSkillBodies.set(skill.frontmatter.name, body)
            for (const tool of skill.tools) {
              activatedSkillTools.set(tool.name, tool)
            }
          }
          const output = {
            name: skill.frontmatter.name,
            body,
            allowedTools: [...(skill.frontmatter.allowedTools ?? [])],
          }
          return { _tag: "Success", result: output, encodedResult: output } satisfies Success
        }).pipe(Effect.mapError((error) => skillError(turn, error)))

      const rememberAlways = (turn: number, call: AnyToolCall): Effect.Effect<void, AgentError> =>
        Effect.serviceOption(RuleStore).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.void,
              onSome: (store) =>
                store
                  .remember({ pattern: call.name, level: "allow" })
                  .pipe(Effect.mapError((error) => permissionError(turn, error))),
            }),
          ),
        )

      const approvalEvents = (
        turn: number,
        call: AnyToolCall,
        messages: ReadonlyArray<Prompt.Message>,
        request: Request,
        tool: Tool.Any | undefined,
      ): Stream.Stream<Event, RunError, StaticToolServices<Tools>> =>
        Stream.unwrap(
          approvalRequired(tool, call, messages).pipe(
            Effect.map((isRequired): Stream.Stream<Event, RunError, StaticToolServices<Tools>> => {
              if (!isRequired) return executeApproved(turn, call, request)
              if (Option.isNone(approvals)) {
                const result = failedResult(call, "Approvals service is required for approval-gated tools")
                state.pending.push(result)
                return Stream.fromIterable<Event>([
                  { _tag: "ApprovalRequested", turn, call },
                  { _tag: "ToolExecutionCompleted", turn, call, result },
                ])
              }
              return Stream.concat(
                Stream.fromIterable<Event>([{ _tag: "ApprovalRequested", turn, call }]),
                Stream.unwrap(
                  approvals.value.check(request).pipe(
                    Effect.map((decision): Stream.Stream<Event, RunError, StaticToolServices<Tools>> => {
                      switch (decision._tag) {
                        case "Approved":
                          return executeApproved(turn, call, request)
                        case "Denied": {
                          const result = failedResult(call, decision.reason ?? "Tool call denied")
                          state.pending.push(result)
                          return Stream.fromIterable<Event>([{ _tag: "ToolExecutionCompleted", turn, call, result }])
                        }
                        case "Pending":
                          return failSuspended(call, decision.token, "approval")
                      }
                    }),
                  ),
                ),
              )
            }),
          ),
        )

      const permissionAnsweredEvents = (
        turn: number,
        call: AnyToolCall,
        request: Request,
        answer: Answer,
      ): Stream.Stream<Event, RunError, StaticToolServices<Tools>> => {
        switch (answer._tag) {
          case "Approved":
            return executeApproved(turn, call, request)
          case "Denied":
            return permissionDeniedEvents(turn, call, answer.reason)
          case "Always":
            return Stream.unwrap(rememberAlways(turn, call).pipe(Effect.as(executeApproved(turn, call, request))))
        }
      }

      const permissionAskEvents = (
        turn: number,
        call: AnyToolCall,
        request: Request,
        token: string,
      ): Stream.Stream<Event, RunError, StaticToolServices<Tools>> => {
        const pending: Pending = {
          token,
          tool: call.name,
          params: call.params,
          agentName: agent.name,
          turn,
          toolCallId: call.id,
        }
        if (Option.isNone(permissionsService)) return failSuspended(call, token, "approval")
        return Stream.concat(
          Stream.fromIterable<Event>([{ _tag: "ApprovalRequested", turn, call }]),
          Stream.unwrap(
            permissionsService.value.await(pending).pipe(
              Effect.mapError((error) => permissionError(turn, error)),
              Effect.map(
                Option.match({
                  onNone: () => failSuspended(call, token, "approval"),
                  onSome: (answer) => permissionAnsweredEvents(turn, call, request, answer),
                }),
              ),
            ),
          ),
        )
      }

      const toolCallEvents = (
        turn: number,
        call: AnyToolCall,
        messages: ReadonlyArray<Prompt.Message>,
      ): Stream.Stream<Event, RunError, StaticToolServices<Tools>> => {
        const request: Request = { call, turn, agentName: agent.name, sessionId }
        const tool = currentToolkit().tools[call.name] as Tool.Any | undefined
        if (Option.isNone(permissionsService)) return approvalEvents(turn, call, messages, request, tool)
        return Stream.unwrap(
          permissionsService.value
            .evaluate({
              tool: call.name,
              params: call.params,
              agentName: agent.name,
              turn,
              toolCallId: call.id,
              sessionId,
            })
            .pipe(
              Effect.mapError((error) => permissionError(turn, error)),
              Effect.map((decision): Stream.Stream<Event, RunError, StaticToolServices<Tools>> => {
                switch (decision._tag) {
                  case "Allow":
                    return approvalEvents(turn, call, messages, request, tool)
                  case "Deny":
                    return permissionDeniedEvents(turn, call, decision.reason)
                  case "Ask":
                    return permissionAskEvents(turn, call, request, decision.token)
                }
              }),
            ),
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

      const withModelResilience = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        Option.match(resilienceService, {
          onNone: () => effect,
          onSome: (resilience) =>
            Effect.flatMap(LanguageModel.LanguageModel, (model) =>
              effect.pipe(Effect.provideService(LanguageModel.LanguageModel, apply(model, resilience))),
            ),
        })

      const withAgentModel = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        agentModelContext === undefined ? effect : effect.pipe(Effect.provide(agentModelContext))

      function provideAgentModel<A, E, R>(
        stream: Stream.Stream<A, E, R>,
      ): Stream.Stream<A, E, Exclude<R, LanguageModel.LanguageModel> | ModelRunServices<HasModel>>
      function provideAgentModel<A, E, R>(stream: Stream.Stream<A, E, R>): Stream.Stream<A, E, R | Service>
      function provideAgentModel<A, E, R>(stream: Stream.Stream<A, E, R>): Stream.Stream<A, E, R | Service> {
        return agentModelContext === undefined ? stream : stream.pipe(Stream.provideContext(agentModelContext))
      }

      const partEvents = (
        turn: number,
        part: Response.StreamPart<Record<string, Tool.Any>>,
        messages: ReadonlyArray<Prompt.Message>,
      ): Stream.Stream<Event, RunError, StaticToolServices<Tools>> => {
        if (part.type === "error") {
          return Stream.fail(AgentError.make({ message: errorMessage(part.error), turn, cause: part.error }))
        }
        const modelPart = Stream.fromIterable<Event>([{ _tag: "ModelPart", turn, part }])
        if (part.type === "tool-call") {
          const call = part as AnyToolCall
          return call.providerExecuted === true
            ? modelPart
            : Stream.concat(modelPart, toolCallEvents(turn, call, messages))
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

      const currentToolkit = (): Toolkit.Toolkit<Record<string, Tool.Any>> =>
        Toolkit.make(
          ...Object.values(agent.toolkit.tools),
          ...(hasActivatableSkills ? [activateSkillTool] : []),
          ...activatedSkillTools.values(),
        ) as unknown as Toolkit.Toolkit<Record<string, Tool.Any>>

      const activeToolkit = (activeTools: ReadonlyArray<string>): Toolkit.Toolkit<Record<string, Tool.Any>> =>
        Toolkit.make(
          ...Object.values(currentToolkit().tools).filter((tool) => activeTools.includes(tool.name)),
        ) as unknown as Toolkit.Toolkit<Record<string, Tool.Any>>

      const modelTurn = (
        turn: number,
        prompt: Prompt.RawInput,
        overrides?: TurnOverrides,
      ): Stream.Stream<Event, RunError, RunServices<Tools, HasModel>> => {
        const toolkit = overrides?.activeTools === undefined ? currentToolkit() : activeToolkit(overrides.activeTools)
        const attempt = (
          activePrompt: Prompt.Prompt,
          retryOverflow: boolean,
        ): Stream.Stream<
          { readonly part: Response.StreamPart<any>; readonly messages: ReadonlyArray<Prompt.Message> },
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
              chatLock.take(1).pipe(Effect.andThen(Ref.get(chat.history))),
              (history) => {
                const responsePrompt = Prompt.concat(history, activePrompt)
                const messages = responsePrompt.content
                const rawParts = LanguageModel.streamText({
                  prompt: responsePrompt,
                  toolkit,
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
                  Stream.tap((part) =>
                    Effect.sync(() => {
                      transformedParts.push(part)
                    }),
                  ),
                  Stream.map((part) => ({ part, messages })),
                  Stream.toChannel,
                )
              },
              (history, exit) =>
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
            Stream.mapError((error) =>
              AiError.isAiError(error) ? AgentError.make({ message: errorMessage(error), turn, cause: error }) : error,
            ),
          )
        }
        const parts = Stream.unwrap(
          applyPromptChain(chain, Prompt.make(prompt), { agentName: agent.name, turn }).pipe(
            Effect.flatMap((transformedPrompt) => preparePrompt(turn, transformedPrompt, false)),
            Effect.map((preparedPrompt) =>
              attempt(preparedPrompt, true).pipe(
                Stream.flatMap(({ part, messages }) => partEvents(turn, part, messages)),
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
                Effect.mapError((error) =>
                  AgentError.make({ message: errorMessage(error), turn: structuredTurn, cause: error }),
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
        AgentError
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
          const decision = yield* agent.policy.decide({
            turn: turn + 1,
            history: transcript,
            pendingToolResults: pending,
          })
          if (decision._tag === "Stop") {
            return {
              events: Stream.concat(
                Stream.fromIterable<Event>([completed]),
                Stream.fail(
                  TurnLimitExceeded.make({
                    turn: turn + 1,
                    pending: pending.map((result) => ({
                      tool_call_id: result.id,
                      tool_name: result.name,
                    })),
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
          Stream.concat(modelTurn(turn, prompt, overrides)),
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
        const call = Response.makePart("tool-call", {
          id: resume.call.id,
          name: resume.call.name,
          params: resume.call.params,
          providerExecuted: false,
        })
        const currentTurn = resetTurnState(0).pipe(
          Stream.concat(
            Stream.unwrap(
              Ref.get(chat.history).pipe(Effect.map((history) => toolCallEvents(0, call, history.content))),
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
          if (Cause.hasInterrupts(cause)) return Stream.failCause(cause)
          const error = Cause.squash(cause)
          if (Schema.is(AgentSuspended)(error)) {
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
  ).pipe(Stream.withSpan("Baton.Agent.run", { attributes: { "baton.agent.name": agent.name } }))

/** @experimental The text primitive; everything else derives from it. */
export const stream: {
  (
    options: RunOptions,
  ): <Tools extends Record<string, Tool.Any>, HasModel extends boolean>(
    agent: Agent<Tools, HasModel>,
  ) => Stream.Stream<Event, RunError, RunServices<Tools, HasModel>>
  <Tools extends Record<string, Tool.Any>, HasModel extends boolean>(
    agent: Agent<Tools, HasModel>,
    options: RunOptions,
  ): Stream.Stream<Event, RunError, RunServices<Tools, HasModel>>
} = dual(
  2,
  <Tools extends Record<string, Tool.Any>, HasModel extends boolean>(
    agent: Agent<Tools, HasModel>,
    options: RunOptions,
  ) => streamInternal(agent, options, undefined),
)

/** @experimental `stream` plus one terminal structured-output turn before `Completed`. */
export const streamObject: {
  <StructuredOutputSchema extends ObjectSchema>(
    options: ObjectRunOptions<StructuredOutputSchema>,
  ): <Tools extends Record<string, Tool.Any>, HasModel extends boolean>(
    agent: Agent<Tools, HasModel>,
  ) => Stream.Stream<Event, RunError, RunServices<Tools, HasModel> | StructuredOutputSchema["DecodingServices"]>
  <Tools extends Record<string, Tool.Any>, HasModel extends boolean, StructuredOutputSchema extends ObjectSchema>(
    agent: Agent<Tools, HasModel>,
    options: ObjectRunOptions<StructuredOutputSchema>,
  ): Stream.Stream<Event, RunError, RunServices<Tools, HasModel> | StructuredOutputSchema["DecodingServices"]>
} = dual(
  2,
  <Tools extends Record<string, Tool.Any>, HasModel extends boolean, StructuredOutputSchema extends ObjectSchema>(
    agent: Agent<Tools, HasModel>,
    options: ObjectRunOptions<StructuredOutputSchema>,
  ): Stream.Stream<Event, RunError, RunServices<Tools, HasModel> | StructuredOutputSchema["DecodingServices"]> =>
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
  (
    options: RunOptions,
  ): <Tools extends Record<string, Tool.Any>, HasModel extends boolean>(
    agent: Agent<Tools, HasModel>,
  ) => Effect.Effect<Result, RunError, RunServices<Tools, HasModel>>
  <Tools extends Record<string, Tool.Any>, HasModel extends boolean>(
    agent: Agent<Tools, HasModel>,
    options: RunOptions,
  ): Effect.Effect<Result, RunError, RunServices<Tools, HasModel>>
} = dual(
  2,
  <Tools extends Record<string, Tool.Any>, HasModel extends boolean>(
    agent: Agent<Tools, HasModel>,
    options: RunOptions,
  ): Effect.Effect<Result, RunError, RunServices<Tools, HasModel>> =>
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

/** @experimental `streamObject` folded to its `StructuredOutput` and `Completed` events. */
export const generateObject: {
  <StructuredOutputSchema extends ObjectSchema>(
    options: ObjectRunOptions<StructuredOutputSchema>,
  ): <Tools extends Record<string, Tool.Any>, HasModel extends boolean>(
    agent: Agent<Tools, HasModel>,
  ) => Effect.Effect<
    ObjectResult<StructuredOutputSchema["Type"]>,
    RunError,
    RunServices<Tools, HasModel> | StructuredOutputSchema["DecodingServices"]
  >
  <Tools extends Record<string, Tool.Any>, HasModel extends boolean, StructuredOutputSchema extends ObjectSchema>(
    agent: Agent<Tools, HasModel>,
    options: ObjectRunOptions<StructuredOutputSchema>,
  ): Effect.Effect<
    ObjectResult<StructuredOutputSchema["Type"]>,
    RunError,
    RunServices<Tools, HasModel> | StructuredOutputSchema["DecodingServices"]
  >
} = dual(
  2,
  <Tools extends Record<string, Tool.Any>, HasModel extends boolean, StructuredOutputSchema extends ObjectSchema>(
    agent: Agent<Tools, HasModel>,
    options: ObjectRunOptions<StructuredOutputSchema>,
  ): Effect.Effect<
    ObjectResult<StructuredOutputSchema["Type"]>,
    RunError,
    RunServices<Tools, HasModel> | StructuredOutputSchema["DecodingServices"]
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
