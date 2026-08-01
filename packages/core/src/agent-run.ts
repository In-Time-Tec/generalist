// @ts-nocheck
/* oxlint-disable */
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
  RunEndedWithoutOutput,
  type SteeringDrained,
  type StructuredOutput,
  type ToolProgress,
  ToolNameCollision,
  type TurnCompleted,
  TurnLimitExceeded,
  TurnPolicyStopped,
} from "./agent-event.js"
import { Approvals } from "./approvals.js"
import { coalesceAdjacentText, diagnose as diagnoseSessionSync, equivalentMessages } from "./session-sync.js"
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
  InvalidToolCallParameters,
  isInvalidToolCallParameters,
  prepare as prepareToolCallValidation,
  ToolJsonSchemaCompilerMissing,
  validateDecodedToolCall,
} from "./model-tool-call-validation.js"
import {
  CurrentCompactionId,
  CurrentInstrumentation,
  CurrentPurpose,
  CurrentSummaryCall,
  Delivery,
  DeliveryFailed,
  InvocationCoordinator,
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
  canonicalSuspensionCall,
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
import { emptyAgentRunResources } from "./agent/agent-run-resources.js"
import { makeModelTurn } from "./agent/model-turn.js"
import { makeToolExecution } from "./agent/tool-execution.js"
import { makeCompactionRuntime } from "./agent/compaction-runtime.js"
import { setupRun } from "./agent/setup.js"
import { makeRunLoop } from "./agent/run-loop.js"
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
const providerOutputState = (): {
  textCharacters: number
  reasoningCharacters: number
  finishReason: Response.FinishReason | undefined
} => ({ textCharacters: 0, reasoningCharacters: 0, finishReason: undefined })
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
const attemptText = (parts: ReadonlyArray<Response.StreamPart<any>>): string =>
  parts.reduce((text, part) => (part.type === "text-delta" ? `${text}${part.delta}` : text), "")
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
      const setup = yield* setupRun(agent, options)
      // prettier-ignore
      const {
        persistenceOptions, resume, persistenceService, runtimeService, compactionService, sessionService, persisted,
        recoveredHistory, resumeChat, validatedResume, staticCandidates, staticRegistry, staticToolkit, executor, approvals,
        chain, progressPolicy, sessionId, sessionOwnerToken, sessionAppendOptions, instructionsService, skillSourceService,
        skillRuntime, selectedSkills, skillListings, hasActivatableSkills, initialRegistry, instructionsEpoch, baseSystem,
        system, resilienceService, deliveryService, invocationCoordinator, telemetryRunId, telemetrySequence,
        pendingTelemetry, undeliveredTelemetry, emitTelemetry, flushTelemetry, deliverPending, telemetryIdentity,
        modelCallOrdinal, instrumentModel, modelRegistryService, permissionsService, ruleStoreService, authorizationService,
        steeringService, memoryService, tokenizerService, defaultRules, authorizer, memoryOptions, agentModel,
        agentModelRegistry, memoryRuntime, seedSystem, freshChat, chat, runResources,
      } = setup
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
          ? Ref.get(runResources.chat.history)
          : Ref.updateAndGet(runResources.chat.history, (history) =>
              Prompt.concat(history, Prompt.fromResponseParts(pending)),
            ).pipe(Effect.tap(() => savePersisted(turn)))
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
      const state: AgentRunState = {
        text: "",
        turn: 0,
        pending: new Map<number, PendingToolResult>(),
        finish: undefined,
        usage: undefined,
        providerOutput: providerOutputState(),
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
      const compactionRuntime = makeCompactionRuntime({
        activeSession,
        sessionService,
        sessionId,
        sessionOwnerToken,
        sessionAppendOptions,
        chat,
        persisted,
        options,
        compactionService,
        tokenizerService,
        deliverPending,
        savePersisted,
        undeliveredTelemetry,
        errorMessage,
        agent,
        memoryRuntime,
        memoryError,
        skillError,
        compactionError,
        sessionError,
      })
      const { preparePrompt, applyCompactionResult, syncSession } = compactionRuntime
      const toolRuntime = makeToolExecution({
        options,
        state,
        isSkillActivationCall,
        agent,
        sessionId,
        staticToolkit,
        executor,
        authorizer,
        skillRuntime,
        toolState,
        progressPolicy,
        activeSession,
        memoryRuntime,
        errorMessage,
        skillError,
      })
      const { toolCallEvents } = toolRuntime
      const modelRuntime = makeModelTurn({
        agent,
        resilienceService,
        telemetryIdentity,
        instrumentModel,
        chain,
        preparePrompt,
        emitTelemetry,
        chat,
        compactionService,
        state,
        errorMessage,
        persisted,
        toolCallEvents,
        agentModelRegistry,
        agentModel,
      })
      const { modelTurn, captureStructuredUsage, withModelTelemetry, withAgentModel } = modelRuntime
      const baseInitialPrompt =
        seedSystem === undefined ? Prompt.make(options.prompt) : withSystem(seedSystem, Prompt.make(options.prompt))
      const initialPrompt =
        options.resume === undefined ? yield* recallInitialPrompt(baseInitialPrompt) : baseInitialPrompt
      return makeRunLoop({
        agent,
        options,
        state,
        chat,
        chain,
        activeSession,
        memoryRuntime,
        steeringService,
        structured,
        validatedResume,
        seedSystem,
        recallInitialPrompt,
        initialPrompt,
        toolState,
        modelTurn,
        captureStructuredUsage,
        withModelTelemetry,
        withAgentModel,
        syncSession,
        applyCompactionResult,
        savePersisted,
        deliverPending,
        flushTelemetry,
        telemetryIdentity,
        checkpointPending,
        checkpointSuspended,
        pendingResults,
        toolCallEvents,
        isTurnPolicyDecision,
        steeringDrainedEvent,
        withSystem,
        rememberTurn,
      })
    }),
  ).pipe(Stream.withSpan("Baton.Agent.run", { attributes: { "baton.agent.name": agent.name } }))
