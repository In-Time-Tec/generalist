import { Effect, Equal, Function, Layer, Option, Ref, Schema, Stream } from "effect"
import { Prompt, Response, Tool } from "effect/unstable/ai"
import { AgentError, AgentSuspended, ToolNameCollision } from "./event.js"
import { type Item, type MemoryError, projectTranscript } from "../context/memory.js"
import { type Entry, SessionConflict, type SessionStoreError, buildMemoryContext } from "../context/session.js"
import { get, type Registry } from "../tools/tool-registry.js"
import type { CompactionError } from "../turn/compaction.js"
import type { SkillSourceError } from "../context/skill-source.js"
import type { Agent, RunError, RunOptions } from "./service.js"
import { withSystem } from "./message.js"
import { activateSkillFailure, activateSkillSuccess, activateSkillToolName } from "./skill-tool.js"
import { suspensionCheckpointOption, unresolvedToolCall } from "./suspension.js"
import type { AnyToolCall, PendingToolResult } from "./tools/result.js"
import { type AgentRunState, make as makeProviderOutputState } from "./model-turn/provider-output-state.js"
import { make as makeModelTurn } from "./model-turn/index.js"
import { replayModelMessages } from "./session/history.js"
import { AgentPin } from "../durable/pin.js"
import { make as makeToolExecution } from "./tools/execution.js"
import { make as makeSkillActivation } from "./tools/skill-activation.js"
import { make as makeCompactionRuntime } from "./compaction-runtime.js"
import { setupRun } from "./lifecycle/setup.js"
import { make as makeRunLoop } from "./loop/service.js"
import { layerForRun, operationKey, type DriverInterpreter } from "../durable/driver/interpreter.js"
import { resolve as resolveRunBudget } from "../durable/run-budget.js"
import {
  isToolNameCollision,
  isTurnPolicyDecision,
  type RecallInput,
  type RememberInput,
  type RunStream,
  type SuspensionMetadata,
  suspensionApplicationIdentity,
  RunSupport,
} from "./loop/run-support.js"
import { intercept, bindResume, setHandoffState } from "../durable/driver/run.js"
import { type HandoffRunState, make as makeHandoffStateRef, takePendingContinuation } from "./handoff/state-ref.js"
import type { ObjectSchema, StructuredRunConfig } from "./loop/context.js"
import { LoopDriverState } from "../durable/loop-driver-state.js"
const errorMessage = String
const { insertRecalledItems, steeringDrainedEvent } = RunSupport
const streamInternalImpl = <Tools extends Record<string, Tool.Any>, R, StructuredOutputSchema extends ObjectSchema>(
  agent: Agent<Tools, R>,
  options: RunOptions,
  structured: StructuredRunConfig<StructuredOutputSchema> | undefined,
): RunStream<Tools, StructuredOutputSchema, R> =>
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
        compactionService,
        activeSession,
        system,
        persisted,
        validatedResume,
        recoveredToolCheckpoint,
        staticToolkit,
        executor,
        chain,
        activeModelResponse,
        progressPolicy,
        sessionId,
        sessionOwnerToken,
        sessionAppendOptions,
        skillRuntime,
        initialRegistry,
        resilienceService,
        undeliveredTelemetry,
        emitTelemetry,
        prepareTelemetry,
        publishTelemetry,
        flushTelemetry,
        deliverPending,
        telemetryIdentity,
        instrumentModel,
        steeringService,
        tokenizerService,
        authorizer,
        agentModel,
        agentModelRegistry,
        memoryRuntime,
        seedSystem,
        chat,
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
          ? Ref.get(chat.history)
          : Ref.updateAndGet(chat.history, (history: Prompt.Prompt) =>
              Prompt.concat(history, Prompt.fromResponseParts(pending)),
            ).pipe(Effect.tap(() => savePersisted(turn)))
      const checkpointSuspended = (
        turn: number,
        pending: ReadonlyArray<PendingToolResult>,
        suspension: AgentSuspended,
      ) =>
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
          const metadata: SuspensionMetadata = {
            token: suspension.token,
            reason: suspension.reason,
            tool_call_batch_ids: suspension.tool_call_batch.map((call) => call.id),
          }
          if (suspension.tool_call_index !== undefined) metadata.tool_call_index = suspension.tool_call_index
          if (suspension.active_tools !== undefined) metadata.active_tools = suspension.active_tools
          if (suspension.activated_skills !== undefined) metadata.activated_skills = suspension.activated_skills
          const messages = withPending.content.map((message, messageIndex): Prompt.Message => {
            if (message.role !== "assistant") return message
            return Prompt.makeMessage("assistant", {
              content: message.content.map((part, partIndex): Prompt.AssistantMessagePart => {
                if (part.type !== "tool-call") return part
                const { [suspensionCheckpointOption]: _priorCheckpoint, ...partOptions } = part.options
                if (messageIndex === unresolved.messageIndex && partIndex === unresolved.partIndex) {
                  return Prompt.makePart("tool-call", {
                    id: part.id,
                    name: part.name,
                    params: part.params,
                    providerExecuted: part.providerExecuted,
                    options: { ...partOptions, [suspensionCheckpointOption]: metadata },
                  })
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
            suspensionApplicationIdentity(suspension),
          )
          if (Option.isNone(activeSession)) yield* savePersisted(turn)
          return yield* Ref.get(chat.history)
        })
      const checkpointPending = (
        turn: number,
        pending: ReadonlyArray<PendingToolResult>,
      ): Effect.Effect<Prompt.Prompt, RunError, DriverInterpreter> =>
        appendPending(turn, pending).pipe(Effect.tap((checkpoint) => syncSession(turn, checkpoint)))
      const state: AgentRunState = {
        text: "",
        turn: 0,
        pending: new Map<number, PendingToolResult>(),
        finish: undefined,
        usage: undefined,
        currentContext: undefined,
        currentContextTokens: undefined,
        reportedContextUsage: undefined,
        providerOutput: makeProviderOutputState(),
      }
      const pendingResults = (): ReadonlyArray<PendingToolResult> =>
        [...state.pending.entries()].toSorted(([left], [right]) => left - right).map(([, result]) => result)
      const toolState = yield* Ref.make({
        registry: initialRegistry,
        activatedSkillBodies: new Map<string, string>(),
      })
      const hasSameRunHandoff = initialRegistry.entries.some((candidate) => candidate.dispatch === "Handoff")
      const restoreHandoff = () =>
        options.driverCheckpoint === undefined
          ? Effect.as(Effect.void, undefined)
          : Schema.decodeUnknownEffect(LoopDriverState)(options.driverCheckpoint.state).pipe(
              Effect.map((driverState) => driverState.handoff),
              Effect.mapError((error) =>
                AgentError.make({ message: `Invalid handoff checkpoint: ${String(error)}`, turn: 0 }),
              ),
            )
      const restoredHandoff = yield* restoreHandoff()
      if (restoredHandoff !== undefined && restoredHandoff.active !== agent.name) {
        return yield* AgentError.make({
          message: `Handoff checkpoint active Agent ${restoredHandoff.active} does not match ${agent.name}`,
          turn: 0,
        })
      }
      const decodeActivePin = () => {
        if (options.executableRef === undefined) return Effect.as(Effect.void, undefined)
        const active = options.executableRef.active
        if (Schema.is(AgentPin)(active)) return Effect.sync(() => active)
        return AgentError.make({
          message: `Agent execution requires an active Agent pin: ${options.executableRef.active}`,
          turn: 0,
        })
      }
      const activePin = yield* decodeActivePin()
      const initializeHandoff = () =>
        hasSameRunHandoff || restoredHandoff !== undefined
          ? makeHandoffStateRef(agent, activePin, restoredHandoff)
          : Effect.as(Effect.void, undefined)
      const handoffStateRef = yield* initializeHandoff()
      const skillError = (turn: number, error: SkillSourceError): AgentError =>
        AgentError.make({ message: error.message, turn, cause: error })
      const restoreSkill = makeSkillActivation({ skillRuntime, toolState, skillError })
      const restoreActivatedSkills = (history: Prompt.Prompt): Effect.Effect<void, AgentError | ToolNameCollision> =>
        Effect.gen(function* () {
          const completed = new Set<string>()
          const restoredBodies = new Map<string, string>()
          for (const message of history.content) {
            if (!Array.isArray(message.content)) continue
            for (const part of message.content) {
              const result = Schema.decodeUnknownOption(Prompt.ToolResultPart)(part)
              if (Option.isSome(result) && result.value.name === activateSkillToolName && !result.value.isFailure) {
                completed.add(result.value.id)
                const activation = Schema.decodeUnknownOption(activateSkillSuccess)(result.value.result)
                if (Option.isSome(activation)) restoredBodies.set(result.value.id, activation.value.body)
              }
            }
          }
          for (const message of history.content) {
            if (!Array.isArray(message.content)) continue
            for (const part of message.content) {
              const call = Schema.decodeUnknownOption(Prompt.ToolCallPart)(part)
              if (Option.isNone(call) || call.value.name !== activateSkillToolName || !completed.has(call.value.id))
                continue
              const restoredCall = Response.makePart("tool-call", {
                id: call.value.id,
                name: call.value.name,
                params: call.value.params,
                providerExecuted: call.value.providerExecuted,
              })
              const outcome = yield* restoreSkill(0, restoredCall, restoredBodies.get(call.value.id))
              if (outcome._tag === "DomainFailure") {
                const failure = yield* Schema.decodeUnknownEffect(activateSkillFailure)(outcome.failure)
                return yield* AgentError.make({
                  message: failure.message,
                  turn: 0,
                  cause: outcome.failure,
                })
              }
            }
          }
        }).pipe(
          Effect.mapError((error) =>
            isToolNameCollision(error)
              ? error
              : AgentError.make({
                  message: error instanceof Error ? error.message : String(error),
                  turn: 0,
                  cause: error,
                }),
          ),
        )
      if (validatedResume !== undefined) yield* Ref.get(chat.history).pipe(Effect.flatMap(restoreActivatedSkills))
      const sessionError = (turn: number, error: SessionStoreError | SessionConflict): AgentError =>
        AgentError.make({ message: error.message, turn, cause: error })
      const compactionError = (turn: number, error: CompactionError): AgentError =>
        AgentError.make({ message: error.message, turn, cause: error })
      const memoryError = (turn: number, error: MemoryError): AgentError =>
        AgentError.make({ message: error.message, turn, cause: error })
      const isSkillActivationCall = (call: AnyToolCall, registry: Registry): boolean =>
        get(registry, call.name)?.dispatch === "Builtin" && skillRuntime !== undefined
      const recallInitialPrompt = (prompt: Prompt.Prompt): Effect.Effect<Prompt.Prompt, RunError, DriverInterpreter> =>
        Effect.gen(function* () {
          const logicalId = options.logicalOperationId ?? options.sessionId ?? agent.name
          const recallEffect =
            memoryRuntime === undefined
              ? Effect.succeed(prompt)
              : memoryRuntime.service.recall({ key: memoryRuntime.key, turn: 0, prompt }).pipe(
                  Effect.mapError((error) => memoryError(0, error)),
                  Effect.map((items: ReadonlyArray<Item>) => insertRecalledItems(prompt, items)),
                )
          const input: RecallInput = { turn: 0 }
          if (memoryRuntime !== undefined) input.key = memoryRuntime.key
          return yield* intercept(
            {
              kind: "memory",
              key: operationKey(logicalId, "memory", "recall", 0),
              input,
              replayPolicy: "pure",
            },
            recallEffect,
          )
        })
      const rememberTurn = (
        turn: number,
        transcript: Prompt.Prompt,
        terminal: boolean,
        path: ReadonlyArray<Entry>,
      ): Effect.Effect<void, RunError, DriverInterpreter> =>
        Effect.gen(function* () {
          const logicalId = options.logicalOperationId ?? options.sessionId ?? agent.name
          const rememberEffect =
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
          const input: RememberInput = { turn, terminal }
          if (memoryRuntime !== undefined) input.key = memoryRuntime.key
          yield* intercept(
            {
              kind: "memory",
              key: operationKey(logicalId, "memory", "remember", turn, terminal ? 1 : 0),
              turn,
              input,
              replayPolicy: "pure",
            },
            rememberEffect,
          )
        })
      const compactionRuntime = makeCompactionRuntime({
        activeSession,
        system,
        sessionId,
        sessionOwnerToken,
        sessionAppendOptions,
        chat,
        persisted,
        options,
        state,
        compactionService,
        tokenizerService,
        deliverPending,
        savePersisted,
        undeliveredTelemetry,
        emitTelemetry,
        prepareTelemetry,
        publishTelemetry,
        errorMessage,
        agent,
        memoryRuntime,
        memoryError,
        skillError,
        compactionError,
        sessionError,
      })
      const { preparePrompt, applyCompactionResult, countTokens, syncSession } = compactionRuntime
      const toolContext = {
        options,
        state,
        isSkillActivationCall,
        agent,
        staticToolkit,
        chat,
        sessionId,
        executor,
        authorizer,
        skillRuntime,
        toolState,
        progressPolicy,
        activeSession,
        memoryRuntime,
        errorMessage,
        skillError,
      }
      const toolRuntime =
        handoffStateRef === undefined
          ? makeToolExecution(toolContext)
          : makeToolExecution({ ...toolContext, handoffState: handoffStateRef })
      const { resumeApproved, toolCallEvents } = toolRuntime
      const modelContext = {
        agent,
        agentModel,
        agentModelRegistry,
        resilienceService,
        activeModelResponse,
        telemetryIdentity,
        instrumentModel,
        chain,
        preparePrompt,
        countTokens,
        syncSession,
        replayMessages: (sessionParentId: string) =>
          replayModelMessages({ activeSession, sessionParentId, system, turn: state.turn, sessionError }),
        emitTelemetry,
        chat,
        compactionService,
        state,
        errorMessage,
        persisted,
        toolCallEvents,
      }
      const modelRuntime =
        handoffStateRef === undefined
          ? makeModelTurn<Tools, R>(modelContext)
          : makeModelTurn<Tools, R>({ ...modelContext, handoffStateRef })
      const { modelTurn, captureStructuredUsage, withModelTelemetry, withAgentModel } = modelRuntime
      const baseInitialPrompt =
        seedSystem === undefined ? Prompt.make(options.prompt) : withSystem(seedSystem, Prompt.make(options.prompt))
      const runBudget = options.inheritedBudget ?? resolveRunBudget(agent.budget, options.budget)
      const interpreterServices = yield* Layer.build(layerForRun(agent, options, baseInitialPrompt, runBudget))
      const withInterpreter = <A, E, RInner>(effect: Effect.Effect<A, E, RInner>) =>
        effect.pipe(Effect.provideContext(interpreterServices))
      if (validatedResume !== undefined) yield* withInterpreter(bindResume(validatedResume.suspension.token))
      const loadInitialPrompt = () =>
        options.resume === undefined && recoveredToolCheckpoint === undefined
          ? recallInitialPrompt(baseInitialPrompt).pipe(withInterpreter)
          : Effect.succeed(baseInitialPrompt)
      const initialPrompt = yield* loadInitialPrompt()
      const applyContinuation = (continuation: HandoffRunState["pendingContinuation"]) => {
        if (continuation === undefined) return initialPrompt
        const prompt = Prompt.make(continuation.prompt)
        return continuation.overrides?.instructions === undefined
          ? prompt
          : withSystem(continuation.overrides.instructions, prompt)
      }
      const loadRunPrompt = () =>
        options.resume === undefined && options.driverCheckpoint !== undefined && handoffStateRef !== undefined
          ? takePendingContinuation(handoffStateRef, setHandoffState).pipe(Effect.map(applyContinuation))
          : Effect.succeed(initialPrompt)
      const runPrompt = loadRunPrompt()
      return Stream.unwrap(
        runPrompt.pipe(
          Effect.map((prompt) => {
            const loopContext = {
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
              recoveredToolCheckpoint,
              seedSystem,
              recallInitialPrompt,
              initialPrompt: prompt,
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
              resumeApproved,
              isTurnPolicyDecision,
              steeringDrainedEvent,
              withSystem,
              rememberTurn,
            }
            return handoffStateRef === undefined
              ? makeRunLoop<Tools, R, StructuredOutputSchema>(loopContext)
              : makeRunLoop<Tools, R, StructuredOutputSchema>({ ...loopContext, handoffStateRef })
          }),
        ),
      ).pipe(Stream.provideContext(interpreterServices))
    }),
  ).pipe(Stream.withSpan("TenetKit.Agent.run", { attributes: { "tenetkit.agent.name": agent.name } }))
export const streamInternal: {
  <Tools extends Record<string, Tool.Any>, R, StructuredOutputSchema extends ObjectSchema>(
    options: RunOptions,
    structured: StructuredRunConfig<StructuredOutputSchema> | undefined,
  ): (agent: Agent<Tools, R>) => RunStream<Tools, StructuredOutputSchema, R>
  <Tools extends Record<string, Tool.Any>, R, StructuredOutputSchema extends ObjectSchema>(
    agent: Agent<Tools, R>,
    options: RunOptions,
    structured: StructuredRunConfig<StructuredOutputSchema> | undefined,
  ): RunStream<Tools, StructuredOutputSchema, R>
} = Function.dual(3, streamInternalImpl)
