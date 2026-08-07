import { Cause, Effect, Option, Ref, Schema, Stream } from "effect"
import { AiError, LanguageModel, Prompt, Response, Tool } from "effect/unstable/ai"
import {
  AgentError,
  AgentSuspended,
  type Event,
  type StructuredOutput,
  DuplicateToolCallId,
  RunEndedWithoutOutput,
  TurnLimitExceeded,
  TurnPolicyStopped,
} from "./agent-event.js"
import {
  CurrentCompactionId,
  CurrentInstrumentation,
  CurrentPurpose,
  CurrentSummaryCall,
  DeliveryFailed,
} from "../model/model-telemetry.js"
import { TurnPolicyError, type TurnOverrides } from "../turn/turn-policy.js"
import type { LanguageModelNotRegistered } from "../model/model-registry.js"
import type { AnyToolCall } from "./agent-tool-result.js"
import { resolvedToolResult, type SuspensionCheckpoint } from "./agent-suspension.js"
import type { ResumeResolution, RunError } from "./agent.js"
import type { Input } from "../turn/steering.js"
import { applyPromptChain, errorMessage, providerOutputState } from "./agent-message.js"
type SchemaServices<S extends ObjectSchema> = [unknown] extends [S["DecodingServices"]] ? never : S["DecodingServices"]

import type { ObjectSchema, RunLoopContext, StaticToolServices, StructuredRunConfig } from "./run-loop-context.js"
import type { HandoffCatalog } from "../policy/handoff-target.js"
import type { Request } from "../tools/tool-executor.js"
import { select } from "../tools/tool-registry.js"
import {
  checkpoint as driverCheckpoint,
  intercept,
  logicalOperationId,
  recordSuspension,
  setHandoffState,
} from "../durable/driver-run.js"
import { operationKey } from "../durable/driver-interpreter.js"
import { type DriverInterpreter } from "../durable/driver-interpreter.js"
import { LoopDriverState, modelCallOrdinal } from "../durable/loop-driver-state.js"
import { takePendingContinuation } from "./handoff-state.js"
import { DriverStateInvalid } from "../durable/durable-driver.js"
import { terminalCompletedEvent, turnCompletedEvent } from "./model-turn-finish.js"
import { schedule as scheduleTools } from "./tool-scheduler.js"
export const makeRunLoop = <
  Tools extends Record<string, Tool.Any>,
  R,
  StructuredOutputSchema extends ObjectSchema = ObjectSchema,
>(
  context: RunLoopContext<Tools, R, StructuredOutputSchema>,
): Stream.Stream<
    Event,
    RunError,
    LanguageModel.LanguageModel | R | StaticToolServices<Tools> | SchemaServices<StructuredOutputSchema> | DriverInterpreter | HandoffCatalog
  > => {
  const {
    agent,
    options,
    state,
    chat,
    chain,
    activeSession,
    steeringService,
    structured,
    validatedResume,
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
    resumeApproved,
    rememberTurn,
    withSystem,
    steeringDrainedEvent,
    isTurnPolicyDecision,
    handoffStateRef,
  } = context
  const structuredFinalEvents = (
    structuredTurn: number,
    config: StructuredRunConfig<StructuredOutputSchema>,
  ): Stream.Stream<Event, RunError, LanguageModel.LanguageModel | SchemaServices<StructuredOutputSchema> | DriverInterpreter> =>
    Stream.fromEffect(
      Effect.gen(function* () {
        const transformedPrompt = yield* applyPromptChain(chain, Prompt.make(config.objectPrompt), {
          agentName: agent.name,
          turn: structuredTurn,
        })
        const history = yield* Ref.get(chat.history)
        const logicalId = yield* logicalOperationId
        const current = yield* driverCheckpoint
        const driverState = yield* Schema.decodeUnknownEffect(LoopDriverState)(current.state).pipe(
          Effect.mapError((error) => DriverStateInvalid.make({ message: String(error) })),
        )
        const ordinal = modelCallOrdinal(driverState)
        const response = yield* intercept(
          {
            kind: "structured-output",
            key: operationKey(logicalId, "structured-output", structuredTurn, ordinal),
            input: { turn: structuredTurn, modelCallOrdinal: ordinal },
            replayPolicy: "provider-idempotent",
          },
          LanguageModel.generateObject({
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
        return [structuredOutput, terminalCompletedEvent(state, structuredTurn, transcript)]
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
  const policyAgent = (): Effect.Effect<typeof agent, never, never> =>
    handoffStateRef === undefined
      ? Effect.succeed(agent)
      : Ref.get(handoffStateRef).pipe(Effect.map((handoffRun) => handoffRun.active.agent as unknown as typeof agent))
  const afterTurn = (
    turn: number,
  ): Effect.Effect<
    {
      readonly events: Stream.Stream<Event, RunError, LanguageModel.LanguageModel | SchemaServices<StructuredOutputSchema>>
      readonly next?: {
        readonly prompt: Prompt.RawInput
        readonly overrides?: TurnOverrides
      }
      readonly structuredTurn?: number
    },
    AgentError | TurnPolicyError | RunError,
    R | DriverInterpreter
  > =>
    Effect.gen(function* () {
      const pending = pendingResults()
      const transcript = yield* checkpointPending(turn, pending)
      const path = yield* syncSession(turn, transcript)
      yield* rememberTurn(turn, transcript, pending.length === 0, path)
      const completed: Event = turnCompletedEvent(state, turn, transcript)
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
        if (state.text.length === 0) {
          return {
            events: Stream.concat(
              Stream.fromIterable<Event>([completed]),
              Stream.fail(
                RunEndedWithoutOutput.make({
                  turn,
                  ...(state.providerOutput.finishReason === undefined
                    ? {}
                    : { finishReason: state.providerOutput.finishReason }),
                  providerTextCharacters: state.providerOutput.textCharacters,
                  reasoningCharacters: state.providerOutput.reasoningCharacters,
                }),
              ),
            ),
          }
        }
        yield* savePersisted(turn)
        return {
          events: Stream.fromIterable<Event>([completed, terminalCompletedEvent(state, turn, transcript)]),
        }
      }
      const activeAgent = yield* policyAgent()
      const evaluated = yield* activeAgent.policy.decide({
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
      let continuationOverrides = decision.overrides
      let continuationPrompt = basePrompt
      if (handoffStateRef !== undefined) {
        const pendingContinuation = yield* takePendingContinuation(
          handoffStateRef,
          (handoff) => setHandoffState(handoff),
        )
        if (pendingContinuation !== undefined) {
          continuationPrompt =
            steering.length === 0
              ? Prompt.make(pendingContinuation.prompt)
              : Prompt.concat(basePrompt, Prompt.make(pendingContinuation.prompt))
          continuationOverrides = {
            ...decision.overrides,
            ...pendingContinuation.overrides,
          }
        }
      }
      const prompt =
        continuationOverrides?.instructions === undefined
          ? continuationPrompt
          : withSystem(continuationOverrides.instructions, continuationPrompt)
      return {
        events: Stream.fromIterable<Event>(
          steering.length === 0 ? [completed] : [completed, steeringDrainedEvent(turn, "steering", steering)],
        ),
        next: {
          prompt,
          ...(continuationOverrides === undefined ? {} : { overrides: continuationOverrides }),
        },
      }
    })
  const resetTurnState = (turn: number) =>
    Stream.sync(() => {
      state.turn = turn
      state.text = ""
      state.finish = undefined
      state.providerOutput = providerOutputState()
    }).pipe(Stream.drain)
  const runTurn = (
    turn: number,
    prompt: Prompt.RawInput,
    overrides?: TurnOverrides,
  ): Stream.Stream<Event, RunError, LanguageModel.LanguageModel | R | StaticToolServices<Tools> | SchemaServices<StructuredOutputSchema> | DriverInterpreter | HandoffCatalog> => {
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
  ): Stream.Stream<Event, RunError, LanguageModel.LanguageModel | R | StaticToolServices<Tools> | SchemaServices<StructuredOutputSchema> | DriverInterpreter | HandoffCatalog> => {
    let next:
      | {
          readonly prompt: Prompt.RawInput
          readonly overrides?: TurnOverrides
        }
      | undefined
    const currentTurn = resetTurnState(0).pipe(
      Stream.concat(
        Stream.unwrap(
          Effect.all({ tools: Ref.get(toolState), activeAgent: policyAgent() }).pipe(
            Effect.map(({ tools, activeAgent }) => {
              const suspension = checkpoint.suspension
              const registry =
                suspension.active_tools === undefined ? tools.registry : select(tools.registry, suspension.active_tools)
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
              const executions = checkpoint.unresolvedToolCallIndexes.map((toolCallIndex) => ({
                call: calls[toolCallIndex] as AnyToolCall,
                toolCallIndex,
              }))
              const execute = ({
                call,
                toolCallIndex,
              }: {
                readonly call: AnyToolCall
                readonly toolCallIndex: number
              }): ReturnType<typeof toolCallEvents> => {
                const resolution = options.resume?.resolution
                return toolCallIndex === suspendedIndex && resolution?._tag === "Approved"
                  ? resumeApproved(0, toolCallBatch, toolCallIndex, call, registry)
                  : toolCallIndex === suspendedIndex && resolution !== undefined
                    ? (Stream.fromEffect(
                        Effect.sync(() => {
                          const result = resolvedToolResult(
                            call,
                            resolution as Exclude<ResumeResolution, { readonly _tag: "Approved" }>,
                          )
                          state.pending.set(toolCallIndex, result)
                          return { _tag: "ToolExecutionCompleted" as const, turn: 0, call, result }
                        }),
                      ) as ReturnType<typeof toolCallEvents>)
                    : toolCallEvents(0, toolCallBatch, toolCallIndex, call, checkpoint.messages, registry)
              }
              return scheduleTools(executions, activeAgent.toolScheduling, execute)
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
  const runStream =
    validatedResume === undefined ? runTurn(options.turnStart ?? 0, initialPrompt) : resumeStream(validatedResume)
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
            yield* recordSuspension({
              waitId: suspension.tool_call_id,
              reason: suspension.reason,
              token: suspension.token,
            })
            yield* syncSession(state.turn, checkpoint)
            return Stream.concat(
              Stream.fromIterable<Event>([turnCompletedEvent(state, state.turn, checkpoint)]),
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
        deliverPending.pipe(Effect.map(() => [...flushTelemetry(), event])),
    ),
    Stream.flattenIterable,
    Stream.concat(Stream.unwrap(deliverPending.pipe(Effect.map(() => Stream.fromIterable(flushTelemetry()))))),
    Stream.catchCause((cause) => {
      if (Cause.hasInterrupts(cause)) return Stream.failCause<RunError>(cause)
      const reason = cause.reasons.length === 1 ? cause.reasons[0] : undefined
      if (reason !== undefined && Cause.isFailReason(reason) && Schema.is(DeliveryFailed)(reason.error)) {
        return Stream.failCause<RunError>(cause)
      }
      return Stream.unwrap(
        deliverPending.pipe(
          Effect.map(() => Stream.concat(Stream.fromIterable(flushTelemetry()), Stream.failCause<RunError>(cause))),
        ),
      )
    }),
  )
}
