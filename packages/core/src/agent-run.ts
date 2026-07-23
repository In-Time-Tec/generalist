/** @effect-diagnostics missingPipeableSignature:skip-file */
import {
  Cause,
  Channel,
  Effect,
  Equal,
  Exit,
  Fiber,
  HashMap,
  Option,
  Queue,
  Ref,
  Schema,
  Semaphore,
  Stream,
} from "effect"
import { AiError, Chat, LanguageModel, Prompt, Response, Telemetry, Tokenizer, Tool, Toolkit } from "effect/unstable/ai"
import {
  addUsage,
  AgentError,
  AgentSuspended,
  type Completed,
  DuplicateToolCallId,
  type Event,
  MiddlewareViolation,
  ProgressOverflow,
  ResumeMismatch,
  type SteeringDrained,
  type StructuredOutput,
  type ToolProgress,
  ToolNameCollision,
  type TurnCompleted,
  TurnLimitExceeded,
  TurnPolicyStopped,
} from "./agent-event.js"
import { Approvals } from "./approvals.js"
import { coalesceAdjacentText, diagnose as diagnoseSessionSync } from "./session-sync.js"
import { Compaction, type CompactionError, DEFAULT_RESERVE_TOKENS, type Usage } from "./compaction.js"
import { Instructions, openEpoch } from "./instructions.js"
import { classify as classifyContextOverflow } from "./context-overflow.js"
import { type Item, type Key, Memory, type MemoryError, messageFromRecall, projectTranscript } from "./memory.js"
import { ModelMiddleware } from "./model-middleware.js"
import {
  classifyFailure as classifyModelFailure,
  type FailureClassifier,
  type LanguageModelNotRegistered,
  ModelRegistry,
} from "./model-registry.js"
import { instrument, makeIdentityCell } from "./model-instrumentation.js"
import { ModelResilience } from "./model-resilience.js"
import {
  CurrentCompactionId,
  CurrentInstrumentation,
  CurrentPurpose,
  CurrentSummaryCall,
  Delivery,
  DeliveryFailed,
  type Event as ModelTelemetryEvent,
  type EventPayload as ModelTelemetryEventPayload,
  type ModelCallPurpose,
  generateId,
} from "./model-telemetry.js"
import { Permissions, RuleStore } from "./permissions.js"
import {
  type Entry,
  SessionStore,
  SessionConflict,
  type SessionStoreError,
  buildContext,
  buildMemoryContext,
  checkpointMatches,
} from "./session.js"
import { SkillSource, type SkillSourceError, selectListings } from "./skill-source.js"
import { type Input, Steering } from "./steering.js"
import { type AuthorizationError, ToolAuthorizerService, make as makeToolAuthorizer } from "./tool-authorization.js"
import { ToolContext } from "./tool-context.js"
import {
  type DomainFailure,
  FrameworkFailure,
  type Outcome,
  type Request,
  RemoteRetryMisconfigured,
  type Success,
  ToolExecutor,
  executeToolkit,
} from "./tool-executor.js"
import { bound } from "./tool-output.js"
import { type Candidate, type Registry, assemble, get, select } from "./tool-registry.js"
import { type Decision, StopReason, type TurnOverrides, TurnPolicyError } from "./turn-policy.js"

import type { Agent, ProgressOverflowPolicy, RunError, RunOptions } from "./agent.js"
import { Runtime } from "./agent-persistence-lock.js"
import {
  applyPartChain,
  applyPromptChain,
  detachEntry,
  detachPrompt,
  preservesRecalledMessages,
  recalledMessages,
  skillListingsInstructions,
  withSystem,
} from "./agent-message.js"
import {
  activateSkillParameters,
  activateSkillSuccess,
  activateSkillTool,
  activateSkillToolName,
  skillListingBudgetTokens,
} from "./agent-skill-tool.js"
import {
  sameSuspension,
  suspended,
  suspensionCheckpoint,
  suspensionCheckpointOption,
  type SuspensionCheckpoint,
  unresolvedToolCall,
} from "./agent-suspension.js"
import {
  domainFailureResult,
  successResult,
  type AnyToolCall,
  type PendingToolResult,
  type ToolCallIdState,
} from "./agent-tool-result.js"
type CompactionResult = import("./compaction.js").Result
const classifyOtherFailure: FailureClassifier = (error) => classifyContextOverflow(error)
const defaultProgressOverflowPolicy: ProgressOverflowPolicy = { _tag: "Backpressure", capacity: 64 }
const progressCapacitySchema = Schema.Finite.pipe(Schema.check(Schema.isInt(), Schema.isGreaterThan(0)))
const progressOverflowPolicySchema = Schema.Union([
  Schema.TaggedStruct("Backpressure", { capacity: progressCapacitySchema }),
  Schema.TaggedStruct("Dropping", { capacity: progressCapacitySchema }),
  Schema.TaggedStruct("Sliding", { capacity: progressCapacitySchema }),
  Schema.TaggedStruct("Fail", { capacity: progressCapacitySchema }),
])
type ObjectSchema = Schema.Codec<unknown, Record<string, any>, unknown, unknown>
interface StructuredRunConfig<S extends ObjectSchema> {
  readonly schema: S
  readonly objectName: string
  readonly objectPrompt: Prompt.RawInput
}
type StaticToolServices<Tools extends Record<string, Tool.Any>> =
  | Tool.HandlersFor<Tools>
  | Exclude<Tool.HandlerServices<Tools[keyof Tools]>, ToolContext>
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
const steeringDrainedEvent = (
  turn: number,
  queue: SteeringDrained["queue"],
  inputs: ReadonlyArray<Input>,
): SteeringDrained => ({
  _tag: "SteeringDrained",
  turn,
  queue,
  count: inputs.length,
})

export const streamInternal = <Tools extends Record<string, Tool.Any>, R, StructuredOutputSchema extends ObjectSchema>(
  agent: Agent<Tools, R>,
  options: RunOptions,
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
      const runtimeService = yield* Effect.serviceOption(Runtime)
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
                  const runtime = yield* Option.match(runtimeService, {
                    onNone: () =>
                      Effect.fail(
                        AgentError.make({
                          message: "RunOptions.persistence requires Agent.Runtime in context",
                          turn: 0,
                        }),
                      ),
                    onSome: Effect.succeed,
                  })
                  const semaphore = yield* runtime.persistenceSemaphore(service, persistenceOptions.chatId)
                  yield* Effect.acquireRelease(semaphore.take(1), () => semaphore.release(1), {
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
        agent.toolExecution.concurrency !== "unbounded" &&
        (!Number.isSafeInteger(agent.toolExecution.concurrency) || agent.toolExecution.concurrency <= 0)
      ) {
        return yield* AgentError.make({
          message: 'Agent.toolExecution.concurrency must be a positive safe integer or "unbounded"',
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
      const sessionOwnerToken = options.sessionOwnerToken
      const sessionAppendOptions = (expectedLeafId: string | null) =>
        sessionOwnerToken === undefined ? { expectedLeafId } : { expectedLeafId, ownerToken: sessionOwnerToken }

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
          : instructionsEpoch.length === 0
            ? agent.instructions
            : instructionsEpoch)
      const system = appendInstructionFragment(
        baseSystem,
        options.history === undefined && skillListings.length > 0
          ? skillListingsInstructions(skillListings)
          : undefined,
      )

      const resilienceService = yield* Effect.serviceOption(ModelResilience)
      const deliveryService = yield* Effect.serviceOption(Delivery)
      const telemetryRunId = yield* generateId
      let telemetrySequence = 0
      const pendingTelemetry: Array<ModelTelemetryEvent> = []
      const undeliveredTelemetry: Array<ModelTelemetryEvent> = []
      const emitTelemetry = (payload: ModelTelemetryEventPayload): Effect.Effect<void> =>
        Effect.sync(() => {
          const event = { ...payload, deliveryId: `${telemetryRunId}:${telemetrySequence++}` } as ModelTelemetryEvent
          pendingTelemetry.push(event)
          undeliveredTelemetry.push(event)
        })
      const flushTelemetry = (): ReadonlyArray<Event> => pendingTelemetry.splice(0, pendingTelemetry.length)
      const deliverPending = (): Effect.Effect<void, import("./model-telemetry.js").DeliveryFailed> => {
        if (Option.isNone(deliveryService) || undeliveredTelemetry.length === 0) return Effect.void
        const snapshot = Object.freeze([...undeliveredTelemetry])
        return deliveryService.value.deliver({ sessionId, events: snapshot }).pipe(
          Effect.onError(() =>
            Effect.sync(() => {
              pendingTelemetry.splice(0, pendingTelemetry.length)
            }),
          ),
          Effect.tap(() =>
            Effect.sync(() => {
              undeliveredTelemetry.splice(0, snapshot.length)
            }),
          ),
        )
      }
      const telemetryIdentity = makeIdentityCell()
      const instrumentModel = (model: LanguageModel.Service, turn: number): LanguageModel.Service =>
        instrument(model, {
          emit: emitTelemetry,
          turn,
          identity: telemetryIdentity,
          ...(Option.isSome(resilienceService) ? { resilience: resilienceService.value } : {}),
        })
      const modelRegistryService = yield* Effect.serviceOption(ModelRegistry)
      const permissionsService = yield* Effect.serviceOption(Permissions)
      const ruleStoreService = yield* Effect.serviceOption(RuleStore)
      const authorizationService = yield* Effect.serviceOption(ToolAuthorizerService)
      const steeringService = yield* Effect.serviceOption(Steering)
      const memoryService = yield* Effect.serviceOption(Memory)
      const tokenizerService = yield* Effect.serviceOption(Tokenizer.Tokenizer)
      const defaultRules = yield* Ref.make<ReadonlyArray<import("./permissions.js").Rule>>([])
      const authorizer =
        agent.authorization ??
        Option.getOrElse(authorizationService, () =>
          makeToolAuthorizer({
            permissions: Option.getOrElse(permissionsService, () =>
              Permissions.of({ evaluate: () => Effect.succeed({ _tag: "Allow" }) }),
            ),
            approvals: Option.getOrElse(approvals, () =>
              Approvals.of({ resolve: () => Effect.succeed({ _tag: "Approved" }) }),
            ),
            ruleStore: Option.getOrElse(ruleStoreService, () =>
              RuleStore.of({
                rules: Ref.get(defaultRules),
                remember: (rule) =>
                  Ref.update(defaultRules, (rules) => [
                    ...rules.filter((current) => current.pattern !== rule.pattern),
                    rule,
                  ]),
              }),
            ),
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
      ): Effect.Effect<Prompt.Prompt, RunError> =>
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
            ...(suspension.tool_call_index === undefined ? {} : { tool_call_index: suspension.tool_call_index }),
            tool_call_batch_ids: suspension.tool_call_batch.map((call) => call.id),
            ...(suspension.active_tools === undefined ? {} : { active_tools: suspension.active_tools }),
            ...(suspension.activated_skills === undefined ? {} : { activated_skills: suspension.activated_skills }),
          }
          const messages = withPending.content.map((message, messageIndex): Prompt.Message => {
            if (message.role !== "assistant") return message
            return Prompt.makeMessage("assistant", {
              content: message.content.map((part, partIndex): Prompt.AssistantMessagePart => {
                if (part.type !== "tool-call") return part
                const partOptions = { ...part.options }
                delete partOptions[suspensionCheckpointOption]
                if (messageIndex === unresolved.messageIndex && partIndex === unresolved.partIndex) {
                  partOptions[suspensionCheckpointOption] = metadata
                }
                return Prompt.makePart("tool-call", {
                  id: part.id,
                  name: part.name,
                  params: part.params,
                  providerExecuted: part.providerExecuted,
                  options: partOptions,
                })
              }),
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

      const state = {
        text: "",
        turn: 0,
        pending: new Map<number, PendingToolResult>(),
        finish: undefined as { readonly usage: Response.Usage; readonly reason: Response.FinishReason } | undefined,
        usage: undefined as Response.Usage | undefined,
      }

      const pendingResults = (): ReadonlyArray<PendingToolResult> =>
        [...state.pending.entries()].toSorted(([left], [right]) => left - right).map(([, result]) => result)

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
      const canonicalEquivalence = (left: Prompt.Message, right: Prompt.Message): boolean =>
        messageEquivalence(coalesceAdjacentText(left), coalesceAdjacentText(right))
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
              canonicalEquivalence(message, transcript[start + index] as Prompt.Message),
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
                  diagnostics: diagnoseSessionSync({
                    sessionId,
                    ...(sessionOwnerToken === undefined ? {} : { ownerToken: sessionOwnerToken }),
                    durableEntryTags: path.map((entry) => entry._tag),
                    projection: projection.content,
                    transcript: transcript.content,
                  }),
                })
              }
              let expectedLeafId = path.at(-1)?.id ?? null
              for (const message of transcript.content.slice(cursor.value)) {
                const appended = yield* session.append(
                  { _tag: "Message", message },
                  sessionAppendOptions(expectedLeafId),
                )
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
        commitData?: Omit<import("./model-telemetry.js").CompactionCommit, "checkpointId" | "summaryModelCallId">,
      ): Effect.Effect<void, RunError> =>
        Option.match(activeSession, {
          onNone: () => deliverPending().pipe(Effect.andThen(Ref.set(chat.history, result.history))),
          onSome: (session) =>
            Effect.gen(function* () {
              const id = yield* session.reserveEntryId
              const telemetry = Object.freeze([...undeliveredTelemetry])
              const completed: Extract<ModelTelemetryEvent, { readonly _tag: "CompactionCompleted" }> | undefined =
                commitData === undefined
                  ? undefined
                  : (telemetry.findLast(
                      (event) => event._tag === "CompactionCompleted" && event.compactionId === commitData.compactionId,
                    ) as Extract<ModelTelemetryEvent, { readonly _tag: "CompactionCompleted" }> | undefined)
              if (commitData !== undefined && completed === undefined) {
                return yield* AgentError.make({
                  message: `Changed custom compaction ${commitData.compactionId} did not emit CompactionCompleted`,
                  turn,
                })
              }
              const compactionCommit =
                commitData === undefined
                  ? undefined
                  : {
                      ...commitData,
                      checkpointId: id,
                      ...(completed?.summaryModelCallId === undefined
                        ? {}
                        : { summaryModelCallId: completed.summaryModelCallId }),
                    }
              yield* Effect.uninterruptibleMask((restore) =>
                restore(
                  session
                    .appendCheckpoint({
                      id,
                      parentId,
                      projectedHistory: result.history,
                      telemetry,
                      ...(compactionCommit === undefined ? {} : { compactionCommit }),
                      ...(result._tag === "Summarize" ? { summary: result.summary } : {}),
                      ...(sessionOwnerToken === undefined ? {} : { ownerToken: sessionOwnerToken }),
                    })
                    .pipe(
                      Effect.filterOrFail(
                        (appended) =>
                          checkpointMatches(appended.checkpoint, {
                            id,
                            parentId,
                            projectedHistory: result.history,
                            telemetry,
                            ...(compactionCommit === undefined ? {} : { compactionCommit }),
                            ...(result._tag === "Summarize" ? { summary: result.summary } : {}),
                          }),
                        () =>
                          SessionConflict.make({
                            reason: "checkpoint-id-reused",
                            message: `Session returned a non-matching checkpoint ${id}`,
                          }),
                      ),
                    ),
                ).pipe(
                  Effect.tap(() =>
                    Effect.sync(() => {
                      undeliveredTelemetry.splice(0, telemetry.length)
                    }),
                  ),
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
        RunError,
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
              const compactionId = yield* generateId
              const compacted = yield* Effect.scoped(
                compaction.maybeCompact({
                  compactionId,
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
                }),
              ).pipe(Effect.mapError((error) => compactionError(turn, error)))
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
              const after = Prompt.concat(compacted.value.history, compacted.value.prompt)
              const contextTokensAfter = yield* Effect.option(countTokens(turn, after))
              yield* applyCompactionResult(turn, compacted.value, path.at(-1)?.id ?? null, {
                compactionId,
                contextTokensBefore: usage.contextTokens,
                ...(Option.isSome(contextTokensAfter) ? { contextTokensAfter: contextTokensAfter.value } : {}),
                entriesBefore: Prompt.concat(history, prompt).content.length,
                entriesAfter: after.content.length,
              })
              return { prompt: compacted.value.prompt, changed: true }
            }),
        })

      const boundedSuccessResult = (call: AnyToolCall, outcome: Success): Effect.Effect<PendingToolResult> =>
        options.toolOutputMaxBytes === undefined
          ? Effect.succeed(successResult(call, outcome))
          : bound(outcome, { toolCallId: call.id, maxBytes: options.toolOutputMaxBytes }).pipe(
              Effect.map((bounded) => successResult(call, bounded)),
            )

      const outcomeEvent = (
        turn: number,
        toolCallBatch: Request["toolCallBatch"],
        toolCallIndex: number,
        call: AnyToolCall,
        outcome: Outcome,
        droppedProgress: number,
        registry: Registry,
      ): Effect.Effect<Event, RunError> => {
        const metadata = droppedProgress === 0 ? {} : { metadata: { toolProgress: { dropped: droppedProgress } } }
        const completed = (result: PendingToolResult): Effect.Effect<Event> =>
          Effect.sync(() => {
            state.pending.set(toolCallIndex, result)
            return { _tag: "ToolExecutionCompleted", turn, call, result, ...metadata }
          })
        switch (outcome._tag) {
          case "Success":
            return (
              isSkillActivationCall(call, registry)
                ? Effect.succeed(successResult(call, outcome))
                : boundedSuccessResult(call, outcome)
            ).pipe(Effect.flatMap(completed))
          case "DomainFailure":
            return completed(domainFailureResult(call, outcome))
          case "Suspend":
            return Effect.fail(suspended(call, toolCallBatch, toolCallIndex, outcome.token, "tool-wait"))
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

      const makeProgressQueue = (): Effect.Effect<Queue.Queue<ToolProgress, Cause.Done | ProgressOverflow>> => {
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
                          ProgressOverflow.make({ turn, toolCallId: call.id, capacity: progressPolicy.capacity }),
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
                          Schema.is(RemoteRetryMisconfigured)(error)
                            ? AgentError.make({ message: error.message, turn, cause: error })
                            : error,
                        ),
                      )
              const fiber = yield* Effect.uninterruptibleMask((restore) =>
                restore(execution.pipe(Effect.provideService(ToolContext, context))).pipe(
                  Effect.flatMap((outcome) =>
                    Ref.get(droppedProgress).pipe(
                      Effect.flatMap((dropped) =>
                        outcomeEvent(
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
              ).pipe(
                Effect.ensuring(Queue.end(progressQueue).pipe(Effect.asVoid)),
                Effect.forkScoped({ startImmediately: true }),
              )
              return Stream.concat(Stream.fromQueue(progressQueue), Stream.fromEffect(Fiber.join(fiber)))
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
                agentName: agent.name,
                turn,
                sessionId,
                tool: candidate.tool,
                active: true,
                activeTools,
                activatedSkills,
                messages,
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

      const withModelTelemetry =
        (turn: number, purpose: ModelCallPurpose) =>
        <A, E, R2>(effect: Effect.Effect<A, E, R2>) =>
          Effect.flatMap(LanguageModel.LanguageModel, (model) =>
            effect.pipe(
              Effect.provideService(LanguageModel.LanguageModel, instrumentModel(model, turn)),
              Effect.provideService(CurrentPurpose, purpose),
            ),
          )

      const withAgentModel = <A, E, R2>(
        effect: Effect.Effect<A, E, R2>,
      ): Effect.Effect<A, E | LanguageModelNotRegistered, R2> =>
        agentModelRegistry === undefined || agentModel === undefined
          ? effect
          : agentModelRegistry.operate(agentModel, effect)

      function provideAgentModel<A, E, R2>(stream: Stream.Stream<A, E, R2>): Stream.Stream<A, E, R2 | ModelRegistry>
      function provideAgentModel<A, E, R2>(
        stream: Stream.Stream<A, E, R2>,
      ): Stream.Stream<A, E | AgentError, R2 | ModelRegistry> {
        return agentModelRegistry === undefined || agentModel === undefined
          ? stream
          : agentModelRegistry
              .stream(agentModel, stream)
              .pipe(
                Stream.catchTag("@batonfx/core/LanguageModelNotRegistered", (error) =>
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
        const identity = telemetryIdentity.current
        if (identity === undefined) {
          return Stream.fromEffect(Effect.die(new Error("ModelPart produced outside an instrumented model attempt")))
        }
        const modelPart = Stream.fromIterable<Event>([
          {
            _tag: "ModelPart",
            turn,
            modelCallId: identity.modelCallId,
            modelAttemptId: identity.modelAttemptId,
            attempt: identity.attempt,
            part,
          },
        ])
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
        const instrumentTurnStream = <A, E>(
          stream: Stream.Stream<A, E, LanguageModel.LanguageModel>,
        ): Stream.Stream<A, E, LanguageModel.LanguageModel> =>
          Stream.unwrap(
            LanguageModel.LanguageModel.pipe(
              Effect.map((model) =>
                stream.pipe(
                  Stream.provideService(LanguageModel.LanguageModel, instrumentModel(model, turn)),
                  Stream.provideService(CurrentInstrumentation, {
                    emit: emitTelemetry,
                    wrap: (summaryModel) => instrumentModel(summaryModel, turn),
                  }),
                ),
              ),
            ),
          )
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
            if (Option.isNone(failure)) return false
            const classifiedFailure =
              Schema.is(AgentError)(failure.value) && failure.value.cause !== undefined
                ? failure.value.cause
                : failure.value
            return (
              retryOverflow &&
              !hasEmitted &&
              Option.isSome(compactionService) &&
              classifyFailure(classifiedFailure) === "context-overflow"
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
                    const coalescedContent = prepared.prompt.content.map(coalesceAdjacentText)
                    const preparedPrompt = coalescedContent.some(
                      (message, index) => message !== prepared.prompt.content[index],
                    )
                      ? Prompt.fromMessages(coalescedContent)
                      : prepared.prompt
                    const history = yield* Ref.get(chat.history)
                    preparedState = { history, preparedPrompt }
                    const responsePrompt = Prompt.concat(history, preparedPrompt)
                    const messages = responsePrompt.content
                    const rawParts = LanguageModel.streamText({
                      prompt: responsePrompt,
                      toolkit: activeRegistry.toolkit,
                      disableToolCallResolution: true,
                    }).pipe(
                      Stream.mapEffect((part) =>
                        part.type === "error"
                          ? Effect.fail(
                              isToolNameCollision(part.error)
                                ? part.error
                                : AgentError.make({ message: errorMessage(part.error), turn, cause: part.error }),
                            )
                          : Effect.succeed(part),
                      ),
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
                        if (Schema.is(AgentError)(error.value) || isToolNameCollision(error.value)) {
                          return Stream.fail(error.value)
                        }
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
              const accepted = instrumentTurnStream(attempt(transformedPrompt, true)).pipe(
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
                      )
                }),
              )
            }),
          ),
        )
        return overrides?.model === undefined ? provideAgentModel(parts) : parts.pipe(Stream.provide(overrides.model))
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
              withModelTelemetry(structuredTurn, "structured-output"),
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
            const structuredIdentity = telemetryIdentity.current
            if (structuredIdentity === undefined) {
              return yield* Effect.die(new Error("Structured output model attempt identity is missing"))
            }
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
              ...structuredIdentity,
              value: response.value,
              content: response.content as ReadonlyArray<Response.Part<Record<string, Tool.Any>>>,
            }
            return [structuredOutput, terminalCompletedEvent(structuredTurn, transcript)]
          }),
        ).pipe(Stream.flatMap((events) => Stream.fromIterable<Event>(events)))

      const promptFromSteeringInputs = (inputs: ReadonlyArray<Input>): Prompt.Prompt =>
        inputs.reduce<Prompt.Prompt>((prompt, input) => Prompt.concat(prompt, input.prompt), Prompt.empty)

      const takeSteering = (): Effect.Effect<ReadonlyArray<Input>> =>
        Option.match(steeringService, {
          onNone: () => Effect.succeed([]),
          onSome: (service) => service.takeSteering,
        })

      const takeFollowUp = (): Effect.Effect<ReadonlyArray<Input>> =>
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
          const pending = pendingResults()
          const transcript = yield* checkpointPending(turn, pending)
          const path = yield* syncSession(turn, transcript)
          yield* rememberTurn(turn, transcript, pending.length === 0, path)
          const completed: Event = turnCompletedEvent(turn, transcript)
          if (pending.length === 0) {
            const followUp = yield* takeFollowUp()
            if (followUp.length > 0) {
              return {
                events: Stream.fromIterable<Event>([completed, steeringDrainedEvent(turn, "followUp", followUp)]),
                next: { prompt: promptFromSteeringInputs(followUp) },
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
              message: "TurnPolicy returned an invalid decision; Stop decisions must include a reason",
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
          state.pending.clear()
          const steering = yield* takeSteering()
          const basePrompt = steering.length === 0 ? Prompt.empty : promptFromSteeringInputs(steering)
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
                    suspension.active_tools === undefined
                      ? tools.registry
                      : select(tools.registry, suspension.active_tools)
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
                  const suspendedIndex = suspension.tool_call_index ?? 0
                  if (calls[suspendedIndex] === undefined) {
                    return Stream.fail(
                      AgentError.make({ message: "Suspension tool call index is outside its batch", turn: 0 }),
                    )
                  }
                  const executions = Stream.fromIterable(
                    checkpoint.unresolvedToolCallIndexes.map((toolCallIndex) => ({
                      call: calls[toolCallIndex] as AnyToolCall,
                      toolCallIndex,
                    })),
                  )
                  const execute = ({
                    call,
                    toolCallIndex,
                  }: {
                    readonly call: AnyToolCall
                    readonly toolCallIndex: number
                  }) => toolCallEvents(0, toolCallBatch, toolCallIndex, call, checkpoint.messages, registry)
                  const concurrency = agent.toolExecution?.concurrency ?? 1
                  return concurrency === 1
                    ? executions.pipe(Stream.flatMap(execute))
                    : executions.pipe(
                        Stream.mapEffect((execution) => Stream.runCollect(execute(execution)), { concurrency }),
                        Stream.flatMap(Stream.fromIterable),
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
      const guardedStream = runStream.pipe(
        Stream.catchCause((cause) => {
          const reason = cause.reasons.length === 1 ? cause.reasons[0] : undefined
          if (reason !== undefined && Cause.isFailReason(reason) && Schema.is(DuplicateToolCallId)(reason.error)) {
            return Stream.unwrap(
              checkpointPending(state.turn, pendingResults()).pipe(Effect.map(() => Stream.failCause<RunError>(cause))),
            )
          }
          if (reason !== undefined && Cause.isFailReason(reason) && Schema.is(AgentSuspended)(reason.error)) {
            const suspension = reason.error
            return Stream.unwrap(
              Effect.gen(function* () {
                const checkpoint = yield* checkpointSuspended(state.turn, pendingResults(), suspension)
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
      return guardedStream.pipe(
        Stream.provideService(CurrentInstrumentation, undefined),
        Stream.provideService(CurrentPurpose, "conversation"),
        Stream.provideService(CurrentCompactionId, undefined),
        Stream.provideService(CurrentSummaryCall, undefined),
        Stream.mapEffect(
          (event): Effect.Effect<ReadonlyArray<Event>, RunError> =>
            deliverPending().pipe(Effect.map(() => [...flushTelemetry(), event])),
        ),
        Stream.flattenIterable,
        Stream.concat(Stream.unwrap(deliverPending().pipe(Effect.map(() => Stream.fromIterable(flushTelemetry()))))),
        Stream.catchCause((cause) => {
          if (Cause.hasInterrupts(cause)) return Stream.failCause<RunError>(cause)
          const reason = cause.reasons.length === 1 ? cause.reasons[0] : undefined
          if (reason !== undefined && Cause.isFailReason(reason) && Schema.is(DeliveryFailed)(reason.error)) {
            return Stream.failCause<RunError>(cause)
          }
          return Stream.unwrap(
            deliverPending().pipe(
              Effect.map(() => Stream.concat(Stream.fromIterable(flushTelemetry()), Stream.failCause<RunError>(cause))),
            ),
          )
        }),
      )
    }),
  ).pipe(Stream.withSpan("Baton.Agent.run", { attributes: { "baton.agent.name": agent.name } }))
