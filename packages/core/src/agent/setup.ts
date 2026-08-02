import { Effect, Option, Ref, Schema } from "effect"
import { Chat, LanguageModel, Prompt, Tokenizer, Tool } from "effect/unstable/ai"
import { AgentError, type Event as AgentEvent, ResumeMismatch } from "./agent-event.js"
import { Approvals } from "../policy/approvals.js"
import { Compaction } from "../turn/compaction.js"
import { Instructions, openEpoch } from "../context/instructions.js"
import { type Key, Memory } from "../context/memory.js"
import { ModelMiddleware } from "../model/model-middleware.js"
import { ModelRegistry } from "../model/model-registry.js"
import { instrument, makeIdentityCell } from "../model/model-instrumentation.js"
import { ModelResilience } from "../model/model-resilience.js"
import {
  Delivery,
  InvocationCoordinator,
  type Event as ModelTelemetryEvent,
  type EventPayload as ModelTelemetryEventPayload,
  generateId,
} from "../model/model-telemetry.js"
import { Permissions, RuleStore } from "../policy/permissions.js"
import { SessionStore, buildContext } from "../context/session.js"
import { SkillSource, selectListings } from "../context/skill-source.js"
import { Steering } from "../turn/steering.js"
import { ToolAuthorizerService, make as makeToolAuthorizer } from "../tools/tool-authorization.js"
import { ToolExecutor } from "../tools/tool-executor.js"
import { type Candidate, assemble } from "../tools/tool-registry.js"
import type { Agent, ProgressOverflowPolicy, RunOptions } from "./agent.js"
import { Runtime } from "./agent-persistence-lock.js"
import { activateSkillTool, skillListingBudgetTokens } from "./agent-skill-tool.js"
import { sameSuspension, suspensionCheckpoint, type SuspensionCheckpoint } from "./agent-suspension.js"
import { skillListingsInstructions } from "./agent-message.js"
import { emptyAgentRunResources } from "./agent-run-resources.js"

type StaticDeclaration = { readonly origin: import("./agent-event.js").ToolOrigin; readonly tool: Tool.Any }
const errorMessage = (error: unknown): string =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error)

const appendInstructionFragment = (base: string | undefined, fragment: string | undefined): string | undefined => {
  if (fragment === undefined || fragment.length === 0) return base
  if (base === undefined || base.length === 0) return fragment
  return `${base}\n\n${fragment}`
}
const defaultProgressOverflowPolicy = { _tag: "Backpressure", capacity: 64 } as const
const progressCapacitySchema = Schema.Finite.pipe(Schema.check(Schema.isInt(), Schema.isGreaterThan(0)))
const progressOverflowPolicySchema = Schema.Union([
  Schema.TaggedStruct("Backpressure", { capacity: progressCapacitySchema }),
  Schema.TaggedStruct("Dropping", { capacity: progressCapacitySchema }),
  Schema.TaggedStruct("Sliding", { capacity: progressCapacitySchema }),
  Schema.TaggedStruct("Fail", { capacity: progressCapacitySchema }),
])

export const setupRun = <T extends Record<string, Tool.Any>, R>(agent: Agent<T, R>, options: RunOptions) =>
  Effect.gen(function* () {
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

    const staticDeclarations: ReadonlyArray<StaticDeclaration> =
      agent.toolDeclarations ??
      Object.values(agent.toolkit.tools).map((tool) => ({
        tool,
        origin: { _tag: "Static" as const, agent: agent.name },
      }))
    const staticCandidates: ReadonlyArray<Candidate> = staticDeclarations.map(({ origin, tool }) => ({
      origin,
      tool,
      dispatch: "Static",
    }))
    const staticRegistry = yield* assemble(staticCandidates)
    const staticToolkit = staticRegistry.toolkit
    if (
      agent.toolDeclarations !== undefined &&
      (agent.toolDeclarations.length !== Object.keys(agent.toolkit.tools).length ||
        agent.toolDeclarations.some(
          (declaration: import("./agent.js").ToolDeclaration) =>
            agent.toolkit.tools[declaration.tool.name] !== declaration.tool,
        ))
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
    if (
      options.modelCallOrdinalStart !== undefined &&
      (!Number.isSafeInteger(options.modelCallOrdinalStart) || options.modelCallOrdinalStart < 0)
    ) {
      return yield* AgentError.make({
        message: "RunOptions.modelCallOrdinalStart must be a non-negative safe integer",
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
      options.history === undefined && skillListings.length > 0 ? skillListingsInstructions(skillListings) : undefined,
    )

    const resilienceService = yield* Effect.serviceOption(ModelResilience)
    const deliveryService = yield* Effect.serviceOption(Delivery)
    const invocationCoordinator = yield* Effect.serviceOption(InvocationCoordinator)
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
    const flushTelemetry = (): ReadonlyArray<AgentEvent> => pendingTelemetry.splice(0, pendingTelemetry.length)
    const deliverPending = (): Effect.Effect<void, import("../model/model-telemetry.js").DeliveryFailed> => {
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
    let modelCallOrdinal = options.modelCallOrdinalStart ?? 0
    const instrumentModel = (model: LanguageModel.Service, turn: number): LanguageModel.Service =>
      instrument(model, {
        emit: emitTelemetry,
        turn,
        identity: telemetryIdentity,
        nextCallOrdinal: () => modelCallOrdinal++,
        ...(options.logicalOperationId === undefined ? {} : { logicalOperationId: options.logicalOperationId }),
        ...(Option.isSome(invocationCoordinator) ? { coordinator: invocationCoordinator.value } : {}),
        ...(Option.isSome(resilienceService) ? { resilience: resilienceService.value } : {}),
      })
    const modelRegistryService = yield* Effect.serviceOption(ModelRegistry)
    const permissionsService = yield* Effect.serviceOption(Permissions)
    const ruleStoreService = yield* Effect.serviceOption(RuleStore)
    const authorizationService = yield* Effect.serviceOption(ToolAuthorizerService)
    const steeringService = yield* Effect.serviceOption(Steering)
    const memoryService = yield* Effect.serviceOption(Memory)
    const tokenizerService = yield* Effect.serviceOption(Tokenizer.Tokenizer)
    const defaultRules = yield* Ref.make<ReadonlyArray<import("../policy/permissions.js").Rule>>([])
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
    const runResources = emptyAgentRunResources(chat, yield* Effect.scope)
    return {
      persistenceOptions,
      resume,
      persistenceService,
      runtimeService,
      compactionService,
      sessionService,
      persisted,
      recoveredHistory,
      resumeChat,
      validatedResume,
      staticCandidates,
      staticRegistry,
      staticToolkit,
      executor,
      approvals,
      chain,
      progressPolicy,
      sessionId,
      sessionOwnerToken,
      sessionAppendOptions,
      instructionsService,
      skillSourceService,
      skillRuntime,
      selectedSkills,
      skillListings,
      hasActivatableSkills,
      initialRegistry,
      instructionsEpoch,
      baseSystem,
      system,
      resilienceService,
      deliveryService,
      invocationCoordinator,
      telemetryRunId,
      telemetrySequence,
      pendingTelemetry,
      undeliveredTelemetry,
      emitTelemetry,
      flushTelemetry,
      deliverPending,
      telemetryIdentity,
      modelCallOrdinal,
      instrumentModel,
      modelRegistryService,
      permissionsService,
      ruleStoreService,
      authorizationService,
      steeringService,
      memoryService,
      tokenizerService,
      defaultRules,
      authorizer,
      memoryOptions,
      agentModel,
      agentModelRegistry,
      memoryRuntime,
      seedSystem,
      freshChat,
      chat,
      runResources,
    }
  })
