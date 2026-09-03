import { Cause, Effect, Ref, Schema, Stream } from "effect"
import { AiError, LanguageModel, Prompt, Response, Tool } from "effect/unstable/ai"
import { AgentError, AgentSuspended, type Event, InvalidOutput, DuplicateToolCallId } from "../event.js"
import {
  CurrentCompactionId,
  CurrentInstrumentation,
  CurrentPurpose,
  CurrentSummaryCall,
  SinkFailed,
} from "../../model/telemetry/events.js"
import { PolicyError, type Decision, type TurnOverrides, type Policy } from "../../turn/policy.js"
import { LanguageModelNotRegistered } from "../../model/registry.js"
import { ModelResponseContent } from "../../context/session.js"
import type { PendingToolResult } from "../tools/result.js"
import type { ToolCheckpoint } from "../suspension.js"
import { pendingResult, projectableResults } from "../tools/checkpoint.js"
import type { RunError } from "../service.js"
import type { Input } from "../../turn/steering.js"
import { applyPromptChain, errorMessage, providerOutputState } from "../message.js"
import {
  type LoopServices,
  type ObjectSchema,
  requiredField,
  type RunLoopContext,
  type StructuredRunConfig,
  type TurnServices,
} from "./context.js"
import { select } from "../../tools/tool-registry.js"
import {
  checkpoint as driverCheckpoint,
  intercept,
  logicalOperationId,
  setToolBatch,
} from "../../durable/driver/run.js"
import { operationKey } from "../../durable/driver/interpreter.js"
import { LoopDriverState, modelCallOrdinal } from "../../durable/loop-driver-state.js"
import { HandoffRequirementsMissing, type HandoffRunState } from "../handoff/state.js"
import { DriverStateInvalid } from "../../durable/service.js"
import { terminalCompletedEvent, turnCompletedEvent } from "../model-turn/finish.js"
import { resumeBatch } from "../tools/resume-batch.js"
import { isClosed } from "../lifecycle/closure-identity.js"
import { afterTurnFor } from "./after-turn.js"
import { runEnd as applyRunEnd, steer as applySteer, turnStart as applyTurnStart } from "../lifecycle/hooks.js"
import { GateFailed } from "../gates/definition.js"
import { evaluate as evaluateGates } from "../gates/evaluation.js"
import { retryPrompt as gateRetryPrompt } from "../gates/prompt.js"
import { persistResponsePart, promptFromResponseParts, resolvePrompt } from "../../../media/prompt.js"

type ActiveAgent = HandoffRunState["active"]["agent"]
type ClosedPolicyAgent = Omit<ActiveAgent, "policy"> & { readonly policy: Policy<never> }
const StructuredOutputError = Schema.Union([AgentError, InvalidOutput, AiError.AiError, LanguageModelNotRegistered])
const structuredResponseSchema = <S extends ObjectSchema>(
  schema: S,
): Schema.Codec<
  { readonly value: S["Type"]; readonly content: typeof ModelResponseContent.Encoded },
  unknown,
  S["DecodingServices"],
  S["EncodingServices"]
> => Schema.Struct({ value: requiredField(schema), content: Schema.toEncoded(ModelResponseContent) })
const hasClosedPolicy = (agent: ActiveAgent): agent is ClosedPolicyAgent =>
  isClosed(agent) || agent.policy.snapshot !== undefined

export const make = <
  Tools extends Record<string, Tool.Any>,
  R,
  PolicyServices extends R,
  AuthorizationServices extends R,
  StructuredOutputSchema extends ObjectSchema = ObjectSchema,
  OutputValue = never,
>(
  context: RunLoopContext<Tools, R, PolicyServices, AuthorizationServices, StructuredOutputSchema, OutputValue>,
): Stream.Stream<Event, RunError, LoopServices<Tools, R, StructuredOutputSchema>> => {
  const {
    agent,
    options,
    state,
    chat,
    chain,
    inbox,
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
    checkpointSuspended,
    pendingResults,
    toolCallEvents,
    resumeApproved,
    transformResolved,
    handoffStateRef,
  } = context
  const structuredFinalEvents = (
    structuredTurn: number,
    config: StructuredRunConfig<StructuredOutputSchema, OutputValue>,
    onPending: (input: { readonly prompt: Prompt.RawInput }) => void,
  ): Stream.Stream<Event, RunError, TurnServices<R, StructuredOutputSchema>> =>
    Stream.unwrap(
      Effect.gen(function* () {
        const turnPrompt = yield* applyTurnStart({
          runId: inbox.runId,
          agentName: agent.name,
          turn: structuredTurn,
          prompt: Prompt.make(config.objectPrompt),
        })
        const transformedPrompt = yield* applyPromptChain(chain, turnPrompt, {
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
            success: structuredResponseSchema(config.schema),
            failure: StructuredOutputError,
          },
          resolvePrompt(Prompt.concat(history, transformedPrompt)).pipe(
            Effect.mapError((cause) =>
              AgentError.make({
                message: "Structured output prompt media cannot be resolved",
                turn: structuredTurn,
                cause,
              }),
            ),
            Effect.flatMap((prompt) =>
              LanguageModel.generateObject({
                prompt,
                schema: config.schema,
                objectName: config.objectName,
                toolChoice: "none",
              }),
            ),
            withModelTelemetry(structuredTurn, "structured-output"),
            withAgentModel,
            Effect.catchCause(
              (
                cause,
              ): Effect.Effect<never, AgentError | InvalidOutput | AiError.AiError | LanguageModelNotRegistered> => {
                const reason = cause.reasons.length === 1 ? cause.reasons[0] : undefined
                if (
                  reason !== undefined &&
                  Cause.isFailReason(reason) &&
                  AiError.isAiError(reason.error) &&
                  reason.error.reason._tag === "StructuredOutputError"
                ) {
                  return Effect.fail(InvalidOutput.make({ issues: [reason.error.reason.description] }))
                }
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
            Effect.flatMap((generated) =>
              Effect.forEach(generated.content, persistResponsePart).pipe(
                Effect.mapError((cause) =>
                  AgentError.make({
                    message: "Structured output generated media cannot be persisted",
                    turn: structuredTurn,
                    cause,
                  }),
                ),
                Effect.flatMap((storedContent) => Schema.encodeEffect(ModelResponseContent)(storedContent)),
                Effect.map((content) => ({ value: generated.value, content })),
                Effect.mapError((error) =>
                  AgentError.make({
                    message: `Structured output response cannot be persisted: ${error.message}`,
                    turn: structuredTurn,
                    cause: error,
                  }),
                ),
              ),
            ),
          ),
        )
        const decodedContent = yield* Schema.decodeEffect(ModelResponseContent)(response.content).pipe(
          Effect.mapError((error) =>
            DriverStateInvalid.make({ message: `Structured output response cannot be replayed: ${error.message}` }),
          ),
        )
        const content = decodedContent.map((part) => {
          if (part.type === "tool-call") return Response.makePart("tool-call", part)
          if (part.type === "tool-result") return Response.makePart("tool-result", part)
          return part
        })
        yield* captureStructuredUsage(content)
        const transcript = Prompt.concat(Prompt.concat(history, transformedPrompt), promptFromResponseParts(content))
        yield* applyCompactionResult(
          structuredTurn,
          { _tag: "Microcompact", history: transcript, prompt: Prompt.empty },
          (yield* syncSession(structuredTurn, history)).at(-1)?.id ?? null,
          "structured-output",
        )
        const completion = yield* inbox.complete
        if (completion._tag === "Closed") {
          const output = config.output(response.value)
          const evaluated = yield* evaluateGates({
            agent,
            runVerifier: context.runGateVerifier,
            turn: structuredTurn,
            output,
          })
          const gateEvents: ReadonlyArray<Event> = evaluated.results.map((result) => ({
            _tag: "GateResult",
            turn: structuredTurn,
            ...result,
          }))
          if (evaluated.failed === undefined) {
            return Stream.fromIterable<Event>([
              ...gateEvents,
              terminalCompletedEvent(state, structuredTurn, transcript, output),
            ])
          }
          if (agent.onGateFailure === "retry") {
            onPending({ prompt: gateRetryPrompt(evaluated.failed) })
            return Stream.fromIterable<Event>([turnCompletedEvent(state, structuredTurn, transcript), ...gateEvents])
          }
          return Stream.concat(
            Stream.fromIterable<Event>(gateEvents),
            Stream.fail(GateFailed.make({ gate: evaluated.failed })),
          )
        }
        const prompt = yield* applySteer({
          runId: inbox.runId,
          agentName: agent.name,
          turn: structuredTurn,
          queue: completion.queue,
          count: completion.inputs.length,
          prompt: promptFromSteeringInputs(completion.inputs),
        })
        onPending({ prompt })
        return Stream.fromIterable<Event>([
          turnCompletedEvent(state, structuredTurn, transcript),
          context.steeringDrainedEvent(structuredTurn, completion.queue, completion.inputs),
        ])
      }),
    )
  const promptFromSteeringInputs = (inputs: ReadonlyArray<Input>): Prompt.Prompt =>
    inputs.reduce<Prompt.Prompt>((prompt, input) => Prompt.concat(prompt, input.prompt), Prompt.empty)
  const takeSteering = (): Effect.Effect<ReadonlyArray<Input>> => inbox.takeSteering
  const takeFollowUp = (): Effect.Effect<ReadonlyArray<Input>> => inbox.takeFollowUp
  const activeAgent = () =>
    handoffStateRef === undefined
      ? Effect.succeed(agent)
      : Ref.get(handoffStateRef).pipe(Effect.map((handoffRun) => handoffRun.active.agent))
  const decidePolicy = (
    info: Parameters<typeof agent.policy.decide>[0],
  ): Effect.Effect<Decision, PolicyError | HandoffRequirementsMissing, R> => {
    if (handoffStateRef === undefined) return agent.policy.decide(info)
    return Ref.get(handoffStateRef).pipe(
      Effect.flatMap((handoffRun): Effect.Effect<Decision, PolicyError | HandoffRequirementsMissing, R> => {
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
  const afterTurn = afterTurnFor({
    context,
    decidePolicy,
    takeFollowUp,
    takeSteering,
    takeCompletion: () => inbox.complete,
    promptFromSteeringInputs,
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
    const currentTurn = Stream.fromEffect(
      applyTurnStart({
        runId: inbox.runId,
        agentName: agent.name,
        turn,
        prompt: Prompt.make(prompt),
      }),
    ).pipe(
      Stream.flatMap((turnPrompt) =>
        Stream.fromIterable<Event>([{ _tag: "TurnStarted", turn }]).pipe(
          Stream.concat(resetTurnState(turn)),
          Stream.concat(
            Stream.unwrap(
              Ref.get(toolState).pipe(Effect.map(({ registry }) => modelTurn(turn, turnPrompt, registry, overrides))),
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
        ),
      ),
      Stream.withSpan("Generalist.Agent.turn", { attributes: { "generalist.turn": turn } }),
    )
    return Stream.concat(
      currentTurn,
      Stream.suspend(() => {
        if (structuredTurn !== undefined && structured !== undefined) {
          const finalTurn = structuredTurn
          return Stream.concat(
            structuredFinalEvents(finalTurn, structured, (pending) => {
              next = pending
            }).pipe(Stream.withSpan("Generalist.Agent.turn", { attributes: { "generalist.turn": finalTurn } })),
            Stream.suspend(() =>
              next === undefined ? Stream.empty : runTurn(finalTurn + 1, next.prompt, next.overrides),
            ),
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
              return resumeBatch({
                checkpoint: checkpoint.checkpoint,
                messages: checkpoint.messages,
                resolutions: options.resume?.resolutions ?? [],
                registry,
                toolScheduling: resumedAgent.toolScheduling,
                toolCallEvents,
                resumeApproved,
                transformResolved,
                onCheckpoint: (current) =>
                  Effect.sync(() => {
                    for (const [index, result] of projectableResults(
                      current,
                      checkpoint.projectedResults,
                      new Set(state.pending.keys()),
                    )) {
                      state.pending.set(index, result)
                    }
                    if (
                      state.pending.size === 0 &&
                      current.calls.length > 0 &&
                      current.calls.every(
                        (entry) =>
                          entry.state._tag === "Completed" &&
                          checkpoint.projectedResults.has(`${entry.call.id}\0${entry.call.name}`),
                      )
                    ) {
                      alreadyProjectedPending = current.calls.flatMap((entry) =>
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
      Stream.withSpan("Generalist.Agent.turn", { attributes: { "generalist.turn": turn } }),
    )
    return Stream.concat(
      currentTurn,
      Stream.suspend(() => (next === undefined ? Stream.empty : runTurn(turn + 1, next.prompt, next.overrides))),
    )
  }
  const toolCheckpoint = validatedResume ?? recoveredToolCheckpoint
  const startTurn =
    options.turnStart ?? context.initialTurn ?? options.driverCheckpoint?.turn ?? toolCheckpoint?.checkpoint.turn ?? 0
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
    Stream.mapEffect((event) => {
      if (event._tag !== "Completed") return Effect.succeed(event)
      return applyRunEnd({
        runId: inbox.runId,
        agentName: agent.name,
        turns: event.turns,
        text: event.text,
        output: event.output,
        transcript: event.transcript,
      }).pipe(Effect.map((result): Event => ({ ...event, output: result.output })))
    }),
    Stream.mapEffect(
      (event): Effect.Effect<ReadonlyArray<Event>, RunError> =>
        deliverPending.pipe(Effect.map(() => [...flushTelemetry(), event])),
    ),
    Stream.flattenIterable,
    Stream.concat(Stream.unwrap(deliverPending.pipe(Effect.map(() => Stream.fromIterable(flushTelemetry()))))),
    Stream.catchCause((cause) => {
      if (Cause.hasInterrupts(cause)) return Stream.failCause<RunError>(cause)
      const reason = cause.reasons.length === 1 ? cause.reasons[0] : undefined
      if (reason !== undefined && Cause.isFailReason(reason) && Schema.is(SinkFailed)(reason.error)) {
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
