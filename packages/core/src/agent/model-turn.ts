import { Cause, Channel, Effect, Exit, HashMap, Option, Ref, Schema, Stream } from "effect"
import { AiError, LanguageModel, Prompt, Response, Telemetry, Tool, Toolkit } from "effect/unstable/ai"
import { addUsage, AgentError, type Event } from "./agent-event.js"
import { coalesceAdjacentText } from "../context/session-sync.js"
import { applyPartChain, applyPromptChain } from "./agent-message.js"
import { type Registry, select } from "../tools/tool-registry.js"
import { type Request } from "../tools/tool-executor.js"
import { classify as classifyContextOverflow } from "../model/context-overflow.js"
import { classifyFailure as classifyModelFailure, type LanguageModelNotRegistered } from "../model/model-registry.js"
import { CurrentInstrumentation, CurrentPurpose, type ModelCallPurpose } from "../model/model-telemetry.js"
import { type AnyToolCall, type ToolCallIdState } from "./agent-tool-result.js"
import type { RuntimeContext } from "./model-turn-context.js"
import {
  InvalidToolCallParameters,
  isInvalidToolCallParameters,
  prepare as prepareToolCallValidation,
  ToolJsonSchemaCompilerMissing,
  validateDecodedToolCall,
} from "../model/model-tool-call-validation.js"
import { DuplicateToolCallId, MiddlewareViolation, ToolNameCollision } from "./agent-event.js"
import type { RunError } from "./agent.js"
import type { TurnOverrides } from "../turn/turn-policy.js"
const classifyOtherFailure = (error: unknown) => classifyContextOverflow(error)
const isToolNameCollision = Schema.is(ToolNameCollision)
const attemptText = (parts: ReadonlyArray<Response.StreamPart<any>>): string =>
  parts.reduce((text, part) => (part.type === "text-delta" ? `${text}${part.delta}` : text), "")
export const makeModelTurn = <T extends Record<string, Tool.Any>, R>(context: RuntimeContext<T, R>) => {
  const {
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
    agentModelRegistry,
    agentModel,
    persisted,
    toolCallEvents,
  } = context
  const captureProviderOutput = (part: Response.StreamPart<any>): void => {
    if (part.type === "text-delta") state.providerOutput.textCharacters += part.delta.length
    if (part.type === "reasoning-delta") state.providerOutput.reasoningCharacters += part.delta.length
    if (part.type === "finish") state.providerOutput.finishReason = part.reason
  }
  const captureFinishPart = (part: Response.FinishPart): Effect.Effect<void> =>
    Effect.gen(function* () {
      const span = yield* Effect.currentSpan
      state.finish = {
        usage: state.finish === undefined ? part.usage : addUsage(state.finish.usage, part.usage),
        reason: part.reason,
      }
      state.usage = state.usage === undefined ? part.usage : addUsage(state.usage, part.usage)
      Telemetry.addGenAIAnnotations(span, {
        operation: { name: "chat" },
        usage: {
          inputTokens: part.usage.inputTokens.total,
          outputTokens: part.usage.outputTokens.total,
        },
        response: { finishReasons: [part.reason] },
      })
    }).pipe(Effect.orDie)
  const captureStructuredUsage = (content: ReadonlyArray<Response.Part<any>>): Effect.Effect<void> =>
    Effect.gen(function* () {
      const span = yield* Effect.currentSpan
      for (const part of content) {
        if (part.type === "finish") {
          state.usage = state.usage === undefined ? part.usage : addUsage(state.usage, part.usage)
          Telemetry.addGenAIAnnotations(span, {
            operation: { name: "chat" },
            usage: {
              inputTokens: part.usage.inputTokens.total,
              outputTokens: part.usage.outputTokens.total,
            },
            response: { finishReasons: [part.reason] },
          })
        }
      }
    }).pipe(Effect.orDie)
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
  function provideAgentModel<A, E, R2>(stream: Stream.Stream<A, E, R2>): Stream.Stream<A, E | AgentError, R2>
  function provideAgentModel<A, E, R2>(stream: Stream.Stream<A, E, R2>): Stream.Stream<A, E | AgentError, R2> {
    return agentModelRegistry === undefined || agentModel === undefined
      ? stream
      : agentModelRegistry
          .stream(agentModel, stream)
          .pipe(
            Stream.catchTag("@batonfx/core/LanguageModelNotRegistered", (error) =>
              Stream.fail(AgentError.make({ message: errorMessage(error), turn: state.turn, cause: error })),
            ),
          )
  }
  const partEvents = (
    turn: number,
    part: Response.StreamPart<Record<string, Tool.Any>>,
  ): Stream.Stream<Event, RunError> => {
    if (part.type === "error") {
      if (isToolNameCollision(part.error)) return Stream.fail(part.error)
      return Stream.fail(AgentError.make({ message: errorMessage(part.error), turn, cause: part.error }))
    }
    const identity = telemetryIdentity.current
    if (identity === undefined) {
      return Stream.fromEffect(Effect.die(new Error("ModelPart produced outside an instrumented model attempt")))
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
      return modelPart.pipe(Stream.tap(() => captureFinishPart(part)))
    }
    return modelPart
  }
  const transformPart = (
    turn: number,
    toolkit: Toolkit.Toolkit<Record<string, Tool.Any>>,
    part: Response.StreamPart<any>,
  ): Effect.Effect<Option.Option<Response.StreamPart<any>>, RunError> =>
    applyPartChain(chain, part, { agentName: agent.name, turn }).pipe(
      Effect.flatMap(
        Option.match({
          onSome: (transformed): Effect.Effect<Option.Option<Response.StreamPart<any>>, MiddlewareViolation> => {
            if (part.type === "tool-call" && transformed.type !== "tool-call") {
              return Effect.fail(
                MiddlewareViolation.make({
                  turn,
                  detail: "ModelMiddleware replaced a tool-call part with another part type",
                }),
              )
            }
            if (transformed.type !== "tool-call") {
              return Effect.succeed(Option.some<Response.StreamPart<any>>(transformed))
            }
            return validateDecodedToolCall(toolkit, transformed).pipe(
              Effect.map((decoded) => Option.some<Response.StreamPart<any>>(decoded)),
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
    part: Response.StreamPart<any>,
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
  const modelTurn = (turn: number, prompt: Prompt.RawInput, registry: Registry, overrides?: TurnOverrides) => {
    const activeRegistry = overrides?.activeTools === undefined ? registry : select(registry, overrides.activeTools)
    const instrumentTurnStream = <A, E>(
      stream: Stream.Stream<A, E, LanguageModel.LanguageModel>,
    ): Stream.Stream<
      A,
      E | InvalidToolCallParameters | ToolJsonSchemaCompilerMissing | AiError.AiError,
      LanguageModel.LanguageModel
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
    const attempt = (
      activePrompt: Prompt.Prompt,
      retryOverflow: boolean,
      compactOverflow = false,
      overflowCause?: Cause.Cause<RunError>,
    ): Stream.Stream<
      {
        readonly part: Response.StreamPart<any>
        readonly messages: ReadonlyArray<Prompt.Message>
        readonly accept: Effect.Effect<void, DuplicateToolCallId>
      },
      RunError,
      LanguageModel.LanguageModel
    > => {
      let emitted = false
      let completed = false
      let classifyFailure = classifyOtherFailure
      const transformedParts = new Array<Response.StreamPart<any>>()
      let preparedState: { readonly history: Prompt.Prompt; readonly preparedPrompt: Prompt.Prompt } | undefined
      const singleFailure = (cause: Cause.Cause<unknown>) => {
        const reason = cause.reasons.length === 1 ? cause.reasons[0] : undefined
        return reason !== undefined && Cause.isFailReason(reason) ? Option.some(reason.error) : Option.none()
      }
      const retryableOverflow = (cause: Cause.Cause<unknown>, hasEmitted: boolean): boolean => {
        const failure = singleFailure(cause)
        if (Option.isNone(failure)) return false
        const classifiedFailure =
          Schema.is(AgentError)(failure.value) && failure.value.cause !== undefined
            ? failure.value.cause
            : failure.value
        return (
          retryOverflow &&
          !hasEmitted &&
          Option.isSome(compactionService) &&
          classifyFailure(classifiedFailure) === "context-overflow"
        )
      }
      return Stream.fromChannel(
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
                  Stream.catchCause((cause): Stream.Stream<Response.StreamPart<any>, RunError> => {
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
                  }),
                )
                return rawParts.pipe(
                  Stream.mapEffect((part) => transformPart(turn, activeRegistry.toolkit, part)),
                  Stream.flatMap(Option.match({ onNone: () => Stream.empty, onSome: Stream.make })),
                  Stream.map((part) => ({
                    part,
                    messages,
                    accept: validateToolCallId(toolCallIds, part).pipe(
                      Effect.andThen(
                        Effect.sync(() => {
                          transformedParts.push(part)
                        }),
                      ),
                    ),
                  })),
                  Stream.concat(
                    Stream.fromEffect(
                      Effect.sync(() => {
                        completed = true
                      }),
                    ).pipe(Stream.drain),
                  ),
                )
              }),
            ).pipe(Stream.toChannel),
          (_toolCallIds, exit: Exit.Exit<unknown, RunError>) =>
            preparedState === undefined ||
            !completed ||
            (Exit.isFailure(exit) && retryableOverflow(exit.cause, emitted))
              ? Effect.void
              : Effect.suspend(() => {
                  state.text = `${state.text}${attemptText(transformedParts)}`
                  return Ref.set(
                    chat.history,
                    Prompt.concat(
                      Prompt.concat(preparedState!.history, preparedState!.preparedPrompt),
                      Prompt.fromMessages(Prompt.fromResponseParts(transformedParts).content.map(coalesceAdjacentText)),
                    ),
                  )
                }).pipe(
                  Effect.andThen(persisted === undefined ? Effect.void : persisted.save),
                  Effect.orDie,
                  Effect.asVoid,
                ),
        ),
      ).pipe(
        Stream.catchCause((cause) => {
          if (Cause.hasInterrupts(cause) || Cause.hasDies(cause)) return Stream.failCause(cause)
          if (retryableOverflow(cause, emitted)) {
            return attempt(preparedState?.preparedPrompt ?? activePrompt, false, true, cause as Cause.Cause<RunError>)
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
    const parts = Stream.unwrap(
      applyPromptChain(chain, Prompt.make(prompt), { agentName: agent.name, turn }).pipe(
        Effect.map((transformedPrompt) => {
          let nextToolCallIndex = 0
          const calls = new Array<AnyToolCall>()
          const executions = new Array<{
            readonly call: AnyToolCall
            readonly messages: ReadonlyArray<Prompt.Message>
            readonly toolCallIndex: number
          }>()
          const toolCallBatch: Request["toolCallBatch"] = { calls }
          const accepted = instrumentTurnStream(attempt(transformedPrompt, true)).pipe(
            Stream.mapEffect(({ accept, part, messages }) => accept.pipe(Effect.as({ part, messages }))),
            Stream.map(({ part, messages }) => {
              const toolCallIndex = nextToolCallIndex
              if (part.type === "tool-call" && part.providerExecuted !== true) {
                const call = part as AnyToolCall
                nextToolCallIndex += 1
                calls.push(call)
                executions.push({ call, messages, toolCallIndex })
              }
              return { part, messages, toolCallIndex }
            }),
            Stream.flatMap(({ part }) => partEvents(turn, part)),
          )
          return Stream.concat(
            accepted,
            Stream.suspend(() => {
              Object.freeze(calls)
              Object.freeze(toolCallBatch)
              const concurrency = agent.toolExecution?.concurrency ?? 1
              const executionStreams = Stream.fromIterable(executions)
              return concurrency === 1
                ? executionStreams.pipe(
                    Stream.flatMap(({ call, messages, toolCallIndex }) =>
                      toolCallEvents(turn, toolCallBatch, toolCallIndex, call, messages, activeRegistry),
                    ),
                  )
                : Stream.unwrap(
                    Effect.gen(function* () {
                      const collected = yield* Ref.make(new Map<number, Array<Event>>())
                      const batchSize = concurrency === "unbounded" ? executions.length : concurrency
                      let failure: Cause.Cause<RunError> | undefined
                      for (let offset = 0; offset < executions.length; offset += batchSize) {
                        const batch = executions.slice(offset, offset + batchSize)
                        const exit = yield* Effect.forEach(
                          batch,
                          ({ call, messages, toolCallIndex }) =>
                            Stream.runForEach(
                              toolCallEvents(turn, toolCallBatch, toolCallIndex, call, messages, activeRegistry),
                              (event) =>
                                Ref.update(collected, (current) => {
                                  const next = new Map(current)
                                  next.set(toolCallIndex, [...(next.get(toolCallIndex) ?? []), event as Event])
                                  return next
                                }),
                            ),
                          { concurrency: "unbounded", discard: true },
                        ).pipe(Effect.exit)
                        if (Exit.isFailure(exit)) {
                          failure = exit.cause as Cause.Cause<RunError>
                          break
                        }
                      }
                      const events = [...(yield* Ref.get(collected)).entries()]
                        .toSorted(([left], [right]) => left - right)
                        .flatMap(([, items]) => items)
                      const completed = Stream.fromIterable(events)
                      return failure === undefined ? completed : Stream.concat(completed, Stream.failCause(failure))
                    }),
                  )
            }),
          )
        }),
      ),
    )
    return overrides?.model === undefined ? provideAgentModel(parts) : parts.pipe(Stream.provide(overrides.model))
  }
  return { modelTurn, captureStructuredUsage, withModelTelemetry, withAgentModel }
}
