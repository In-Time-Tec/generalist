import { Clock, Effect, Function, Option, Ref, Schema } from "effect"
import { LanguageModel, Tokenizer, Tool } from "effect/unstable/ai"
import { AgentError, type Event as AgentEvent } from "../event.js"
import { Approvals } from "../../policy/approvals.js"
import { type Key, Memory } from "../../context/memory.js"
import { ModelMiddleware } from "../../model/middleware.js"
import { ActiveModelResponse } from "../../model/result/active-model-response.js"
import { ModelRegistry } from "../../model/registry.js"
import { instrument, type IdentityCell } from "../../model/instrumentation.js"
import { ModelResilience, defaultPolicy as defaultModelResilience } from "../../model/resilience.js"
import {
  Delivery,
  InvocationCoordinator,
  type Event as ModelTelemetryEvent,
  type EventPayload as ModelTelemetryEventPayload,
  generateId,
} from "../../model/telemetry/events.js"
import { Permissions, RuleStore } from "../../policy/permissions.js"
import { restoreCheckpointTelemetry } from "../session/history.js"
import { Steering } from "../../turn/steering.js"
import { ToolAuthorizerService, make as makeToolAuthorizer } from "../../tools/tool-authorization.js"
import { ToolExecutor } from "../../tools/tool-executor.js"
import { LoopDriverState, modelCallOrdinal as checkpointModelCallOrdinal } from "../../durable/loop-driver-state.js"
import type { Agent, RunOptions } from "../service.js"
import { SetupHelpers, setupStaticTools } from "./construction.js"
import { recoverToolCheckpoint } from "../tools/checkpoint-recovery.js"
import { SetupOptions } from "./options.js"
import { setupChat, setupPersistence } from "./persistence.js"
import { setupPromptContext } from "./resume.js"
const { errorMessage } = SetupHelpers

const setupRunImpl = <T extends Record<string, Tool.Any>, R>(agent: Agent<T, R>, options: RunOptions) =>
  Effect.gen(function* () {
    const persistence = yield* setupPersistence(options)
    const {
      persistenceOptions,
      resume,
      persistenceService,
      runtimeService,
      compactionService,
      sessionService,
      activeSession,
      persisted,
      recoveredHistory,
      resumeChat,
      validatedResume,
    } = persistence
    const { staticCandidates, staticRegistry, staticToolkit } = yield* setupStaticTools(agent)
    const executor = yield* Effect.serviceOption(ToolExecutor)
    const approvals = yield* Effect.serviceOption(Approvals)
    const chain = yield* Effect.serviceOption(ModelMiddleware).pipe(
      Effect.map(Option.match({ onNone: () => [], onSome: (service) => service })),
    )
    const activeModelResponse = yield* Effect.serviceOption(ActiveModelResponse)
    const progressPolicy = yield* SetupOptions.validate(options, agent)

    const sessionId = options.sessionId ?? "local"
    const sessionOwnerToken = options.sessionOwnerToken
    const sessionAppendOptions = (expectedLeafId: string | null) =>
      sessionOwnerToken === undefined ? { expectedLeafId } : { expectedLeafId, ownerToken: sessionOwnerToken }

    const promptContext = yield* setupPromptContext({ agent, options, activeSession, resumeChat, staticCandidates })
    const {
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
      supplemental,
    } = promptContext

    const configuredResilience = yield* Effect.serviceOption(ModelResilience)
    const resilienceService = Option.orElse(configuredResilience, () =>
      Option.some(ModelResilience.of(defaultModelResilience)),
    )
    const deliveryService = yield* Effect.serviceOption(Delivery)
    const invocationCoordinator = yield* Effect.serviceOption(InvocationCoordinator)
    const telemetryRunId = yield* generateId
    let telemetrySequence = 0
    const pendingTelemetry: Array<ModelTelemetryEvent> = []
    const undeliveredTelemetry: Array<ModelTelemetryEvent> = []
    const prepareTelemetry = (payload: ModelTelemetryEventPayload): ModelTelemetryEvent => ({
      ...payload,
      deliveryId: `${telemetryRunId}:${telemetrySequence++}`,
    })
    const publishTelemetry = (event: ModelTelemetryEvent): void => {
      if (undeliveredTelemetry.some((current) => current.deliveryId === event.deliveryId)) return
      pendingTelemetry.push(event)
      undeliveredTelemetry.push(event)
    }
    if (options.driverCheckpoint !== undefined && Option.isSome(sessionService)) {
      yield* restoreCheckpointTelemetry({ session: sessionService.value, undelivered: undeliveredTelemetry }).pipe(
        Effect.mapError((error) => AgentError.make({ message: errorMessage(error), turn: 0, cause: error })),
      )
    }
    const emitTelemetry = (payload: ModelTelemetryEventPayload): Effect.Effect<void> =>
      Effect.sync(() => {
        publishTelemetry(prepareTelemetry(payload))
      })
    const flushTelemetry = (): ReadonlyArray<AgentEvent> => pendingTelemetry.splice(0, pendingTelemetry.length)
    const deliverPending: Effect.Effect<void, import("../../model/telemetry/events.js").DeliveryFailed> =
      Effect.suspend(() => {
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
      })
    const telemetryIdentity: IdentityCell = { current: undefined }
    const restoredModelCallOrdinal =
      options.driverCheckpoint === undefined
        ? undefined
        : yield* Schema.decodeUnknownEffect(LoopDriverState)(options.driverCheckpoint.state).pipe(
            Effect.map(checkpointModelCallOrdinal),
            Effect.mapError((error) =>
              AgentError.make({ message: `Invalid model call ordinal checkpoint: ${String(error)}`, turn: 0 }),
            ),
          )
    let modelCallOrdinal = restoredModelCallOrdinal ?? options.modelCallOrdinalStart ?? 0
    const clock = yield* Clock.Clock
    const instrumentModel = (model: LanguageModel.Service, turn: number): LanguageModel.Service => {
      const baseInstrumentation = {
        clock,
        emit: emitTelemetry,
        turn,
        identity: telemetryIdentity,
        nextCallOrdinal: (persistedOrdinal: number | undefined) => {
          if (persistedOrdinal === undefined) return modelCallOrdinal++
          modelCallOrdinal = Math.max(modelCallOrdinal, persistedOrdinal + 1)
          return persistedOrdinal
        },
      }
      const withLogicalId =
        options.logicalOperationId === undefined
          ? baseInstrumentation
          : { ...baseInstrumentation, logicalOperationId: options.logicalOperationId }
      const withCoordinator = Option.isNone(invocationCoordinator)
        ? withLogicalId
        : { ...withLogicalId, coordinator: invocationCoordinator.value }
      const instrumentation = Option.isNone(resilienceService)
        ? withCoordinator
        : { ...withCoordinator, resilience: resilienceService.value }
      return instrument(model, instrumentation)
    }
    const modelRegistryService = yield* Effect.serviceOption(ModelRegistry)
    const permissionsService = yield* Effect.serviceOption(Permissions)
    const ruleStoreService = yield* Effect.serviceOption(RuleStore)
    const authorizationService = yield* Effect.serviceOption(ToolAuthorizerService)
    const steeringService = yield* Effect.serviceOption(Steering)
    const memoryService = yield* Effect.serviceOption(Memory)
    const tokenizerService = yield* Effect.serviceOption(Tokenizer.Tokenizer)
    const defaultRules = yield* Ref.make<ReadonlyArray<import("../../policy/permissions.js").Rule>>([])
    const authorizer =
      agent.authorization ??
      Option.getOrElse(authorizationService, () =>
        makeToolAuthorizer({
          permissions: Option.getOrElse(permissionsService, () =>
            Permissions.of({ evaluate: () => Effect.succeed({ _tag: "Allow" }) }),
          ),
          approvals: Option.getOrElse(approvals, () => Approvals.of({ resolve: (pending) => Effect.succeed(pending) })),
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
    const { seedSystem, freshChat, chat } = yield* setupChat({
      options,
      activeSession,
      persisted,
      resumeChat,
      system,
      supplemental,
    })
    return {
      persistenceOptions,
      resume,
      persistenceService,
      runtimeService,
      compactionService,
      sessionService,
      activeSession,
      persisted,
      recoveredHistory,
      resumeChat,
      validatedResume,
      recoveredToolCheckpoint: yield* recoverToolCheckpoint({ options, chat }),
      staticCandidates,
      staticRegistry,
      staticToolkit,
      executor,
      approvals,
      chain,
      activeModelResponse,
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
      supplemental,
      resilienceService,
      deliveryService,
      invocationCoordinator,
      telemetryRunId,
      telemetrySequence,
      pendingTelemetry,
      undeliveredTelemetry,
      emitTelemetry,
      prepareTelemetry,
      publishTelemetry,
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
    }
  })
type SetupEffect<T extends Record<string, Tool.Any>, R> = ReturnType<typeof setupRunImpl<T, R>>
export const setupRun: {
  <T extends Record<string, Tool.Any>, R>(options: RunOptions): (agent: Agent<T, R>) => SetupEffect<T, R>
  <T extends Record<string, Tool.Any>, R>(agent: Agent<T, R>, options: RunOptions): SetupEffect<T, R>
} = Function.dual(2, setupRunImpl)
