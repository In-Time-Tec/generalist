import { Cause, type Duration, Effect, Option, Ref, Stream } from "effect"
import * as Ai from "effect/unstable/ai"
import * as AgentEvent from "./agent-event"
import * as Approvals from "./approvals"
import * as ModelMiddleware from "./model-middleware"
import * as ToolExecutor from "./tool-executor"
import * as TurnPolicy from "./turn-policy"

/** @experimental An agent definition: a plain value, not a service. */
export interface Agent<Tools extends Record<string, Ai.Tool.Any>> {
  readonly name: string
  readonly instructions?: string
  readonly toolkit: Ai.Toolkit.Toolkit<Tools>
  readonly policy: TurnPolicy.TurnPolicy
}

/** @experimental */
export interface MakeOptions<Tools extends Record<string, Ai.Tool.Any>> {
  readonly name: string
  readonly instructions?: string
  readonly toolkit?: Ai.Toolkit.Toolkit<Tools>
  readonly policy?: TurnPolicy.TurnPolicy
}

/** @experimental Defaults: empty toolkit, `TurnPolicy.defaultPolicy`. */
export const make = <Tools extends Record<string, Ai.Tool.Any>>(options: MakeOptions<Tools>): Agent<Tools> => ({
  name: options.name,
  ...(options.instructions === undefined ? {} : { instructions: options.instructions }),
  toolkit: options.toolkit ?? (Ai.Toolkit.empty as unknown as Ai.Toolkit.Toolkit<Tools>),
  policy: options.policy ?? TurnPolicy.defaultPolicy,
})

/** @experimental Re-entry after `AgentSuspended`: execute this call first. */
export interface Resume {
  readonly call: {
    readonly id: string
    readonly name: string
    readonly params: unknown
  }
}

/** @experimental */
export interface RunOptions {
  /** User input for the first turn. Ignored when `resume` is set. */
  readonly prompt: Ai.Prompt.RawInput
  /**
   * Prior transcript. When set it is used VERBATIM as the initial chat
   * history (no system message is prepended); otherwise the chat starts
   * with a system message derived from the agent (see below).
   */
  readonly history?: Ai.Prompt.RawInput
  /** Overrides the derived system message when `history` is not set. */
  readonly system?: string
  readonly resume?: Resume
  /**
   * @experimental Run this agent on a persisted chat. Requires `Chat.Persistence`
   * to be provided in context (e.g. via `Chat.layerPersisted({ storeId })` over a
   * `BackingPersistence` layer). The chat identified by `chatId` is created on
   * first use and accumulates history across runs. Mutually exclusive with
   * `history`.
   */
  readonly persistence?: {
    readonly chatId: string
    readonly timeToLive?: Duration.Input
  }
}

/** @experimental The error channel of `stream` and `generate`. */
export type RunError =
  | AgentEvent.AgentError
  | AgentEvent.AgentSuspended
  | AgentEvent.TurnLimitExceeded
  | AgentEvent.MiddlewareViolation

type RunServices =
  | Ai.LanguageModel.LanguageModel
  | ToolExecutor.ToolExecutor
  | Approvals.Approvals
  | ModelMiddleware.ModelMiddleware

type AnyToolCall = Ai.Response.ToolCallPart<string, unknown>

type PendingToolResult = Ai.Response.ToolResultPart<string, unknown, unknown>

const errorMessage = (error: unknown) => (error instanceof Error ? `${error.name}: ${error.message}` : String(error))

const successResult = (call: AnyToolCall, outcome: ToolExecutor.Success): PendingToolResult =>
  Ai.Response.toolResultPart({
    id: call.id,
    name: call.name,
    isFailure: false,
    result: outcome.result,
    encodedResult: outcome.encodedResult,
    providerExecuted: false,
    preliminary: false,
  })

const failedResult = (call: AnyToolCall, message: string): PendingToolResult =>
  Ai.Response.toolResultPart({
    id: call.id,
    name: call.name,
    isFailure: true,
    result: { error: message },
    encodedResult: { error: message },
    providerExecuted: false,
    preliminary: false,
  })

const suspended = (call: AnyToolCall, token: string, reason: "tool-wait" | "approval") =>
  new AgentEvent.AgentSuspended({
    token,
    reason,
    tool_call_id: call.id,
    tool_name: call.name,
    tool_params: call.params,
  })

const withSystem = (instructions: string, prompt: Ai.Prompt.Prompt): Ai.Prompt.Prompt =>
  Ai.Prompt.fromMessages([Ai.Prompt.makeMessage("system", { content: instructions }), ...prompt.content])

const approvalRequired = (
  tool: Ai.Tool.Any | undefined,
  call: AnyToolCall,
  messages: ReadonlyArray<Ai.Prompt.Message>,
): Effect.Effect<boolean> => {
  const needsApproval = tool?.needsApproval
  if (needsApproval === undefined) return Effect.succeed(false)
  if (typeof needsApproval === "boolean") return Effect.succeed(needsApproval)
  return Effect.suspend(() => {
    const result = needsApproval(call.params as never, { toolCallId: call.id, messages })
    return Effect.isEffect(result) ? result : Effect.succeed(result)
  }).pipe(Effect.catchCause(() => Effect.succeed(true)))
}

/** Fold the prompt through every `transformPrompt` hook in array order. */
const applyPromptChain = (
  chain: ReadonlyArray<ModelMiddleware.Middleware>,
  prompt: Ai.Prompt.Prompt,
  context: ModelMiddleware.TurnContext,
): Effect.Effect<Ai.Prompt.Prompt, AgentEvent.AgentError> =>
  Effect.gen(function* () {
    let current = prompt
    for (const middleware of chain) {
      if (middleware.transformPrompt !== undefined) {
        current = yield* middleware.transformPrompt(current, context)
      }
    }
    return current
  })

/** Thread a stream part through every `transformPart` hook; the first `none()` short-circuits. */
const applyPartChain = (
  chain: ReadonlyArray<ModelMiddleware.Middleware>,
  part: Ai.Response.StreamPart<any>,
  context: ModelMiddleware.TurnContext,
): Effect.Effect<Option.Option<Ai.Response.StreamPart<any>>, AgentEvent.AgentError> =>
  Effect.gen(function* () {
    let current: Option.Option<Ai.Response.StreamPart<any>> = Option.some(part)
    for (const middleware of chain) {
      if (Option.isNone(current)) break
      if (middleware.transformPart !== undefined) {
        current = yield* middleware.transformPart(current.value, context)
      }
    }
    return current
  })

/** @experimental The one primitive; everything else derives from it. */
export const stream = <Tools extends Record<string, Ai.Tool.Any>>(
  agent: Agent<Tools>,
  options: RunOptions,
): Stream.Stream<AgentEvent.Event, RunError, RunServices> =>
  Stream.unwrap(
    Effect.gen(function* () {
      const executor = yield* ToolExecutor.ToolExecutor
      const approvals = yield* Approvals.Approvals
      const chain = yield* ModelMiddleware.ModelMiddleware

      if (options.history !== undefined && options.persistence !== undefined) {
        return yield* Effect.fail(
          new AgentEvent.AgentError({
            message: "RunOptions.history and RunOptions.persistence are mutually exclusive",
            turn: 0,
          }),
        )
      }

      const system = options.system ?? agent.instructions

      // Resolve `Chat.Persistence` optionally so `stream`'s `R` does not grow.
      const persistenceService = yield* Effect.serviceOption(Ai.Chat.Persistence)
      const persistenceOptions = options.persistence
      const persisted: Ai.Chat.Persisted | undefined =
        persistenceOptions === undefined
          ? undefined
          : yield* Option.match(persistenceService, {
              onNone: () =>
                Effect.fail(
                  new AgentEvent.AgentError({
                    message: "RunOptions.persistence requires Chat.Persistence in context",
                    turn: 0,
                  }),
                ),
              onSome: (service) =>
                service
                  .getOrCreate(
                    persistenceOptions.chatId,
                    persistenceOptions.timeToLive === undefined
                      ? undefined
                      : { timeToLive: persistenceOptions.timeToLive },
                  )
                  .pipe(
                    Effect.mapError(
                      (error) => new AgentEvent.AgentError({ message: errorMessage(error), turn: 0, cause: error }),
                    ),
                  ),
            })

      // On a persisted chat with no stored history, seed the system message into
      // the first turn's prompt; on a non-empty history it is already stored.
      const seedSystem =
        persisted !== undefined && system !== undefined && (yield* Ref.get(persisted.history)).content.length === 0
          ? system
          : undefined

      const freshChat =
        options.history !== undefined
          ? Ai.Chat.fromPrompt(options.history)
          : system !== undefined
            ? Ai.Chat.fromPrompt([Ai.Prompt.makeMessage("system", { content: system })])
            : Ai.Chat.empty
      const chat: Ai.Chat.Service = persisted ?? (yield* freshChat)

      const savePersisted: Effect.Effect<void, AgentEvent.AgentError> =
        persisted === undefined
          ? Effect.void
          : persisted.save.pipe(
              Effect.mapError(
                (error) => new AgentEvent.AgentError({ message: errorMessage(error), turn: 0, cause: error }),
              ),
            )

      const failSuspended = (call: AnyToolCall, token: string, reason: "tool-wait" | "approval") =>
        Stream.unwrap(savePersisted.pipe(Effect.as(Stream.fail<RunError>(suspended(call, token, reason)))))

      const state = {
        text: "",
        turn: 0,
        pending: [] as Array<PendingToolResult>,
        finish: undefined as
          | { readonly usage: Ai.Response.Usage; readonly reason: Ai.Response.FinishReason }
          | undefined,
        usage: undefined as Ai.Response.Usage | undefined,
      }

      const executeApproved = (
        turn: number,
        call: AnyToolCall,
        request: ToolExecutor.Request,
      ): Stream.Stream<AgentEvent.Event, RunError> =>
        Stream.concat(
          Stream.fromIterable<AgentEvent.Event>([{ _tag: "ToolExecutionStarted", turn, call }]),
          Stream.unwrap(
            executor.execute(request).pipe(
              Effect.map((outcome): Stream.Stream<AgentEvent.Event, RunError> => {
                switch (outcome._tag) {
                  case "Success": {
                    const result = successResult(call, outcome)
                    state.pending.push(result)
                    return Stream.fromIterable<AgentEvent.Event>([
                      { _tag: "ToolExecutionCompleted", turn, call, result },
                    ])
                  }
                  case "Failure": {
                    const result = failedResult(call, outcome.message)
                    state.pending.push(result)
                    return Stream.fromIterable<AgentEvent.Event>([
                      { _tag: "ToolExecutionCompleted", turn, call, result },
                    ])
                  }
                  case "Suspend":
                    return failSuspended(call, outcome.token, "tool-wait")
                }
              }),
            ),
          ),
        )

      const toolCallEvents = (
        turn: number,
        call: AnyToolCall,
        messages: ReadonlyArray<Ai.Prompt.Message>,
      ): Stream.Stream<AgentEvent.Event, RunError> => {
        const request: ToolExecutor.Request = { call, turn, agentName: agent.name }
        const tool = agent.toolkit.tools[call.name] as Ai.Tool.Any | undefined
        return Stream.unwrap(
          approvalRequired(tool, call, messages).pipe(
            Effect.map((isRequired): Stream.Stream<AgentEvent.Event, RunError> => {
              if (!isRequired) return executeApproved(turn, call, request)
              return Stream.concat(
                Stream.fromIterable<AgentEvent.Event>([{ _tag: "ApprovalRequested", turn, call }]),
                Stream.unwrap(
                  approvals.check(request).pipe(
                    Effect.map((decision): Stream.Stream<AgentEvent.Event, RunError> => {
                      switch (decision._tag) {
                        case "Approved":
                          return executeApproved(turn, call, request)
                        case "Denied": {
                          const result = failedResult(call, decision.reason ?? "Tool call denied")
                          state.pending.push(result)
                          return Stream.fromIterable<AgentEvent.Event>([
                            { _tag: "ToolExecutionCompleted", turn, call, result },
                          ])
                        }
                        case "Pending":
                          return failSuspended(call, decision.token, "approval")
                      }
                    }),
                  ),
                ),
              )
            }),
          ),
        )
      }

      const captureFinishPart = (part: Ai.Response.FinishPart): Effect.Effect<void> =>
        Effect.gen(function* () {
          const span = yield* Effect.currentSpan
          state.finish = {
            usage: state.finish === undefined ? part.usage : AgentEvent.addUsage(state.finish.usage, part.usage),
            reason: part.reason,
          }
          state.usage = state.usage === undefined ? part.usage : AgentEvent.addUsage(state.usage, part.usage)
          Ai.Telemetry.addGenAIAnnotations(span, {
            operation: { name: "chat" },
            usage: {
              inputTokens: part.usage.inputTokens.total,
              outputTokens: part.usage.outputTokens.total,
            },
            response: { finishReasons: [part.reason] },
          })
        }).pipe(Effect.orDie)

      const partEvents = (
        turn: number,
        part: Ai.Response.StreamPart<Record<string, Ai.Tool.Any>>,
        messages: ReadonlyArray<Ai.Prompt.Message>,
      ): Stream.Stream<AgentEvent.Event, RunError> => {
        if (part.type === "error") {
          return Stream.fail(new AgentEvent.AgentError({ message: errorMessage(part.error), turn, cause: part.error }))
        }
        const modelPart = Stream.fromIterable<AgentEvent.Event>([{ _tag: "ModelPart", turn, part }])
        if (part.type === "tool-call") {
          const call = part as AnyToolCall
          return call.providerExecuted === true
            ? modelPart
            : Stream.concat(modelPart, toolCallEvents(turn, call, messages))
        }
        if (part.type === "text-delta") {
          state.text = `${state.text}${part.delta}`
        }
        if (part.type === "finish") {
          return modelPart.pipe(Stream.tap(() => captureFinishPart(part)))
        }
        return modelPart
      }

      // Run every model part through the middleware chain BEFORE the fold that
      // dispatches tool calls / accumulates text, so middleware sees raw model
      // output and everything downstream (events, tool dispatch, Relay
      // persistence) sees the transformed stream.
      const applyPartToEvents = (
        turn: number,
        part: Ai.Response.StreamPart<any>,
        messages: ReadonlyArray<Ai.Prompt.Message>,
      ): Stream.Stream<AgentEvent.Event, RunError> =>
        Stream.unwrap(
          applyPartChain(chain, part, { agentName: agent.name, turn }).pipe(
            Effect.map(
              Option.match({
                onSome: (transformed) =>
                  partEvents(turn, transformed as Ai.Response.StreamPart<Record<string, Ai.Tool.Any>>, messages),
                onNone: (): Stream.Stream<AgentEvent.Event, RunError> =>
                  part.type === "tool-call"
                    ? Stream.fail(
                        new AgentEvent.MiddlewareViolation({
                          turn,
                          detail: "ModelMiddleware dropped a tool-call part",
                        }),
                      )
                    : Stream.empty,
              }),
            ),
          ),
        )

      const activeToolkit = (activeTools: ReadonlyArray<string>): Ai.Toolkit.Toolkit<Tools> =>
        Ai.Toolkit.make(
          ...Object.values(agent.toolkit.tools).filter((tool) => activeTools.includes(tool.name)),
        ) as unknown as Ai.Toolkit.Toolkit<Tools>

      const modelTurn = (
        turn: number,
        prompt: Ai.Prompt.RawInput,
        overrides?: TurnPolicy.TurnOverrides,
      ): Stream.Stream<AgentEvent.Event, RunError, Ai.LanguageModel.LanguageModel> => {
        const toolkit = overrides?.activeTools === undefined ? agent.toolkit : activeToolkit(overrides.activeTools)
        const parts = Stream.unwrap(
          applyPromptChain(chain, Ai.Prompt.make(prompt), { agentName: agent.name, turn }).pipe(
            Effect.flatMap((transformedPrompt) =>
              Ref.get(chat.history).pipe(
                Effect.map((history) => {
                  const messages = Ai.Prompt.concat(history, transformedPrompt).content
                  return chat.streamText({ prompt: transformedPrompt, toolkit, disableToolCallResolution: true }).pipe(
                    Stream.catchCause((cause) =>
                      Stream.make(Ai.Response.makePart("error", { error: Cause.squash(cause) })),
                    ),
                    Stream.flatMap((part) => applyPartToEvents(turn, part as Ai.Response.StreamPart<any>, messages)),
                  )
                }),
              ),
            ),
          ),
        )
        return overrides?.model === undefined ? parts : parts.pipe(Stream.provide(overrides.model))
      }

      const turnCompletedEvent = (turn: number, transcript: Ai.Prompt.Prompt): AgentEvent.TurnCompleted => ({
        _tag: "TurnCompleted",
        turn,
        transcript,
        ...(state.finish === undefined ? {} : { usage: state.finish.usage, finishReason: state.finish.reason }),
      })

      const terminalCompletedEvent = (turn: number, transcript: Ai.Prompt.Prompt): AgentEvent.Completed => ({
        _tag: "Completed",
        turns: turn + 1,
        text: state.text,
        transcript,
        ...(state.usage === undefined ? {} : { usage: state.usage }),
      })

      const afterTurn = (
        turn: number,
      ): Effect.Effect<
        {
          readonly events: Stream.Stream<AgentEvent.Event, RunError, Ai.LanguageModel.LanguageModel>
          readonly next?: {
            readonly prompt: Ai.Prompt.RawInput
            readonly overrides?: TurnPolicy.TurnOverrides
          }
        },
        AgentEvent.AgentError
      > =>
        Effect.gen(function* () {
          const transcript = yield* Ref.get(chat.history)
          const completed: AgentEvent.Event = turnCompletedEvent(turn, transcript)
          const pending = state.pending
          if (pending.length === 0) {
            yield* savePersisted
            return {
              events: Stream.fromIterable<AgentEvent.Event>([completed, terminalCompletedEvent(turn, transcript)]),
            }
          }
          const decision = yield* agent.policy.decide({
            turn: turn + 1,
            history: transcript,
            pendingToolResults: pending,
          })
          if (decision._tag === "Stop") {
            return {
              events: Stream.concat(
                Stream.fromIterable<AgentEvent.Event>([completed]),
                Stream.fail(
                  new AgentEvent.TurnLimitExceeded({
                    turn: turn + 1,
                    pending: pending.map((result) => ({
                      tool_call_id: result.id,
                      tool_name: result.name,
                    })),
                  }),
                ),
              ),
            }
          }
          state.pending = []
          const basePrompt = Ai.Prompt.fromResponseParts(pending)
          const prompt =
            decision.overrides?.instructions === undefined
              ? basePrompt
              : withSystem(decision.overrides.instructions, basePrompt)
          return {
            events: Stream.fromIterable<AgentEvent.Event>([completed]),
            next: { prompt, ...(decision.overrides === undefined ? {} : { overrides: decision.overrides }) },
          }
        })

      const resetTurnState = (turn: number) =>
        Stream.sync(() => {
          state.turn = turn
          state.finish = undefined
        }).pipe(Stream.drain)

      const runTurn = (
        turn: number,
        prompt: Ai.Prompt.RawInput,
        overrides?: TurnPolicy.TurnOverrides,
      ): Stream.Stream<AgentEvent.Event, RunError, Ai.LanguageModel.LanguageModel> => {
        let next:
          | {
              readonly prompt: Ai.Prompt.RawInput
              readonly overrides?: TurnPolicy.TurnOverrides
            }
          | undefined
        const currentTurn = Stream.fromIterable<AgentEvent.Event>([{ _tag: "TurnStarted", turn }]).pipe(
          Stream.concat(resetTurnState(turn)),
          Stream.concat(modelTurn(turn, prompt, overrides)),
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
          Stream.withSpan("Baton.Agent.turn", { attributes: { "baton.turn": turn } }),
        )
        return Stream.concat(
          currentTurn,
          Stream.suspend(() => (next === undefined ? Stream.empty : runTurn(turn + 1, next.prompt, next.overrides))),
        )
      }

      const resumeStream = (
        resume: Resume,
      ): Stream.Stream<AgentEvent.Event, RunError, Ai.LanguageModel.LanguageModel> => {
        let next:
          | {
              readonly prompt: Ai.Prompt.RawInput
              readonly overrides?: TurnPolicy.TurnOverrides
            }
          | undefined
        const call = Ai.Response.makePart("tool-call", {
          id: resume.call.id,
          name: resume.call.name,
          params: resume.call.params,
          providerExecuted: false,
        })
        const currentTurn = resetTurnState(0).pipe(
          Stream.concat(
            Stream.unwrap(
              Ref.get(chat.history).pipe(Effect.map((history) => toolCallEvents(0, call, history.content))),
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

      const initialPrompt =
        seedSystem === undefined ? options.prompt : withSystem(seedSystem, Ai.Prompt.make(options.prompt))
      const runStream = options.resume === undefined ? runTurn(0, initialPrompt) : resumeStream(options.resume)
      // On suspension, emit the finalized transcript as a trailing `TurnCompleted`
      // before re-failing. `chat.streamText` appends the assistant message (e.g. the
      // pending tool call) to `chat.history` on channel release, which completes during
      // teardown — after the suspend point — so a durable host reading the transcript
      // here sees the suspending turn. Only tool-wait/approval suspensions get this; the
      // trailing event is invisible to consumers that observe just the error.
      return runStream.pipe(
        Stream.catchCause((cause) => {
          const error = Cause.squash(cause)
          if (error instanceof AgentEvent.AgentSuspended) {
            return Stream.unwrap(
              Ref.get(chat.history).pipe(
                Effect.map((transcript) =>
                  Stream.concat(
                    Stream.fromIterable<AgentEvent.Event>([turnCompletedEvent(state.turn, transcript)]),
                    Stream.failCause<RunError>(cause),
                  ),
                ),
              ),
            )
          }
          return Stream.failCause<RunError>(cause)
        }),
      )
    }),
  ).pipe(Stream.withSpan("Baton.Agent.run", { attributes: { "baton.agent.name": agent.name } }))

/** @experimental Result of a non-streaming run. */
export interface Result {
  readonly text: string
  readonly turns: number
  readonly transcript: Ai.Prompt.Prompt
}

/** @experimental `stream` folded to its `Completed` event. */
export const generate = <Tools extends Record<string, Ai.Tool.Any>>(
  agent: Agent<Tools>,
  options: RunOptions,
): Effect.Effect<Result, RunError, RunServices> =>
  Stream.runLast(stream(agent, options)).pipe(
    Effect.flatMap(
      Option.match({
        onNone: () =>
          Effect.fail(new AgentEvent.AgentError({ message: "Agent run ended without a Completed event", turn: 0 })),
        onSome: (event) =>
          event._tag === "Completed"
            ? Effect.succeed({ text: event.text, turns: event.turns, transcript: event.transcript })
            : Effect.fail(new AgentEvent.AgentError({ message: "Agent run ended without a Completed event", turn: 0 })),
      }),
    ),
  )
