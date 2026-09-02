import { Effect, Function, Layer, Option, Ref, Schema, Stream } from "effect"
import { Prompt, Response, Tool } from "effect/unstable/ai"
import { AgentError, AgentSuspended, ToolNameCollision } from "./event.js"
import { type Item, type MemoryError, projectTranscript } from "../context/memory.js"
import { type Entry, SessionConflict, type SessionStoreError, buildMemoryContext } from "../context/session.js"
import { get, type Registry } from "../tools/tool-registry.js"
import type { CompactionError } from "../turn/compaction.js"
import type { SkillCatalogError } from "../context/skill-catalog.js"
import type { Agent, RunOptions } from "./service.js"
import { RunError } from "./run/error.js"
import { withSystem } from "./message.js"
import { activateSkillFailure, activateSkillSuccess, activateSkillToolName } from "./skill-tool.js"
import { checkpointFromHistory } from "./suspension.js"
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
import { operationKey, type DriverInterpreter } from "../durable/driver/interpreter.js"
import { layerForRun } from "../durable/driver/layer-for-run.js"
import { resolve as resolveRunBudget } from "../durable/run-budget.js"
import {
  isToolNameCollision,
  isPolicyDecision,
  type RecallInput,
  type RememberInput,
  type RunStream,
  suspensionApplicationIdentity,
  RunSupport,
} from "./loop/run-support.js"
import { intercept, setHandoffState, setToolBatch } from "../durable/driver/run.js"
import { type HandoffRunState, make as makeHandoffStateRef, takePendingContinuation } from "./handoff/state-ref.js"
import type { ObjectSchema, StructuredRunConfig } from "./loop/context.js"
import { LoopDriverState } from "../durable/loop-driver-state.js"
import type { RunInbox } from "../turn/steering-inbox.js"
import { modelCallMiddleware, runStart as applyRunStart } from "./lifecycle/hooks.js"
import { recoveredRetry as recoveredGateRetry } from "./gates/prompt.js"
import { make as makeVerifierRunner } from "./gates/verifier-runner.js"
const errorMessage = String
const { insertRecalledItems, steeringDrainedEvent } = RunSupport
const streamInternalImpl = <
  Tools extends Record<string, Tool.Any>,
  R,
  PolicyServices extends R,
  AuthorizationServices extends R,
  StructuredOutputSchema extends ObjectSchema,
  OutputValue,
>(
  agent: Agent<Tools, R, PolicyServices, AuthorizationServices, Schema.Top, Schema.Top>,
  options: RunOptions,
  structured: StructuredRunConfig<StructuredOutputSchema, OutputValue> | undefined,
  inbox: RunInbox,
): RunStream<Tools, StructuredOutputSchema, R | PolicyServices | AuthorizationServices> =>
  Stream.unwrap(
    Effect.gen(function* () {
      const setup = yield* setupRun(agent, options)
      // prettier-ignore
      const {
        compactionService,
        activeSession,
        system,
        validatedResume,
        recoveredToolCheckpoint,
        staticToolkit,
        executor,
        chain,
        activeModelResponse,
        progressPolicy,
        sessionId,
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
        modelCallUsage,
        instrumentModel,
        tokenizerService,
        authorizer,
        modelSource,
        memoryRuntime,
        seedSystem,
        chat,
      } = setup
      const middlewareChain = [...chain, modelCallMiddleware(inbox.runId)]
      const appendPending = (
        _turn: number,
        pending: ReadonlyArray<PendingToolResult>,
      ): Effect.Effect<Prompt.Prompt, AgentError> =>
        pending.length === 0
          ? Ref.get(chat.history)
          : Ref.updateAndGet(chat.history, (history: Prompt.Prompt) =>
              Prompt.concat(history, Prompt.fromResponseParts(pending)),
            )
      const checkpointSuspended = (
        turn: number,
        pending: ReadonlyArray<PendingToolResult>,
        suspension: AgentSuspended,
      ) =>
        Effect.gen(function* () {
          const withPending = yield* appendPending(turn, pending)
          if (checkpointFromHistory(withPending.content, suspension.checkpoint) === undefined) {
            return yield* AgentError.make({
              message: "Suspension does not match the authored tool-batch checkpoint",
              turn,
            })
          }
          const path = yield* syncSession(turn, withPending)
          const parentId = path.at(-1)?.id ?? null
          yield* applyCompactionResult(
            turn,
            { _tag: "Microcompact", history: withPending, prompt: Prompt.empty },
            parentId,
            suspensionApplicationIdentity(suspension),
          )
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
      const skillError = (turn: number, error: SkillCatalogError): AgentError =>
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
              success: Prompt.Prompt,
              failure: RunError,
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
              success: Schema.Void,
              failure: RunError,
            },
            rememberEffect,
          )
        })
      const compactionRuntime = makeCompactionRuntime({
        runId: inbox.runId,
        activeSession,
        system,
        sessionId,
        sessionAppendOptions,
        chat,
        options,
        state,
        compactionService,
        tokenizerService,
        deliverPending,
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
        runId: inbox.runId,
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
      const { resumeApproved, toolCallEvents, transformResolved } = toolRuntime
      const modelContext = {
        agent,
        modelSource,
        resilienceService,
        activeModelResponse,
        telemetryIdentity,
        modelCallUsage,
        instrumentModel,
        chain: middlewareChain,
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
      if (validatedResume !== undefined) yield* withInterpreter(setToolBatch(validatedResume.checkpoint))
      const gateRetry =
        options.resume === undefined && recoveredToolCheckpoint === undefined && options.turnStart === undefined
          ? recoveredGateRetry({ agent, checkpoint: options.driverCheckpoint })
          : undefined
      const loadInitialPrompt = () => {
        if (gateRetry !== undefined) return Effect.succeed(gateRetry.prompt)
        if (options.resume === undefined && recoveredToolCheckpoint === undefined) {
          return recallInitialPrompt(baseInitialPrompt).pipe(withInterpreter)
        }
        return Effect.succeed(baseInitialPrompt)
      }
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
      const runPrompt = loadRunPrompt().pipe(
        Effect.flatMap((prompt) =>
          applyRunStart({
            input: { runId: inbox.runId, agentName: agent.name, input: Prompt.make(prompt) },
            turn: state.turn,
          }),
        ),
      )
      return Stream.unwrap(
        runPrompt.pipe(
          Effect.map((prompt) => {
            const loopContext = {
              agent,
              options,
              state,
              chat,
              chain: middlewareChain,
              activeSession,
              memoryRuntime,
              inbox,
              structured,
              validatedResume,
              recoveredToolCheckpoint,
              seedSystem,
              recallInitialPrompt,
              initialPrompt: prompt,
              ...Object.assign({}, gateRetry === undefined ? undefined : { initialTurn: gateRetry.turn }),
              runGateVerifier: makeVerifierRunner(streamInternalImpl),
              toolState,
              modelTurn,
              captureStructuredUsage,
              withModelTelemetry,
              withAgentModel,
              syncSession,
              applyCompactionResult,
              deliverPending,
              flushTelemetry,
              telemetryIdentity,
              checkpointPending,
              checkpointSuspended,
              pendingResults,
              toolCallEvents,
              resumeApproved,
              transformResolved,
              isPolicyDecision,
              steeringDrainedEvent,
              withSystem,
              rememberTurn,
            }
            return handoffStateRef === undefined
              ? makeRunLoop<Tools, R, PolicyServices, AuthorizationServices, StructuredOutputSchema, OutputValue>(
                  loopContext,
                )
              : makeRunLoop<Tools, R, PolicyServices, AuthorizationServices, StructuredOutputSchema, OutputValue>({
                  ...loopContext,
                  handoffStateRef,
                })
          }),
        ),
      ).pipe(Stream.provideContext(interpreterServices))
    }),
  ).pipe(
    Stream.withSpan("Generalist.Agent.run", {
      attributes: { "generalist.agent.name": agent.name, "generalist.agent.run_id": inbox.runId },
    }),
  )
export const streamInternal: {
  <
    Tools extends Record<string, Tool.Any>,
    R,
    PolicyServices extends R,
    AuthorizationServices extends R,
    StructuredOutputSchema extends ObjectSchema,
    OutputValue,
  >(
    options: RunOptions,
    structured: StructuredRunConfig<StructuredOutputSchema, OutputValue> | undefined,
    inbox: RunInbox,
  ): (
    agent: Agent<Tools, R, PolicyServices, AuthorizationServices, Schema.Top, Schema.Top>,
  ) => RunStream<Tools, StructuredOutputSchema, R | PolicyServices | AuthorizationServices>
  <
    Tools extends Record<string, Tool.Any>,
    R,
    PolicyServices extends R,
    AuthorizationServices extends R,
    StructuredOutputSchema extends ObjectSchema,
    OutputValue,
  >(
    agent: Agent<Tools, R, PolicyServices, AuthorizationServices, Schema.Top, Schema.Top>,
    options: RunOptions,
    structured: StructuredRunConfig<StructuredOutputSchema, OutputValue> | undefined,
    inbox: RunInbox,
  ): RunStream<Tools, StructuredOutputSchema, R | PolicyServices | AuthorizationServices>
} = Function.dual(4, streamInternalImpl)
