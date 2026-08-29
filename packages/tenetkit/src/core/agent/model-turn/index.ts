import { Cause, Channel, Effect, Exit, HashMap, Option, Ref, Schema, Stream } from "effect"
import { AiError, LanguageModel, Prompt, Response, Tool, Toolkit } from "effect/unstable/ai"
import { DriverInterpreter } from "../../durable/driver/interpreter.js"
import { AgentError, DuplicateToolCallId, MiddlewareViolation, type Event } from "../event.js"
import { coalesceAdjacentText } from "../../context/session-sync.js"
import { applyPartChain, applyPromptChain } from "../message.js"
import { type Registry, select } from "../../tools/tool-registry.js"
import type { Request } from "../../tools/tool-executor.js"
import { classifyFailure as classifyModelFailure } from "../../model/registry.js"
import { CurrentInstrumentation, CurrentPurpose, type ModelCallPurpose } from "../../model/telemetry/events.js"
import { withWireCache } from "../../model/prompt-cache.js"
import type { AnyToolCall, ToolCallIdState } from "../tools/result.js"
import type { ModelTurnServices, RuntimeContext } from "./context.js"
import {
  InvalidToolCallParameters,
  isInvalidToolCallParameters,
  prepare as prepareToolCallValidation,
  ToolJsonSchemaCompilerMissing,
  validateDecodedToolCall,
} from "../../model/tool-call-validation.js"
import type { RunError, ToolSchedulingPolicy } from "../service.js"
import type { TurnOverrides } from "../../turn/policy.js"
import { wrapDriverAttempt } from "./driver.js"
import type { AttemptCompleted, AttemptEvent, CompletedModelOperation } from "../../model/operation.js"
import { captureFinishPart, captureStructuredUsage, modelBudgetCharge } from "./finish.js"
import { schedule as scheduleTools } from "../tools/scheduler.js"
import { classifyOtherFailure, isToolNameCollision, providerOutput, singleFailure } from "./parts.js"
import { projectCommittedResponse } from "./commit.js"
import { attemptResponse, replayMessages } from "./response.js"
import { make as makeActiveTurn } from "./active.js"
import { make as makeRetryableOverflow } from "./retryable-overflow.js"
import { validateContext } from "../../context/session.js"

export const make = <T extends Record<string, Tool.Any>, R>(context: RuntimeContext<T, R>) => {
  const {
    agent,
    handoffStateRef,
    agentModel,
    agentModelRegistry,
    resilienceService,
    activeModelResponse,
    telemetryIdentity,
    modelCallUsage,
    instrumentModel,
    chain,
    preparePrompt,
    countTokens,
    syncSession,
    emitTelemetry,
    chat,
    compactionService,
    state,
    errorMessage,
    toolCallEvents,
  } = context
  const activeTurnInput: Parameters<typeof makeActiveTurn>[0] = {
    agent,
    agentModel,
  }
  if (handoffStateRef !== undefined) Object.assign(activeTurnInput, { handoffStateRef })
  const { activeAgentName, activeModelSelection, activeToolScheduling, sendClock } = makeActiveTurn(activeTurnInput)
  const withModelTelemetry =
    (turn: number, purpose: ModelCallPurpose) =>
    <A, E, R2>(effect: Effect.Effect<A, E, R2>) =>
      Effect.flatMap(LanguageModel.LanguageModel, (model) =>
        effect.pipe(
          Effect.provideService(LanguageModel.LanguageModel, instrumentModel(model, turn)),
          Effect.provideService(CurrentPurpose, purpose),
        ),
      )
  const withAgentModel = <A, E, R2>(effect: Effect.Effect<A, E, R2>) =>
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
            Stream.catchTag("tenetkit/core/LanguageModelNotRegistered", (error) =>
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
  ): Stream.Stream<Event, RunError, ModelTurnServices<T, R>> => {
    const instrumentTurnStream = <A, E>(
      stream: Stream.Stream<A, E, ModelTurnServices<Record<string, Tool.Any>, never>>,
    ): Stream.Stream<
      A,
      E | InvalidToolCallParameters | ToolJsonSchemaCompilerMissing | AiError.AiError,
      ModelTurnServices<Record<string, Tool.Any>, never>
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
    let completedResponseAuthority: ReturnType<ReturnType<typeof attemptResponse>["authority"]>
    const attemptBody = (
      activePrompt: Prompt.Prompt,
      retryOverflow: boolean,
      compactOverflow = false,
      overflowCause?: Cause.Cause<RunError>,
      operationKey?: string,
    ): Stream.Stream<AttemptEvent, RunError, ModelTurnServices<Record<string, Tool.Any>, never>> => {
      let emitted = false
      let classifyFailure = classifyOtherFailure
      const responseInput: Parameters<typeof attemptResponse>[0] = {
        service: activeModelResponse,
        turn,
      }
      if (operationKey !== undefined) Object.assign(responseInput, { operationKey })
      const currentResponse = attemptResponse(responseInput)
      let preparedState: { readonly history: Prompt.Prompt; readonly preparedPrompt: Prompt.Prompt } | undefined
      const canRetryOverflow = makeRetryableOverflow({
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
                    const normalizedActiveContent = activePrompt.content.map(coalesceAdjacentText)
                    const normalizedActivePrompt = normalizedActiveContent.some(
                      (message: Prompt.Message, index: number) => message !== activePrompt.content[index],
                    )
                      ? Prompt.fromMessages(normalizedActiveContent)
                      : activePrompt
                    const prepared = yield* preparePrompt(turn, normalizedActivePrompt, compactOverflow)
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
                    yield* validateContext(responsePrompt).pipe(
                      Effect.mapError((cause) =>
                        AgentError.make({ message: "Invalid framework tool history", turn, cause }),
                      ),
                    )
                    const sessionPath = yield* syncSession(turn, responsePrompt)
                    const sessionParentId = currentResponse.setSessionParentId(sessionPath.at(-1)?.id ?? null)
                    if (Option.isSome(compactionService)) {
                      state.currentContext = responsePrompt
                      state.currentContextTokens = yield* countTokens(turn, responsePrompt)
                    }
                    const rawParts = LanguageModel.streamText({
                      prompt: yield* withWireCache(responsePrompt, yield* CurrentPurpose, sendClock),
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
                              providerOutput.capture(state.providerOutput, part)
                            }),
                      ),
                      Stream.catchCause(
                        (cause): Stream.Stream<Response.StreamPart<Record<string, Tool.Any>>, RunError> => {
                          if (Cause.hasInterrupts(cause) || Cause.hasDies(cause)) return Stream.failCause(cause)
                          if (canRetryOverflow(cause, emitted)) return Stream.failCause(cause)
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
                              currentResponse.accept(identity, part)
                              return {
                                _tag: "Part",
                                part,
                                messages: responsePrompt.content,
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
                            const response = currentResponse.complete(identity)
                            completedResponseAuthority = currentResponse.authority()
                            return {
                              _tag: "Completed",
                              messages: responsePrompt.content,
                              modelCallId: identity.modelCallId,
                              modelAttemptId: identity.modelAttemptId,
                              attempt: identity.attempt,
                              sessionParentId,
                              replayFromHistory:
                                sessionParentId === null && preparedState?.preparedPrompt.content.length === 0,
                              response,
                              budgetCharge: modelBudgetCharge({
                                usage: response.usage,
                                failedAttemptUsage: modelCallUsage.get(identity.modelCallId),
                                fallbackTokens: state.currentContextTokens,
                              }),
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
          if (canRetryOverflow(cause, emitted)) {
            currentResponse.discard()
            return attemptBody(preparedState?.preparedPrompt ?? activePrompt, false, true, cause, operationKey)
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
      replayMessages: context.replayMessages,
      fallbackMessages: (active, replay) => replayMessages({ chat, activePrompt: active, replayFromHistory: replay }),
      completed: (operation, attempt) => {
        completedOperation = operation
        completedAttempt = attempt
      },
    })
    const parts = Stream.unwrap(
      applyPromptChain(chain, Prompt.make(prompt), { agentName, turn }).pipe(
        Effect.map((transformedPrompt): Stream.Stream<Event, RunError, ModelTurnServices<T, R>> => {
          let nextToolCallIndex = 0
          const calls = new Array<AnyToolCall>()
          const executions = new Array<{
            readonly call: AnyToolCall
            readonly messages: ReadonlyArray<Prompt.Message>
            readonly toolCallIndex: number
          }>()
          const toolCallBatch: Request["toolCallBatch"] = { calls }
          const accepted: Stream.Stream<
            Event,
            RunError,
            ModelTurnServices<Record<string, Tool.Any>, never>
          > = instrumentTurnStream(driverAttempt(transformedPrompt, true)).pipe(
            Stream.filter((event): event is Extract<AttemptEvent, { readonly _tag: "Part" }> => event._tag === "Part"),
            Stream.map(({ part, messages, modelCallId, modelAttemptId, attempt }) => {
              const toolCallIndex = nextToolCallIndex
              if (part.type === "tool-call" && part.providerExecuted !== true) {
                const call = part
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
          const committed: Stream.Stream<Event, RunError, DriverInterpreter> = Stream.unwrap(
            Effect.suspend(() => {
              const operation = completedOperation
              const attempt = completedAttempt
              const responseAuthority = completedResponseAuthority
              if (operation === undefined || attempt === undefined)
                return Effect.die(new Error("Model operation exhausted without a committed response"))
              return projectCommittedResponse({
                operation,
                attempt,
                responseAuthority,
                activeModelResponse,
                state,
                chat,
              })
            }),
          )
          const tools: Stream.Stream<Event, RunError, R | ModelTurnServices<T, never>> = Stream.suspend(() => {
            Object.freeze(calls)
            Object.freeze(toolCallBatch)
            return scheduleTools(executions, toolScheduling, ({ call, messages, toolCallIndex }) =>
              toolCallEvents(turn, toolCallBatch, toolCallIndex, call, messages, activeRegistry),
            )
          })
          return Stream.fromIterable<Stream.Stream<Event, RunError, ModelTurnServices<T, R>>>([
            accepted,
            committed,
            tools,
          ]).pipe(Stream.flatten)
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
