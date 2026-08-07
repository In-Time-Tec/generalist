import { Effect, Equal, Option, Ref, Schema, Stream } from "effect"
import { Prompt, Tool } from "effect/unstable/ai"
import { AgentError, AgentSuspended, type Event } from "./agent-event.js"
import { type Item, type MemoryError, messageFromRecall, projectTranscript } from "../context/memory.js"
import { type Entry, SessionConflict, type SessionStoreError, buildMemoryContext } from "../context/session.js"
import { type Candidate, assemble, get, type Registry } from "../tools/tool-registry.js"
import type { CompactionError } from "../turn/compaction.js"
import type { SkillSourceError } from "../context/skill-source.js"
import type { Agent, RunError, RunOptions } from "./agent.js"
import { withSystem } from "./agent-message.js"
import { activateSkillSuccess, activateSkillToolName } from "./agent-skill-tool.js"
import { suspensionCheckpointOption, unresolvedToolCall } from "./agent-suspension.js"
import type { AnyToolCall, PendingToolResult } from "./agent-tool-result.js"
import type { Input } from "../turn/steering.js"
import { type Decision, StopReason } from "../turn/turn-policy.js"
import type { SteeringDrained } from "./agent-event.js"
import { ToolNameCollision } from "./agent-event.js"
import { makeProviderOutputState, type AgentRunState } from "./agent-run-state.js"
import { makeModelTurn } from "./model-turn.js"
import { AgentPin } from "../durable/pin.js"
import { makeToolExecution } from "./tool-execution.js"
import { makeCompactionRuntime } from "./compaction-runtime.js"
import { setupRun } from "./setup.js"
import { makeRunLoop } from "./run-loop.js"
import { layerForRun } from "../durable/driver-interpreter.js"
import { resolve as resolveRunBudget } from "../durable/run-budget.js"
import { operationKey } from "../durable/driver-interpreter.js"
import { intercept, bindResume, setHandoffState } from "../durable/driver-run.js"
import { makeHandoffStateRef, takePendingContinuation } from "./handoff-state.js"
import { LoopDriverState } from "../durable/loop-driver-state.js"
type ObjectSchema = Schema.Codec<unknown, Record<string, unknown>, unknown, unknown>
interface StructuredRunConfig<S extends ObjectSchema> {
  readonly schema: S
  readonly objectName: string
  readonly objectPrompt: Prompt.RawInput
}
type RunStream<S extends ObjectSchema, R> = Stream.Stream<Event, RunError, R | S["DecodingServices"]>
const errorMessage = (error: unknown) => (error instanceof Error ? `${error.name}: ${error.message}` : String(error))
const isToolNameCollision = Schema.is(ToolNameCollision)
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
      const setup = yield* setupRun(agent, options)
      // prettier-ignore
      const {
        compactionService,
        sessionService,
        activeSession,
        system,
        persisted,
        validatedResume,
        executor,
        chain,
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
        }) as Effect.Effect<Prompt.Prompt, RunError>
      const checkpointPending = (
        turn: number,
        pending: ReadonlyArray<PendingToolResult>,
      ): Effect.Effect<Prompt.Prompt, AgentError> =>
        appendPending(turn, pending).pipe(Effect.tap((checkpoint) => syncSession(turn, checkpoint))) as Effect.Effect<
          Prompt.Prompt,
          AgentError
        >
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
      const restoredHandoff =
        options.driverCheckpoint === undefined
          ? undefined
          : yield* Schema.decodeUnknownEffect(LoopDriverState)(options.driverCheckpoint.state).pipe(
              Effect.map((driverState) => driverState.handoff),
              Effect.mapError((error) => AgentError.make({ message: `Invalid handoff checkpoint: ${error}`, turn: 0 })),
            )
      if (restoredHandoff !== undefined && restoredHandoff.active !== agent.name) {
        return yield* AgentError.make({
          message: `Handoff checkpoint active Agent ${restoredHandoff.active} does not match ${agent.name}`,
          turn: 0,
        })
      }
      if (options.executableRef !== undefined && !Schema.is(AgentPin)(options.executableRef.active)) {
        return yield* AgentError.make({
          message: `Agent execution requires an active Agent pin: ${options.executableRef.active}`,
          turn: 0,
        })
      }
      const handoffStateRef =
        hasSameRunHandoff || restoredHandoff !== undefined
          ? yield* makeHandoffStateRef(agent, options.executableRef?.active as AgentPin | undefined, restoredHandoff)
          : undefined
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
                  (tool: Tool.Any): Candidate => ({
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
            isToolNameCollision(error)
              ? error
              : AgentError.make({
                  message: error instanceof Error ? error.message : String(error),
                  turn: 0,
                  cause: error,
                }),
          ),
        ) as Effect.Effect<void, AgentError | ToolNameCollision>
      if (validatedResume !== undefined)
        yield* (Ref.get(chat.history) as Effect.Effect<Prompt.Prompt>).pipe(Effect.flatMap(restoreActivatedSkills))
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
      const recallInitialPrompt = (prompt: Prompt.Prompt): Effect.Effect<Prompt.Prompt, RunError> =>
        Effect.gen(function* () {
          const logicalId = options.logicalOperationId ?? options.sessionId ?? agent.name
          const recallEffect =
            memoryRuntime === undefined
              ? Effect.succeed(prompt)
              : memoryRuntime.service.recall({ key: memoryRuntime.key, turn: 0, prompt }).pipe(
                  Effect.mapError((error) => memoryError(0, error as MemoryError)),
                  Effect.map((items: ReadonlyArray<Item>) => insertRecalledItems(prompt, items)),
                )
          return yield* intercept(
            {
              kind: "memory",
              key: operationKey(logicalId, "memory", "recall", 0),
              input: { turn: 0, ...(memoryRuntime === undefined ? {} : { key: memoryRuntime.key }) },
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
      ): Effect.Effect<void, RunError> =>
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
                  .pipe(Effect.mapError((error) => memoryError(turn, error as MemoryError)))
          yield* intercept(
            {
              kind: "memory",
              key: operationKey(logicalId, "memory", "remember", turn, terminal ? 1 : 0),
              input: { turn, terminal, ...(memoryRuntime === undefined ? {} : { key: memoryRuntime.key }) },
              replayPolicy: "pure",
            },
            rememberEffect,
          )
        })
      const compactionRuntime = makeCompactionRuntime({
        activeSession,
        system,
        sessionService,
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
      const toolRuntime = makeToolExecution({
        options,
        state,
        isSkillActivationCall,
        agent,
        chat,
        sessionId,
        executor,
        authorizer,
        skillRuntime,
        toolState,
        ...(handoffStateRef === undefined ? {} : { handoffState: handoffStateRef }),
        progressPolicy,
        activeSession,
        memoryRuntime,
        errorMessage,
        skillError,
      })
      const { resumeApproved, toolCallEvents } = toolRuntime
      const modelRuntime = makeModelTurn<Tools, R>({
        agent,
        ...(handoffStateRef === undefined ? {} : { handoffStateRef }),
        agentModel,
        agentModelRegistry,
        resilienceService,
        telemetryIdentity,
        instrumentModel,
        chain,
        preparePrompt,
        countTokens,
        emitTelemetry,
        chat,
        compactionService,
        state,
        errorMessage,
        persisted,
        toolCallEvents,
      })
      const { modelTurn, captureStructuredUsage, withModelTelemetry, withAgentModel } = modelRuntime
      const baseInitialPrompt =
        seedSystem === undefined ? Prompt.make(options.prompt) : withSystem(seedSystem, Prompt.make(options.prompt))
      const runBudget = options.inheritedBudget ?? resolveRunBudget(agent.budget, options.budget)
      const interpreterLayer = layerForRun(agent, options, baseInitialPrompt, runBudget)
      const withInterpreter = <A, E, RInner>(effect: Effect.Effect<A, E, RInner>) =>
        effect.pipe(Effect.provide(interpreterLayer))
      if (validatedResume !== undefined) {
        yield* withInterpreter(bindResume(validatedResume.suspension.token))
      }
      const initialPrompt =
        options.resume === undefined
          ? yield* withInterpreter(recallInitialPrompt(baseInitialPrompt))
          : baseInitialPrompt
      const runPrompt =
        options.resume === undefined && options.driverCheckpoint !== undefined && handoffStateRef !== undefined
          ? takePendingContinuation(handoffStateRef, setHandoffState).pipe(
              Effect.map((continuation) =>
                continuation === undefined
                  ? initialPrompt
                  : continuation.overrides?.instructions === undefined
                    ? Prompt.make(continuation.prompt)
                    : withSystem(continuation.overrides.instructions, Prompt.make(continuation.prompt)),
              ),
            )
          : Effect.succeed(initialPrompt)
      return Stream.unwrap(
        runPrompt.pipe(
          Effect.map((prompt) =>
            makeRunLoop<Tools, R, StructuredOutputSchema>({
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
              initialPrompt: prompt,
              toolState,
              ...(handoffStateRef === undefined ? {} : { handoffStateRef }),
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
            }),
          ),
        ),
      ).pipe(Stream.provide(interpreterLayer))
    }),
  ).pipe(Stream.withSpan("Baton.Agent.run", { attributes: { "baton.agent.name": agent.name } })) as RunStream<
    StructuredOutputSchema,
    R
  >
