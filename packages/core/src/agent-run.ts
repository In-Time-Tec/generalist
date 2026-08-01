import { Effect, Equal, Option, Ref, Schema, Stream } from "effect"
import { Prompt, Response, Tool } from "effect/unstable/ai"
import { AgentError, AgentSuspended, type Event } from "./agent-event.js"
import { type Item, type MemoryError, messageFromRecall, projectTranscript } from "./memory.js"
import { type Entry, SessionConflict, SessionStore, type SessionStoreError, buildMemoryContext } from "./session.js"
import { type Candidate, assemble, get, type Registry } from "./tool-registry.js"
import type { CompactionError } from "./compaction.js"
import type { SkillSourceError } from "./skill-source.js"
import type { Agent, RunError, RunOptions } from "./agent.js"
import { withSystem } from "./agent-message.js"
import { activateSkillSuccess, activateSkillToolName } from "./agent-skill-tool.js"
import { suspensionCheckpointOption, unresolvedToolCall } from "./agent-suspension.js"
import type { AnyToolCall, PendingToolResult } from "./agent-tool-result.js"
import type { Input } from "./steering.js"
import { type Decision, StopReason } from "./turn-policy.js"
import type { SteeringDrained } from "./agent-event.js"
import { ToolNameCollision } from "./agent-event.js"
import type { AgentRunState } from "./agent/agent-run-state.js"
import { makeModelTurn } from "./agent/model-turn.js"
import { makeToolExecution } from "./agent/tool-execution.js"
import { makeCompactionRuntime } from "./agent/compaction-runtime.js"
import { setupRun } from "./agent/setup.js"
import { makeRunLoop } from "./agent/run-loop.js"
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
        persisted,
        validatedResume,
        staticToolkit,
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
        runResources,
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
          : Ref.updateAndGet(runResources.chat.history, (history: Prompt.Prompt) =>
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
              Effect.mapError((error) => memoryError(0, error as MemoryError)),
              Effect.map((items: ReadonlyArray<Item>) => insertRecalledItems(prompt, items)),
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
              .pipe(Effect.mapError((error) => memoryError(turn, error as MemoryError)))
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
      const modelRuntime = makeModelTurn<Tools, R>({
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
      return makeRunLoop<Tools, R, StructuredOutputSchema>({
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
  ).pipe(Stream.withSpan("Baton.Agent.run", { attributes: { "baton.agent.name": agent.name } })) as RunStream<
    StructuredOutputSchema,
    R
  >
