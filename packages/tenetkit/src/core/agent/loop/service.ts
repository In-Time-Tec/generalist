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
import type { AnyToolCall, PendingToolResult } from "../tools/result.js"
import { resolvedToolResult, type ToolCheckpoint } from "../suspension.js"
import {
  completed as checkpointCompleted,
  pendingResult,
  projectableResults,
  resolutionFor,
  updateCall,
  waits as batchWaits,
} from "../tools/checkpoint.js"
import type { RunError } from "../service.js"
import type { Input } from "../../turn/steering.js"
import { applyPromptChain, errorMessage, providerOutputState } from "../message.js"
import type { LoopServices, ObjectSchema, RunLoopContext, StructuredRunConfig, TurnServices } from "./context.js"
import type { Request } from "../../tools/tool-executor.js"
import { select } from "../../tools/tool-registry.js"
import {
  checkpoint as driverCheckpoint,
  intercept,
  logicalOperationId,
  setToolBatch,
  updateToolBatch,
} from "../../durable/driver/run.js"
import { operationKey } from "../../durable/driver/interpreter.js"
import { LoopDriverState, modelCallOrdinal } from "../../durable/loop-driver-state.js"
import { HandoffRequirementsMissing, type HandoffRunState } from "../handoff/state.js"
import { DriverStateInvalid } from "../../durable/service.js"
import { terminalCompletedEvent, turnCompletedEvent } from "../model-turn/finish.js"
import { schedule as scheduleTools } from "../tools/scheduler.js"
import { isClosed } from "../lifecycle/closure-identity.js"
import { afterTurnFor } from "./after-turn.js"

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
    deliverPending,
    flushTelemetry,
    telemetryIdentity,
    checkpointSuspended,
    pendingResults,
    toolCallEvents,
    resumeApproved,
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
  const afterTurn = afterTurnFor({ context, decidePolicy, takeFollowUp, takeSteering, promptFromSteeringInputs })
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
    let alreadyProjectedPending: ReadonlyArray<PendingToolResult> | undefined
    const currentTurn = resetTurnState(turn).pipe(
      Stream.concat(
        Stream.unwrap(
          Effect.all({ tools: Ref.get(toolState), activeAgent: activeAgent() }).pipe(
            Effect.map(({ tools, activeAgent: resumedAgent }) => {
              const registry = select(tools.registry, checkpoint.checkpoint.activeTools)
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
              const executions = checkpoint.checkpoint.calls.flatMap((entry, toolCallIndex) => {
                const call = calls[toolCallIndex]
                return call === undefined ? [] : [{ call, entry, toolCallIndex }]
              })
              const execute = ({
                call,
                entry,
                toolCallIndex,
              }: {
                readonly call: AnyToolCall
                readonly entry: ToolCheckpoint["checkpoint"]["calls"][number]
                readonly toolCallIndex: number
              }): ReturnType<typeof toolCallEvents> => {
                if (entry.state._tag === "Completed") {
                  return Stream.empty
                }
                if (entry.state._tag === "Unknown" || entry.state._tag === "Cancelled") {
                  return Stream.fail(
                    AgentError.make({ message: `Tool call ${call.id} is ${entry.state._tag.toLowerCase()}`, turn }),
                  )
                }
                if (entry.state._tag === "Waiting") {
                  const resolution = resolutionFor(options.resume?.resolutions ?? [], entry.state.waitId)
                  if (resolution === undefined) return Stream.empty
                  if (resolution._tag === "Approved") {
                    return Stream.unwrap(
                      updateToolBatch((current) =>
                        updateCall(current, {
                          callIndex: toolCallIndex,
                          state: { _tag: "Ready", stage: "execution" },
                        }),
                      ).pipe(Effect.map(() => resumeApproved(turn, toolCallBatch, toolCallIndex, call, registry))),
                    )
                  }
                  return Stream.fromEffect(
                    Effect.gen(function* () {
                      const result = resolvedToolResult(call, resolution)
                      yield* updateToolBatch((current) => checkpointCompleted(current, toolCallIndex, result))
                      return { _tag: "ToolExecutionCompleted" as const, turn, call, result }
                    }),
                  )
                }
                return entry.state.stage === "execution"
                  ? resumeApproved(turn, toolCallBatch, toolCallIndex, call, registry)
                  : toolCallEvents(turn, toolCallBatch, toolCallIndex, call, checkpoint.messages, registry)
              }
              return scheduleTools(executions, resumedAgent.toolScheduling, {
                execute,
                afterStage: () =>
                  Effect.gen(function* () {
                    const current = yield* driverCheckpoint
                    const driverState = yield* Schema.decodeUnknownEffect(LoopDriverState)(current.state).pipe(
                      Effect.mapError((error) => DriverStateInvalid.make({ message: String(error) })),
                    )
                    if (driverState.toolBatch === undefined) return
                    for (const [index, result] of projectableResults(
                      driverState.toolBatch,
                      checkpoint.projectedResults,
                      new Set(state.pending.keys()),
                    )) {
                      state.pending.set(index, result)
                    }
                    const waits = batchWaits(driverState.toolBatch)
                    if (waits.length > 0) {
                      return yield* AgentSuspended.make({ checkpoint: driverState.toolBatch, waits })
                    }
                    if (
                      state.pending.size === 0 &&
                      driverState.toolBatch.calls.length > 0 &&
                      driverState.toolBatch.calls.every(
                        (entry) =>
                          entry.state._tag === "Completed" &&
                          checkpoint.projectedResults.has(`${entry.call.id}\0${entry.call.name}`),
                      )
                    ) {
                      alreadyProjectedPending = driverState.toolBatch.calls.flatMap((entry) =>
                        entry.state._tag === "Completed" ? [pendingResult(entry.state.result)] : [],
                      )
                    }
                  }),
              })
            }),
          ),
        ),
      ),
      Stream.concat(Stream.fromEffect(setToolBatch(undefined)).pipe(Stream.drain)),
      Stream.concat(
        Stream.unwrap(
          afterTurn(turn, alreadyProjectedPending).pipe(
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
  const toolCheckpoint = validatedResume ?? recoveredToolCheckpoint
  const startTurn = options.turnStart ?? options.driverCheckpoint?.turn ?? toolCheckpoint?.checkpoint.turn ?? 0
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
