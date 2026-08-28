import { Cause, Effect, Option, Ref, Schema, Stream } from "effect"
import { AiError, LanguageModel, Prompt, Response, Tool } from "effect/unstable/ai"
import { AgentError, AgentSuspended, type Event, type StructuredOutput, DuplicateToolCallId } from "../event.js"
import {
  CurrentCompactionId,
  CurrentInstrumentation,
  CurrentPurpose,
  CurrentSummaryCall,
  DeliveryFailed,
} from "../../model/telemetry/events.js"
import { TurnPolicyError, type Decision, type TurnOverrides, type TurnPolicy } from "../../turn/policy.js"
import type { LanguageModelNotRegistered } from "../../model/registry.js"
import type { AnyToolCall } from "../tools/result.js"
import { resolvedToolResult, type ToolCheckpoint } from "../suspension.js"
import type { RunError } from "../service.js"
import type { Input } from "../../turn/steering.js"
import { applyPromptChain, errorMessage, providerOutputState } from "../message.js"
import type {
  LoopServices,
  ObjectSchema,
  RunLoopContext,
  SchemaServicesD,
  StructuredRunConfig,
  TurnServices,
} from "./context.js"
import type { Request } from "../../tools/tool-executor.js"
import { select } from "../../tools/tool-registry.js"
import {
  checkpoint as driverCheckpoint,
  intercept,
  logicalOperationId,
  recordSuspension,
  setHandoffState,
} from "../../durable/driver/run.js"
import { operationKey, type DriverInterpreter } from "../../durable/driver/interpreter.js"
import { LoopDriverState, modelCallOrdinal } from "../../durable/loop-driver-state.js"
import { HandoffRequirementsMissing, type HandoffRunState, takePendingContinuation } from "../handoff/state.js"
import { DriverStateInvalid } from "../../durable/service.js"
import { terminalCompletedEvent, TurnFinish, turnCompletedEvent } from "../model-turn/finish.js"
import { schedule as scheduleTools } from "../tools/scheduler.js"
import { isClosed } from "../lifecycle/closure-identity.js"

type ActiveAgent = HandoffRunState["active"]["agent"]
type ClosedPolicyAgent = Omit<ActiveAgent, "policy"> & { readonly policy: TurnPolicy<never> }
const hasClosedPolicy = (agent: ActiveAgent): agent is ClosedPolicyAgent =>
  isClosed(agent) || agent.policy.snapshot !== undefined

export const make = <
  Tools extends Record<string, Tool.Any>,
  R,
  StructuredOutputSchema extends ObjectSchema = ObjectSchema,
>(
  context: RunLoopContext<Tools, R, StructuredOutputSchema>,
): Stream.Stream<Event, RunError, LoopServices<Tools, R, StructuredOutputSchema>> => {
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
    recoveredToolCheckpoint,
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
  ): Stream.Stream<Event, RunError, TurnServices<StructuredOutputSchema>> =>
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
            turn: structuredTurn,
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
        yield* applyCompactionResult(
          structuredTurn,
          { _tag: "Microcompact", history: transcript, prompt: Prompt.empty },
          (yield* syncSession(structuredTurn, history)).at(-1)?.id ?? null,
          "structured-output",
        )
        if (Option.isNone(activeSession)) yield* savePersisted(structuredTurn)
        const structuredOutput: StructuredOutput = {
          _tag: "StructuredOutput",
          turn: structuredTurn,
          ...structuredIdentity,
          value: response.value,
          content: response.content,
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
  const activeAgent = () =>
    handoffStateRef === undefined
      ? Effect.succeed(agent)
      : Ref.get(handoffStateRef).pipe(Effect.map((handoffRun) => handoffRun.active.agent))
  const decidePolicy = (
    info: Parameters<typeof agent.policy.decide>[0],
  ): Effect.Effect<Decision, TurnPolicyError | HandoffRequirementsMissing, R> => {
    if (handoffStateRef === undefined) return agent.policy.decide(info)
    return Ref.get(handoffStateRef).pipe(
      Effect.flatMap((handoffRun): Effect.Effect<Decision, TurnPolicyError | HandoffRequirementsMissing, R> => {
        if (handoffRun.active.name === handoffRun.root) return agent.policy.decide(info)
        if (hasClosedPolicy(handoffRun.active.agent)) {
          return handoffRun.active.agent.policy.decide(info)
        }
        return HandoffRequirementsMissing.make({
          target: handoffRun.active.name,
          message: "Same-run handoff target requirements are not closed",
          turn: info.turn,
        })
      }),
    )
  }
  const afterTurn = (
    turn: number,
  ): Effect.Effect<
    {
      readonly events: Stream.Stream<
        Event,
        RunError,
        LanguageModel.LanguageModel | SchemaServicesD<StructuredOutputSchema>
      >
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
              Stream.fail(TurnFinish.missingOutputFailure(state, turn)),
            ),
          }
        }
        yield* savePersisted(turn)
        return {
          events: Stream.fromIterable<Event>([completed, terminalCompletedEvent(state, turn, transcript)]),
        }
      }
      const evaluated = yield* decidePolicy({
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
            Stream.fail(TurnFinish.policyStopFailure(decision, turn + 1, pendingCalls)),
          ),
        }
      }
      state.pending.clear()
      const steering = yield* takeSteering()
      const basePrompt = steering.length === 0 ? Prompt.empty : promptFromSteeringInputs(steering)
      let continuationOverrides = decision.overrides
      let continuationPrompt = basePrompt
      if (handoffStateRef !== undefined) {
        const pendingContinuation = yield* takePendingContinuation(handoffStateRef, (handoff) =>
          setHandoffState(handoff),
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
      const next = continuationOverrides === undefined ? { prompt } : { prompt, overrides: continuationOverrides }
      return {
        events: Stream.fromIterable<Event>(
          steering.length === 0 ? [completed] : [completed, steeringDrainedEvent(turn, "steering", steering)],
        ),
        next,
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
  ): Stream.Stream<Event, RunError, LoopServices<Tools, R, StructuredOutputSchema>> => {
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
      Stream.withSpan("TenetKit.Agent.turn", { attributes: { "tenetkit.turn": turn } }),
    )
    return Stream.concat(
      currentTurn,
      Stream.suspend(() => {
        if (structuredTurn !== undefined && structured !== undefined) {
          return structuredFinalEvents(structuredTurn, structured).pipe(
            Stream.withSpan("TenetKit.Agent.turn", { attributes: { "tenetkit.turn": structuredTurn } }),
          )
        }
        return next === undefined ? Stream.empty : runTurn(turn + 1, next.prompt, next.overrides)
      }),
    )
  }
  const resumeStream = (checkpoint: ToolCheckpoint, turn: number) => {
    let next:
      | {
          readonly prompt: Prompt.RawInput
          readonly overrides?: TurnOverrides
        }
      | undefined
    const currentTurn = resetTurnState(turn).pipe(
      Stream.concat(
        Stream.unwrap(
          Effect.all({ tools: Ref.get(toolState), activeAgent: activeAgent() }).pipe(
            Effect.map(({ tools, activeAgent: resumedAgent }) => {
              const suspension = checkpoint.suspension
              const activeTools = suspension?.active_tools
              const registry = activeTools === undefined ? tools.registry : select(tools.registry, activeTools)
              const calls = checkpoint.toolCallBatch.map((call) =>
                Response.makePart("tool-call", {
                  id: call.id,
                  name: call.name,
                  params: call.params,
                  providerExecuted: call.providerExecuted,
                  metadata: call.metadata,
                }),
              )
              const toolCallBatch: Request["toolCallBatch"] = { calls }
              const suspendedIndex = suspension?.tool_call_index ?? 0
              if (suspension !== undefined && calls[suspendedIndex] === undefined) {
                return Stream.fail(
                  AgentError.make({ message: "Suspension tool call index is outside its batch", turn }),
                )
              }
              const executions = checkpoint.unresolvedToolCallIndexes.flatMap((toolCallIndex) => {
                const call = calls[toolCallIndex]
                return call === undefined ? [] : [{ call, toolCallIndex }]
              })
              const execute = ({
                call,
                toolCallIndex,
              }: {
                readonly call: AnyToolCall
                readonly toolCallIndex: number
              }): ReturnType<typeof toolCallEvents> => {
                const resolution = options.resume?.resolution
                if (suspension !== undefined && toolCallIndex === suspendedIndex && resolution?._tag === "Approved") {
                  return resumeApproved(turn, toolCallBatch, toolCallIndex, call, registry)
                }
                if (
                  suspension !== undefined &&
                  toolCallIndex === suspendedIndex &&
                  resolution !== undefined &&
                  resolution._tag !== "Approved"
                ) {
                  return Stream.fromEffect(
                    Effect.sync(() => {
                      const result = resolvedToolResult(call, resolution)
                      state.pending.set(toolCallIndex, result)
                      return { _tag: "ToolExecutionCompleted" as const, turn, call, result }
                    }),
                  )
                }
                return toolCallEvents(turn, toolCallBatch, toolCallIndex, call, checkpoint.messages, registry)
              }
              return scheduleTools(executions, resumedAgent.toolScheduling, execute)
            }),
          ),
        ),
      ),
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
      Stream.withSpan("TenetKit.Agent.turn", { attributes: { "tenetkit.turn": turn } }),
    )
    return Stream.concat(
      currentTurn,
      Stream.suspend(() => (next === undefined ? Stream.empty : runTurn(turn + 1, next.prompt, next.overrides))),
    )
  }
  const startTurn = options.turnStart ?? options.driverCheckpoint?.turn ?? 0
  const toolCheckpoint = validatedResume ?? recoveredToolCheckpoint
  const runStream =
    toolCheckpoint === undefined ? runTurn(startTurn, initialPrompt) : resumeStream(toolCheckpoint, startTurn)
  const guardedStream = runStream.pipe(
    Stream.catchCause((cause) => {
      const reason = cause.reasons.length === 1 ? cause.reasons[0] : undefined
      if (reason !== undefined && Cause.isFailReason(reason) && Schema.is(DuplicateToolCallId)(reason.error)) {
        return Stream.failCause<RunError>(cause)
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
