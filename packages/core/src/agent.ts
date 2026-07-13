import { Cause, type Duration, Effect, Fiber, Option, Queue, Ref, Schema, Stream } from "effect"
import { Chat, LanguageModel, Prompt, Response, Telemetry, Tokenizer, Tool, Toolkit } from "effect/unstable/ai"
import {
  addUsage,
  AgentError,
  AgentSuspended,
  type Completed,
  type Event,
  MiddlewareViolation,
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
import { type Outcome, type Request, type Success, ToolExecutor, executeToolkit } from "./tool-executor.js"
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
  nameOrOptions: string | MakeObjectOptions<Tools>,
  options: MakeOptions<Tools> = {},
): Agent<Tools, boolean> {
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
export type RunError = AgentError | AgentSuspended | TurnLimitExceeded | MiddlewareViolation

/** @experimental Services required to run an agent. */
export type RunServices<Tools extends Record<string, Tool.Any> = {}, HasModel extends boolean = boolean> =
  | Tool.HandlersFor<Tools>
  | (HasModel extends true ? Service : LanguageModel.LanguageModel)

type AnyToolCall = Response.ToolCallPart<string, unknown>

type PendingToolResult = Response.ToolResultPart<string, unknown, unknown>

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
  new AgentSuspended({
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

const isUserMessagePart = (part: Prompt.Part): part is Prompt.UserMessagePart =>
  part.type === "text" || part.type === "file"

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
        return yield* Effect.fail(
          new AgentError({
            message: "RunOptions.history and RunOptions.persistence are mutually exclusive",
            turn: 0,
          }),
        )
      }

      if (
        options.toolOutputMaxBytes !== undefined &&
        (!Number.isFinite(options.toolOutputMaxBytes) || options.toolOutputMaxBytes < 0)
      ) {
        return yield* Effect.fail(
          new AgentError({
            message: "RunOptions.toolOutputMaxBytes must be a non-negative finite number",
            turn: 0,
          }),
        )
      }

      if (
        options.compaction?.contextWindow !== undefined &&
        (!Number.isFinite(options.compaction.contextWindow) || options.compaction.contextWindow <= 0)
      ) {
        return yield* Effect.fail(
          new AgentError({
            message: "RunOptions.compaction.contextWindow must be a positive finite number",
            turn: 0,
          }),
        )
      }

      const sessionId = options.sessionId ?? "local"

      const instructionsService = yield* Effect.serviceOption(Instructions)
      const skillSourceService = yield* Effect.serviceOption(SkillSource)
      const skillRuntime = Option.isNone(skillSourceService)
        ? undefined
        : {
            source: skillSourceService.value,
            skills: yield* skillSourceService.value.all.pipe(
              Effect.mapError((error) => new AgentError({ message: error.message, turn: 0, cause: error })),
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
                  new AgentError({
                    message: "Agent.model requires ModelRegistry in context",
                    turn: 0,
                  }),
                ),
              onSome: (registry) =>
                registry
                  .provide(agentModel, Effect.context<ModelEnvironment>())
                  .pipe(
                    Effect.mapError((error) => new AgentError({ message: errorMessage(error), turn: 0, cause: error })),
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
                    new AgentError({
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
                  new AgentError({
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
                    Effect.mapError((error) => new AgentError({ message: errorMessage(error), turn: 0, cause: error })),
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

      const savePersisted: Effect.Effect<void, AgentError> =
        persisted === undefined
          ? Effect.void
          : persisted.save.pipe(
              Effect.mapError((error) => new AgentError({ message: errorMessage(error), turn: 0, cause: error })),
            )

      const failSuspended = (call: AnyToolCall, token: string, reason: "tool-wait" | "approval") =>
        Stream.fail<RunError>(suspended(call, token, reason))

      const state = {
        text: "",
        turn: 0,
        pending: [] as Array<PendingToolResult>,
        finish: undefined as { readonly usage: Response.Usage; readonly reason: Response.FinishReason } | undefined,
        usage: undefined as Response.Usage | undefined,
        contextTokens: undefined as number | undefined,
      }

      const activatedSkillBodies = new Map<string, string>()
      const activatedSkillTools = new Map<string, Tool.Any>()

      let sessionSyncedMessages = 0
      let sessionInitialized = false

      const activeSession = Option.isSome(compactionService)
        ? sessionService
        : Option.none<typeof SessionStore.Service>()

      const sessionError = (turn: number, error: SessionStoreError): AgentError =>
        new AgentError({ message: error.message, turn, cause: error })

      const compactionError = (turn: number, error: CompactionError): AgentError =>
        new AgentError({ message: error.message, turn, cause: error })

      const memoryError = (turn: number, error: MemoryError): AgentError =>
        new AgentError({ message: error.message, turn, cause: error })

      const skillError = (turn: number, error: SkillSourceError): AgentError =>
        new AgentError({ message: error.message, turn, cause: error })

      const isSkillActivationCall = (call: AnyToolCall): boolean =>
        call.name === activateSkillToolName && skillRuntime !== undefined && hasActivatableSkills

      const insertRecalledItems = (
        turn: number,
        prompt: Prompt.Prompt,
        items: ReadonlyArray<Item>,
      ): Effect.Effect<Prompt.Prompt, AgentError> =>
        Effect.gen(function* () {
          const parts = items.flatMap((item) => item.parts)
          if (parts.length === 0) return prompt
          const userParts: Array<Prompt.UserMessagePart> = []
          for (const part of parts) {
            if (!isUserMessagePart(part)) {
              return yield* Effect.fail(
                new AgentError({
                  message: `Memory recalled unsupported prompt part type: ${part.type}`,
                  turn,
                }),
              )
            }
            userParts.push(part)
          }
          const memoryMessage = Prompt.makeMessage("user", { content: userParts })
          const [first, ...rest] = prompt.content
          return first?.role === "system"
            ? Prompt.fromMessages([first, memoryMessage, ...rest])
            : Prompt.fromMessages([memoryMessage, ...prompt.content])
        })

      const recallInitialPrompt = (prompt: Prompt.Prompt): Effect.Effect<Prompt.Prompt, AgentError> =>
        memoryRuntime === undefined
          ? Effect.succeed(prompt)
          : memoryRuntime.service.recall({ key: memoryRuntime.key, turn: 0, prompt }).pipe(
              Effect.mapError((error) => memoryError(0, error)),
              Effect.flatMap((items) => insertRecalledItems(0, prompt, items)),
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
              const existingPath = yield* session.path().pipe(Effect.mapError((error) => sessionError(turn, error)))
              if (!sessionInitialized) {
                sessionInitialized = true
                if (existingPath.length > 0) {
                  sessionSyncedMessages = transcript.content.length
                  return existingPath
                }
              }
              for (const message of transcript.content.slice(sessionSyncedMessages)) {
                yield* session
                  .append({ _tag: "Message", message })
                  .pipe(Effect.mapError((error) => sessionError(turn, error)))
              }
              sessionSyncedMessages = transcript.content.length
              return yield* session.path().pipe(Effect.mapError((error) => sessionError(turn, error)))
            }),
        })

      const countTokens = (turn: number, prompt: Prompt.Prompt): Effect.Effect<number, AgentError> => {
        if (state.contextTokens !== undefined) return Effect.succeed(state.contextTokens)
        return Option.match(tokenizerService, {
          onNone: () => Effect.succeed(0),
          onSome: (tokenizer) =>
            tokenizer.tokenize(prompt).pipe(
              Effect.map((tokens) => tokens.length),
              Effect.mapError((error) => new AgentError({ message: errorMessage(error), turn, cause: error })),
            ),
        })
      }

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
              Effect.mapError((error) => new AgentError({ message: error.message, turn, cause: error })),
            )
        ).pipe(Effect.map((bounded) => successResult(call, bounded)))

      const outcomeEvents = (
        turn: number,
        call: AnyToolCall,
        outcome: Outcome,
      ): Effect.Effect<Stream.Stream<Event, RunError>, AgentError> => {
        switch (outcome._tag) {
          case "Success":
            return (
              isSkillActivationCall(call)
                ? Effect.succeed(successResult(call, outcome))
                : boundedSuccessResult(turn, call, outcome)
            ).pipe(
              Effect.map((result) => {
                state.pending.push(result)
                return Stream.fromIterable<Event>([{ _tag: "ToolExecutionCompleted", turn, call, result }])
              }),
            )
          case "Failure": {
            const result = failedResult(call, outcome.message)
            state.pending.push(result)
            return Effect.succeed(Stream.fromIterable<Event>([{ _tag: "ToolExecutionCompleted", turn, call, result }]))
          }
          case "Suspend":
            return Effect.succeed(failSuspended(call, outcome.token, "tool-wait"))
        }
      }

      const defaultExecute = (request: Request): Effect.Effect<Outcome, never, Tool.HandlersFor<Tools>> => {
        if (agent.toolkit.tools[request.call.name] !== undefined) {
          return executeToolkit(agent.toolkit, request)
        }
        const activated = activatedSkillTools.get(request.call.name)
        return activated === undefined
          ? Effect.succeed({ _tag: "Failure", message: `Tool ${request.call.name} is not registered` })
          : (executeToolkit(Toolkit.make(activated), request) as Effect.Effect<Outcome>)
      }

      const executeApproved = (
        turn: number,
        call: AnyToolCall,
        request: Request,
      ): Stream.Stream<Event, RunError, Tool.HandlersFor<Tools>> =>
        Stream.concat(
          Stream.fromIterable<Event>([{ _tag: "ToolExecutionStarted", turn, call }]),
          Stream.unwrap(
            Effect.gen(function* () {
              const progressQueue = yield* Queue.unbounded<ToolProgress, Cause.Done>()
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
                  return Queue.offer(progressQueue, event).pipe(Effect.asVoid)
                },
              })
              const execution = isSkillActivationCall(call)
                ? activateSkillOutcome(turn, call)
                : (Option.match(executor, {
                    onNone: () => defaultExecute(request),
                    onSome: (service) => service.execute(request),
                  }) as Effect.Effect<Outcome, AgentError, ToolContext | Tool.HandlersFor<Tools>>)
              const fiber = yield* execution.pipe(
                Effect.provideService(ToolContext, context),
                Effect.ensuring(Queue.end(progressQueue).pipe(Effect.asVoid)),
                Effect.forkScoped({ startImmediately: true }),
              )
              return Stream.concat(
                Stream.fromQueue(progressQueue),
                Stream.fromEffect(Fiber.join(fiber)).pipe(
                  Stream.flatMap((outcome) => Stream.unwrap(outcomeEvents(turn, call, outcome))),
                ),
              )
            }),
          ),
        )

      const permissionError = (turn: number, error: PermissionError): AgentError =>
        new AgentError({ message: error.message, turn, cause: error })

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
          if (skillRuntime === undefined) return { _tag: "Failure", message: "SkillSource is not available" }
          const params = Schema.decodeUnknownOption(activateSkillParameters)(call.params)
          if (Option.isNone(params)) return { _tag: "Failure", message: "Skill activation requires a name" }
          const skill = yield* skillRuntime.source
            .get(params.value.name)
            .pipe(Effect.mapError((error) => skillError(turn, error)))
          if (skill === undefined) return { _tag: "Failure", message: `Skill not found: ${params.value.name}` }
          if (skill.frontmatter.disableModelInvocation === true) {
            return { _tag: "Failure", message: `Skill is not model-invocable: ${params.value.name}` }
          }
          let body = activatedSkillBodies.get(skill.frontmatter.name)
          if (body === undefined) {
            body = yield* skill.body.pipe(Effect.mapError((error) => skillError(turn, error)))
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
          return { _tag: "Success", result: output, encodedResult: output }
        })

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
      ): Stream.Stream<Event, RunError, Tool.HandlersFor<Tools>> =>
        Stream.unwrap(
          approvalRequired(tool, call, messages).pipe(
            Effect.map((isRequired): Stream.Stream<Event, RunError, Tool.HandlersFor<Tools>> => {
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
                    Effect.map((decision): Stream.Stream<Event, RunError, Tool.HandlersFor<Tools>> => {
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
      ): Stream.Stream<Event, RunError, Tool.HandlersFor<Tools>> => {
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
      ): Stream.Stream<Event, RunError, Tool.HandlersFor<Tools>> => {
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
      ): Stream.Stream<Event, RunError, Tool.HandlersFor<Tools>> => {
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
              Effect.map((decision): Stream.Stream<Event, RunError, Tool.HandlersFor<Tools>> => {
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
          state.contextTokens = part.usage.inputTokens.total ?? state.contextTokens
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
        Effect.sync(() => {
          for (const part of content) {
            if (part.type === "finish") {
              state.usage = state.usage === undefined ? part.usage : addUsage(state.usage, part.usage)
            }
          }
        })

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

      const provideAgentModel = <A, E, R>(stream: Stream.Stream<A, E, R>) =>
        agentModelContext === undefined ? stream : stream.pipe(Stream.provideContext(agentModelContext))

      const partEvents = (
        turn: number,
        part: Response.StreamPart<Record<string, Tool.Any>>,
        messages: ReadonlyArray<Prompt.Message>,
      ): Stream.Stream<Event, RunError, Tool.HandlersFor<Tools>> => {
        if (part.type === "error") {
          return Stream.fail(new AgentError({ message: errorMessage(part.error), turn, cause: part.error }))
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

      // Run every model part through the middleware chain BEFORE the fold that
      // dispatches tool calls / accumulates text, so middleware sees raw model
      // output and everything downstream (events, tool dispatch, Relay
      // persistence) sees the transformed stream.
      const applyPartToEvents = (
        turn: number,
        part: Response.StreamPart<any>,
        messages: ReadonlyArray<Prompt.Message>,
      ): Stream.Stream<Event, RunError, Tool.HandlersFor<Tools>> =>
        Stream.unwrap(
          applyPartChain(chain, part, { agentName: agent.name, turn }).pipe(
            Effect.map(
              Option.match({
                onSome: (transformed) =>
                  partEvents(turn, transformed as Response.StreamPart<Record<string, Tool.Any>>, messages),
                onNone: (): Stream.Stream<Event, RunError> =>
                  part.type === "tool-call"
                    ? Stream.fail(
                        new MiddlewareViolation({
                          turn,
                          detail: "ModelMiddleware dropped a tool-call part",
                        }),
                      )
                    : Stream.empty,
              }),
            ),
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
          AgentError,
          LanguageModel.LanguageModel
        > =>
          Stream.unwrap(
            Ref.get(chat.history).pipe(
              Effect.map((historyBeforeAttempt) => {
                let emitted = false
                const messages = Prompt.concat(historyBeforeAttempt, activePrompt).content
                return chat.streamText({ prompt: activePrompt, toolkit, disableToolCallResolution: true }).pipe(
                  Stream.map((part) => ({ part: part as Response.StreamPart<any>, messages })),
                  Stream.tap(() =>
                    Effect.sync(() => {
                      emitted = true
                    }),
                  ),
                  Stream.catchCause((cause) => {
                    if (Cause.hasInterrupts(cause)) return Stream.fromEffect(Effect.interrupt)
                    const error = Cause.squash(cause)
                    if (retryOverflow && !emitted && isContextOverflow(error) && Option.isSome(compactionService)) {
                      return Stream.unwrap(
                        Effect.gen(function* () {
                          yield* Ref.set(chat.history, historyBeforeAttempt)
                          const compactedPrompt = yield* preparePrompt(turn, activePrompt, true)
                          return attempt(compactedPrompt, false)
                        }),
                      )
                    }
                    return Stream.make({ part: Response.makePart("error", { error }), messages })
                  }),
                )
              }),
            ),
          )
        const parts = Stream.unwrap(
          applyPromptChain(chain, Prompt.make(prompt), { agentName: agent.name, turn }).pipe(
            Effect.flatMap((transformedPrompt) => preparePrompt(turn, transformedPrompt, false)),
            Effect.map((preparedPrompt) =>
              attempt(preparedPrompt, true).pipe(
                Stream.flatMap(({ part, messages }) => applyPartToEvents(turn, part, messages)),
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
        return (
          overrides?.model === undefined
            ? provideAgentModel(resilientParts)
            : resilientParts.pipe(Stream.provide(overrides.model))
        ) as Stream.Stream<Event, RunError, RunServices<Tools, HasModel>>
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
        turn: number,
        config: StructuredRunConfig<StructuredOutputSchema>,
      ): Stream.Stream<Event, RunError, LanguageModel.LanguageModel | StructuredOutputSchema["DecodingServices"]> =>
        Stream.fromEffect(
          Effect.gen(function* () {
            const structuredTurn = turn + 1
            const transformedPrompt = yield* applyPromptChain(chain, Prompt.make(config.objectPrompt), {
              agentName: agent.name,
              turn: structuredTurn,
            })
            const response = yield* withAgentModel(
              withModelResilience(
                chat.generateObject({
                  prompt: transformedPrompt,
                  schema: config.schema,
                  objectName: config.objectName,
                  toolChoice: "none",
                }),
              ),
            ).pipe(
              Effect.mapError(
                (error) => new AgentError({ message: errorMessage(error), turn: structuredTurn, cause: error }),
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
          onSome: (service) => service.takeSteering(),
        })

      const takeFollowUp = (): Effect.Effect<ReadonlyArray<Message>> =>
        Option.match(steeringService, {
          onNone: () => Effect.succeed([]),
          onSome: (service) => service.takeFollowUp(),
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
                events: Stream.concat(Stream.fromIterable<Event>([completed]), structuredFinalEvents(turn, structured)),
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
                  new TurnLimitExceeded({
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
        const currentTurn = Stream.fromIterable<Event>([{ _tag: "TurnStarted", turn }]).pipe(
          Stream.concat(resetTurnState(turn)),
          Stream.concat(modelTurn(turn, prompt, overrides)),
          Stream.concat(
            Stream.unwrap(
              afterTurn(turn).pipe(
                Effect.map((result) => {
                  next = result.next
                  return result.events
                }),
              ),
            ),
          ),
          Stream.withSpan("Baton.Agent.turn", { attributes: { "baton.turn": turn } }),
        )
        return Stream.concat(
          currentTurn,
          Stream.suspend(() => (next === undefined ? Stream.empty : runTurn(turn + 1, next.prompt, next.overrides))),
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
      // On suspension, emit the finalized transcript as a trailing `TurnCompleted`
      // before re-failing. `chat.streamText` appends the assistant message (e.g. the
      // pending tool call) to `chat.history` on channel release, which completes during
      // teardown — after the suspend point — so a durable host reading the transcript
      // here sees the suspending turn. Only tool-wait/approval suspensions get this; the
      // trailing event is invisible to consumers that observe just the error.
      return runStream.pipe(
        Stream.catchCause((cause) => {
          if (Cause.hasInterrupts(cause)) return Stream.fromEffect(Effect.interrupt)
          const error = Cause.squash(cause)
          if (error instanceof AgentSuspended) {
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
export const stream = <Tools extends Record<string, Tool.Any>, HasModel extends boolean>(
  agent: Agent<Tools, HasModel>,
  options: RunOptions,
): Stream.Stream<Event, RunError, RunServices<Tools, HasModel>> =>
  streamInternal(agent, options, undefined) as Stream.Stream<Event, RunError, RunServices<Tools, HasModel>>

/** @experimental `stream` plus one terminal structured-output turn before `Completed`. */
export const streamObject = <
  Tools extends Record<string, Tool.Any>,
  HasModel extends boolean,
  StructuredOutputSchema extends ObjectSchema,
>(
  agent: Agent<Tools, HasModel>,
  options: ObjectRunOptions<StructuredOutputSchema>,
): Stream.Stream<Event, RunError, RunServices<Tools, HasModel> | StructuredOutputSchema["DecodingServices"]> =>
  streamInternal(agent, options, {
    schema: options.schema,
    objectName: options.objectName ?? "output",
    objectPrompt: options.objectPrompt ?? defaultObjectPrompt,
  })

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
export const generate = <Tools extends Record<string, Tool.Any>, HasModel extends boolean>(
  agent: Agent<Tools, HasModel>,
  options: RunOptions,
): Effect.Effect<Result, RunError, RunServices<Tools, HasModel>> =>
  Stream.runLast(stream(agent, options)).pipe(
    Effect.flatMap(
      Option.match({
        onNone: () => Effect.fail(new AgentError({ message: "Agent run ended without a Completed event", turn: 0 })),
        onSome: (event) =>
          event._tag === "Completed"
            ? Effect.succeed({ text: event.text, turns: event.turns, transcript: event.transcript })
            : Effect.fail(new AgentError({ message: "Agent run ended without a Completed event", turn: 0 })),
      }),
    ),
  )

/** @experimental `streamObject` folded to its `StructuredOutput` and `Completed` events. */
export const generateObject = <
  Tools extends Record<string, Tool.Any>,
  HasModel extends boolean,
  StructuredOutputSchema extends ObjectSchema,
>(
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
          Effect.fail(new AgentError({ message: "Agent object run ended without a Completed event", turn: 0 })),
        onSome: (event) =>
          Option.match(value, {
            onNone: () =>
              Effect.fail(
                new AgentError({
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
  )
