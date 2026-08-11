import { Cause, Channel, Effect, Exit, HashMap, Option, Ref, Schema, Stream } from "effect"
import { AiError, LanguageModel, Prompt, Response, Tool, Toolkit } from "effect/unstable/ai"
import { DriverInterpreter } from "../durable/driver-interpreter.js"
import { AgentError, type Event } from "./agent-event.js"
import { coalesceAdjacentText } from "../context/session-sync.js"
import { applyPartChain, applyPromptChain } from "./agent-message.js"
import { type Registry, select } from "../tools/tool-registry.js"
import { type Request } from "../tools/tool-executor.js"
import { classifyFailure as classifyModelFailure, type LanguageModelNotRegistered } from "../model/model-registry.js"
import { CurrentInstrumentation, CurrentPurpose, type ModelCallPurpose } from "../model/model-telemetry.js"
import { type AnyToolCall, type ToolCallIdState } from "./agent-tool-result.js"
import type { RuntimeContext, StaticToolServices } from "./model-turn-context.js"
import {
  InvalidToolCallParameters,
  isInvalidToolCallParameters,
  prepare as prepareToolCallValidation,
  ToolJsonSchemaCompilerMissing,
  validateDecodedToolCall,
} from "../model/model-tool-call-validation.js"
import { DuplicateToolCallId, MiddlewareViolation } from "./agent-event.js"
import type { RunError, ToolSchedulingPolicy } from "./agent.js"
import type { TurnOverrides } from "../turn/turn-policy.js"
import { wrapDriverAttempt } from "./model-turn-driver.js"
import type { AttemptCompleted, AttemptEvent, CompletedModelOperation } from "../model/model-operation.js"
import { captureFinishPart, captureStructuredUsage, chargeAttemptUsageWith } from "./model-turn-finish.js"
import { schedule as scheduleTools } from "./tool-scheduler.js"
import { classifyOtherFailure, isToolNameCollision, makeRetryableOverflow, singleFailure } from "./model-turn-parts.js"
import { committedEvent } from "./model-turn-commit.js"
import { text as modelResponseText } from "../model/model-response-builder.js"
import { clearCommittedResponse, makeAttemptResponse } from "./model-turn-response.js"
import { makeActiveTurn } from "./model-turn-active.js"
export const makeModelTurn = <T extends Record<string, Tool.Any>, R>(context: RuntimeContext<T, R>) => {
  const {
    agent,
    handoffStateRef,
    agentModel,
    agentModelRegistry,
    resilienceService,
    activeModelResponse,
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
  } = context
  const { activeAgentName, activeModelSelection, activeToolScheduling } = makeActiveTurn({
    agent,
    ...(handoffStateRef === undefined ? {} : { handoffStateRef }),
    agentModel,
  })
  const captureProviderOutput = (part: Response.StreamPart<Record<string, Tool.Any>>): void => {
    if (part.type === "text-delta") state.providerOutput.textCharacters += part.delta.length
    if (part.type === "reasoning-delta") state.providerOutput.reasoningCharacters += part.delta.length
    if (part.type === "finish") state.providerOutput.finishReason = part.reason
  }
  const withModelTelemetry =
    (turn: number, purpose: ModelCallPurpose) =>
    <A, E, R2>(effect: Effect.Effect<A, E, R2>) =>
      Effect.flatMap(LanguageModel.LanguageModel, (model) =>
        effect.pipe(
          Effect.provideService(LanguageModel.LanguageModel, instrumentModel(model, turn)),
          Effect.provideService(CurrentPurpose, purpose),
        ),
      )
  const withAgentModel = <A, E, R2>(
    effect: Effect.Effect<A, E, R2>,
  ): Effect.Effect<A, E | LanguageModelNotRegistered, R2> =>
    agentModelRegistry === undefined || agentModel === undefined
      ? effect
      : agentModelRegistry.operate(agentModel, effect)
  const partEvents = (
    turn: number,
    part: Response.StreamPart<Record<string, Tool.Any>>,
    identity: Pick<AttemptCompleted, "modelCallId" | "modelAttemptId" | "attempt">,
  ): Stream.Stream<Event, RunError> => {
    if (part.type === "error") {
      if (isToolNameCollision(part.error)) return Stream.fail(part.error)
      return Stream.fail(AgentError.make({ message: errorMessage(part.error), turn, cause: part.error }))
    }
    const modelPart = Stream.fromIterable<Event>([
      {
        _tag: "ModelPart",
        turn,
        modelCallId: identity.modelCallId,
        modelAttemptId: identity.modelAttemptId,
        attempt: identity.attempt,
        part,
      },
    ])
    if (part.type === "finish") {
      return modelPart.pipe(Stream.tap(() => captureFinishPart(state, part)))
    }
    return modelPart
  }
  const transformPart = (
    turn: number,
    toolkit: Toolkit.Toolkit<Record<string, Tool.Any>>,
    part: Response.StreamPart<Record<string, Tool.Any>>,
  ): Effect.Effect<Option.Option<Response.StreamPart<Record<string, Tool.Any>>>, RunError> =>
    applyPartChain(chain, part, { agentName: agent.name, turn }).pipe(
      Effect.flatMap(
        Option.match({
          onSome: (
            transformed,
          ): Effect.Effect<Option.Option<Response.StreamPart<Record<string, Tool.Any>>>, MiddlewareViolation> => {
            if (part.type === "tool-call" && transformed.type !== "tool-call") {
              return Effect.fail(
                MiddlewareViolation.make({
                  turn,
                  detail: "ModelMiddleware replaced a tool-call part with another part type",
                }),
              )
            }
            if (transformed.type !== "tool-call") {
              return Effect.succeed(Option.some<Response.StreamPart<Record<string, Tool.Any>>>(transformed))
            }
            return validateDecodedToolCall(toolkit, transformed).pipe(
              Effect.map((decoded) => Option.some<Response.StreamPart<Record<string, Tool.Any>>>(decoded)),
              Effect.mapError(() =>
                MiddlewareViolation.make({
                  turn,
                  detail: `ModelMiddleware produced invalid parameters for tool '${transformed.name}'`,
                }),
              ),
            )
          },
          onNone: () =>
            part.type === "tool-call"
              ? Effect.fail(
                  MiddlewareViolation.make({
                    turn,
                    detail: "ModelMiddleware dropped a tool-call part",
                  }),
                )
              : Effect.succeed(Option.none()),
        }),
      ),
    )
  const validateToolCallId = (
    idState: Ref.Ref<ToolCallIdState>,
    part: Response.StreamPart<Record<string, Tool.Any>>,
  ): Effect.Effect<void, DuplicateToolCallId> => {
    if (part.type !== "tool-call") return Effect.void
    return Ref.modify(idState, (current) => {
      const existingFirstIndex = HashMap.get(current.firstIndexes, part.id)
      const duplicate = Option.map(existingFirstIndex, (index) =>
        DuplicateToolCallId.make({ id: part.id, firstIndex: index, duplicateIndex: current.nextIndex }),
      )
      return [
        duplicate,
        {
          nextIndex: current.nextIndex + 1,
          firstIndexes: Option.isSome(existingFirstIndex)
            ? current.firstIndexes
            : HashMap.set(current.firstIndexes, part.id, current.nextIndex),
        },
      ]
    }).pipe(
      Effect.flatMap(
        Option.match({
          onNone: () => Effect.void,
          onSome: Effect.fail,
        }),
      ),
    )
  }
  const modelTurn = (turn: number, prompt: Prompt.RawInput, registry: Registry, overrides?: TurnOverrides) =>
    Stream.unwrap(
      Effect.gen(function* () {
        const agentName = yield* activeAgentName()
        const selection = yield* activeModelSelection()
        const toolScheduling = yield* activeToolScheduling()
        const activeRegistry = overrides?.activeTools === undefined ? registry : select(registry, overrides.activeTools)
        const parts = modelTurnBody(turn, prompt, activeRegistry, overrides, agentName, toolScheduling)
        if (overrides?.model !== undefined) return parts.pipe(Stream.provide(overrides.model))
        if (selection === undefined || agentModelRegistry === undefined) return parts
        return agentModelRegistry
          .stream(selection, parts)
          .pipe(
            Stream.catchTag("@batonfx/core/LanguageModelNotRegistered", (error) =>
              Stream.fail(AgentError.make({ message: errorMessage(error), turn: state.turn, cause: error })),
            ),
          )
      }),
    )
  const modelTurnBody = (
    turn: number,
    prompt: Prompt.RawInput,
    activeRegistry: Registry,
    overrides: TurnOverrides | undefined,
    agentName: string,
    toolScheduling: ToolSchedulingPolicy,
  ): Stream.Stream<Event, RunError, LanguageModel.LanguageModel | R | StaticToolServices<T> | DriverInterpreter> => {
    const instrumentTurnStream = <A, E>(
      stream: Stream.Stream<A, E, LanguageModel.LanguageModel | DriverInterpreter>,
    ): Stream.Stream<
      A,
      E | InvalidToolCallParameters | ToolJsonSchemaCompilerMissing | AiError.AiError,
      LanguageModel.LanguageModel | DriverInterpreter
    > =>
      Stream.unwrap(
        LanguageModel.LanguageModel.pipe(
          Effect.flatMap((model) =>
            prepareToolCallValidation(
              model,
              activeRegistry.toolkit,
              Option.match(resilienceService, {
                onNone: () => 0,
                onSome: (resilience) => resilience.invalidToolCallCorrectionLimit,
              }),
            ),
          ),
          Effect.map((validatedModel) =>
            stream.pipe(
              Stream.provideService(LanguageModel.LanguageModel, instrumentModel(validatedModel, turn)),
              Stream.provideService(CurrentInstrumentation, {
                emit: emitTelemetry,
                wrap: (summaryModel) => instrumentModel(summaryModel, turn),
              }),
            ),
          ),
        ),
      )
    let completedResponseAuthority: ReturnType<ReturnType<typeof makeAttemptResponse>["authority"]>
    const attemptBody = (
      activePrompt: Prompt.Prompt,
      retryOverflow: boolean,
      compactOverflow = false,
      overflowCause?: Cause.Cause<RunError>,
      operationKey?: string,
    ): Stream.Stream<AttemptEvent, RunError, LanguageModel.LanguageModel | DriverInterpreter> => {
      let emitted = false
      let classifyFailure = classifyOtherFailure
      const attemptResponse = makeAttemptResponse({
        service: activeModelResponse,
        ...(operationKey === undefined ? {} : { operationKey }),
        turn,
      })
      let preparedState: { readonly history: Prompt.Prompt; readonly preparedPrompt: Prompt.Prompt } | undefined
      const retryableOverflow = makeRetryableOverflow({
        retryOverflow,
        canCompact: Option.isSome(compactionService),
        classify: (error) => classifyFailure(error),
      })
      return Stream.unwrap(
        Effect.succeed(
          Stream.fromChannel(
            Channel.acquireUseRelease(
              Ref.make<ToolCallIdState>({
                nextIndex: 0,
                firstIndexes: HashMap.empty(),
              }),
              (toolCallIds) =>
                Stream.unwrap(
                  Effect.gen(function* () {
                    const activeModel = yield* LanguageModel.LanguageModel
                    classifyFailure = (error) => classifyModelFailure(activeModel, error)
                    const prepared = yield* preparePrompt(turn, activePrompt, compactOverflow)
                    if (compactOverflow && !prepared.changed && overflowCause !== undefined) {
                      return yield* Effect.failCause(overflowCause)
                    }
                    const coalescedContent = prepared.prompt.content.map(coalesceAdjacentText)
                    const preparedPrompt = coalescedContent.some(
                      (message: Prompt.Message, index: number) => message !== prepared.prompt.content[index],
                    )
                      ? Prompt.fromMessages(coalescedContent)
                      : prepared.prompt
                    const history = yield* Ref.get(chat.history)
                    preparedState = { history, preparedPrompt }
                    const responsePrompt = Prompt.concat(history, preparedPrompt)
                    if (Option.isSome(compactionService)) {
                      state.currentContext = responsePrompt
                      state.currentContextTokens = yield* countTokens(turn, responsePrompt)
                    }
                    const messages = responsePrompt.content
                    const rawParts = LanguageModel.streamText({
                      prompt: responsePrompt,
                      toolkit: activeRegistry.toolkit,
                      disableToolCallResolution: true,
                    }).pipe(
                      Stream.mapEffect((part) =>
                        part.type === "error"
                          ? Effect.fail(
                              isToolNameCollision(part.error)
                                ? part.error
                                : AgentError.make({ message: errorMessage(part.error), turn, cause: part.error }),
                            )
                          : Effect.succeed(part),
                      ),
                      Stream.tap((part) =>
                        part.type === "response-metadata"
                          ? Effect.void
                          : Effect.sync(() => {
                              emitted = true
                              captureProviderOutput(part)
                            }),
                      ),
                      Stream.catchCause(
                        (cause): Stream.Stream<Response.StreamPart<Record<string, Tool.Any>>, RunError> => {
                          if (Cause.hasInterrupts(cause) || Cause.hasDies(cause)) return Stream.failCause(cause)
                          if (retryableOverflow(cause, emitted)) return Stream.failCause(cause)
                          const error = singleFailure(cause)
                          if (Option.isNone(error)) return Stream.failCause(cause)
                          if (
                            Schema.is(AgentError)(error.value) ||
                            isToolNameCollision(error.value) ||
                            isInvalidToolCallParameters(error.value)
                          ) {
                            return Stream.fail(error.value)
                          }
                          return Stream.make(Response.makePart("error", { error: error.value }))
                        },
                      ),
                    )
                    return rawParts.pipe(
                      Stream.mapEffect((part) => transformPart(turn, activeRegistry.toolkit, part)),
                      Stream.flatMap(Option.match({ onNone: () => Stream.empty, onSome: Stream.make })),
                      Stream.mapEffect((part) =>
                        validateToolCallId(toolCallIds, part).pipe(
                          Effect.andThen(
                            Effect.sync((): AttemptEvent => {
                              const identity = telemetryIdentity.current
                              if (identity === undefined)
                                throw new Error("ModelPart produced outside an instrumented model attempt")
                              attemptResponse.accept(identity, part)
                              return {
                                _tag: "Part",
                                part,
                                messages,
                                modelCallId: identity.modelCallId,
                                modelAttemptId: identity.modelAttemptId,
                                attempt: identity.attempt,
                              }
                            }),
                          ),
                        ),
                      ),
                      Stream.concat(
                        Stream.fromEffect(
                          Effect.sync((): AttemptEvent => {
                            const identity = telemetryIdentity.current
                            if (identity === undefined)
                              throw new Error("Model attempt completed outside an instrumented model attempt")
                            const response = attemptResponse.complete(identity)
                            completedResponseAuthority = attemptResponse.authority()
                            return {
                              _tag: "Completed",
                              messages,
                              modelCallId: identity.modelCallId,
                              modelAttemptId: identity.modelAttemptId,
                              attempt: identity.attempt,
                              response,
                            }
                          }),
                        ),
                      ),
                    )
                  }),
                ).pipe(Stream.toChannel),
              (_toolCallIds, _exit: Exit.Exit<unknown, RunError>) => Effect.void,
            ),
          ),
        ),
      ).pipe(
        Stream.catchCause((cause) => {
          if (Cause.hasInterrupts(cause) || Cause.hasDies(cause)) return Stream.failCause(cause)
          if (retryableOverflow(cause, emitted)) {
            attemptResponse.discard()
            return attemptBody(
              preparedState?.preparedPrompt ?? activePrompt,
              false,
              true,
              cause as Cause.Cause<RunError>,
              operationKey,
            )
          }
          return Stream.failCause(cause)
        }),
        Stream.catchCause((cause) => {
          const failure = singleFailure(cause)
          return Option.isSome(failure) && AiError.isAiError(failure.value)
            ? Stream.fail(AgentError.make({ message: errorMessage(failure.value), turn, cause: failure.value }))
            : Stream.failCause(cause)
        }),
      )
    }
    let completedOperation: CompletedModelOperation | undefined
    let completedAttempt: AttemptCompleted | undefined
    const driverAttempt = wrapDriverAttempt({
      turn,
      toolkit: activeRegistry.toolkit,
      attemptBody,
      completed: (operation, attempt) => {
        completedOperation = operation
        completedAttempt = attempt
      },
    })
    const parts = Stream.unwrap(
      applyPromptChain(chain, Prompt.make(prompt), { agentName, turn }).pipe(
        Effect.map((transformedPrompt) => {
          let nextToolCallIndex = 0
          const calls = new Array<AnyToolCall>()
          const executions = new Array<{
            readonly call: AnyToolCall
            readonly messages: ReadonlyArray<Prompt.Message>
            readonly toolCallIndex: number
          }>()
          const toolCallBatch: Request["toolCallBatch"] = { calls }
          const accepted = instrumentTurnStream(driverAttempt(transformedPrompt, true)).pipe(
            Stream.filter((event): event is Extract<AttemptEvent, { readonly _tag: "Part" }> => event._tag === "Part"),
            Stream.map(({ part, messages, modelCallId, modelAttemptId, attempt }) => {
              const toolCallIndex = nextToolCallIndex
              if (part.type === "tool-call" && part.providerExecuted !== true) {
                const call = part as AnyToolCall
                nextToolCallIndex += 1
                calls.push(call)
                executions.push({ call, messages, toolCallIndex })
              }
              return { part, modelCallId, modelAttemptId, attempt, toolCallIndex }
            }),
            Stream.flatMap(({ part, modelCallId, modelAttemptId, attempt }) =>
              partEvents(turn, part, { modelCallId, modelAttemptId, attempt }),
            ),
          )
          const committed = Stream.fromEffect(
            Effect.suspend(() => {
              const operation = completedOperation
              const attempt = completedAttempt
              const responseAuthority = completedResponseAuthority
              if (operation === undefined || attempt === undefined)
                return Effect.die(new Error("Model operation exhausted without a committed response"))
              state.text = `${state.text}${modelResponseText(attempt.response)}`
              return Ref.set(
                chat.history,
                Prompt.concat(
                  Prompt.fromMessages(attempt.messages),
                  Prompt.fromMessages(
                    Prompt.fromResponseParts(attempt.response.content).content.map(coalesceAdjacentText),
                  ),
                ),
              ).pipe(
                Effect.andThen(
                  Effect.flatMap(DriverInterpreter, (interpreter) => chargeAttemptUsageWith(interpreter, state)),
                ),
                Effect.andThen(persisted === undefined ? Effect.void : persisted.save),
                Effect.orDie,
                Effect.andThen(
                  Effect.sync(() =>
                    clearCommittedResponse({ service: activeModelResponse, authority: responseAuthority }),
                  ),
                ),
                Effect.as(committedEvent({ operation, attempt })),
              )
            }),
          )
          const tools = Stream.suspend(() => {
            Object.freeze(calls)
            Object.freeze(toolCallBatch)
            return scheduleTools(executions, toolScheduling, ({ call, messages, toolCallIndex }) =>
              toolCallEvents(turn, toolCallBatch, toolCallIndex, call, messages, activeRegistry),
            )
          })
          return Stream.concat(accepted, Stream.concat(committed, tools))
        }),
      ),
    )
    return parts
  }
  return {
    modelTurn,
    captureStructuredUsage: (content: ReadonlyArray<Response.Part<Record<string, Tool.Any>>>) =>
      captureStructuredUsage(state, content),
    withModelTelemetry,
    withAgentModel,
  }
}
