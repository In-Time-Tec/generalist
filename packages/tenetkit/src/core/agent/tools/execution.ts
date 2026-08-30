import { Cause, Effect, Fiber, Option, Queue, Ref, Schema, Semaphore, Stream } from "effect"
import { Chat, Prompt, Tool, Toolkit } from "effect/unstable/ai"
import { AgentError, type Event, type ToolProgress, ProgressOverflow } from "../event.js"
import { type AnyToolCall, domainFailureResult, successResult, type PendingToolResult } from "./result.js"
import type { Agent, ClosedServices, ProgressOverflowPolicy, RunOptions } from "../service.js"
import { RunError } from "../run/error.js"
import type { AgentRunState } from "../run-state.js"
import type { HandoffRunState } from "../handoff/state.js"
import type { AuthorizationError, Authorizer } from "../../tools/tool-authorization.js"
import {
  FrameworkFailure,
  Outcome,
  type Request,
  RemoteRetryMisconfigured,
  ToolExecutor,
  executeToolkit,
} from "../../tools/tool-executor.js"
import { cancellableOperation, supportsCancellation } from "../../tools/tool-executor-cancellation.js"
import { bound } from "../../tools/tool-output.js"
import { type Registry, get } from "../../tools/tool-registry.js"
import { ToolContext, type Progress } from "../../tools/tool-context.js"
import { make as makeActivateSkillOutcome, type ToolState } from "./skill-activation.js"
import { activateSkillSuccess } from "../skill-tool.js"
import type { Skill, SkillCatalogError } from "../../context/skill-catalog.js"
import { intercept, updateToolBatch } from "../../durable/driver/run.js"
import { operationKey as makeOperationKey } from "../../durable/driver/interpreter.js"
import { handoffDispatch } from "../handoff/tool-execution.js"
import { updateCall } from "./checkpoint.js"
import { applyToolOutcome } from "./checkpoint-operation.js"

interface ToolExecutionContext<T extends Record<string, Tool.Any>, AgentR, PolicyR, AuthorizationR> {
  readonly options: RunOptions
  readonly state: AgentRunState
  readonly isSkillActivationCall: (call: AnyToolCall, registry: Registry) => boolean
  readonly agent: Agent<T, AgentR, PolicyR, AuthorizationR>
  readonly staticToolkit: Toolkit.Toolkit<T>
  readonly chat: Chat.Service
  readonly activeSession: Option.Option<import("../../context/session.js").SessionStore>
  readonly sessionId: string
  readonly executor: Option.Option<typeof ToolExecutor.Service>
  readonly authorizer: Authorizer<AuthorizationR>
  readonly skillRuntime:
    | { readonly catalog: { readonly get: (name: string) => Effect.Effect<Skill | undefined, SkillCatalogError> } }
    | undefined
  readonly toolState: Ref.Ref<ToolState>
  readonly handoffState?: Ref.Ref<HandoffRunState>
  readonly progressPolicy: ProgressOverflowPolicy
  readonly skillError: (turn: number, error: SkillCatalogError) => AgentError
}

export const make = <T extends Record<string, Tool.Any>, AgentR = never, PolicyR = AgentR, AuthorizationR = AgentR>(
  inputContext: ToolExecutionContext<T, AgentR, PolicyR, AuthorizationR>,
) => {
  const {
    options,
    isSkillActivationCall,
    agent,
    staticToolkit,
    chat,
    activeSession,
    sessionId,
    executor,
    authorizer,
    skillRuntime,
    toolState,
    handoffState,
    progressPolicy,
    skillError,
  } = inputContext
  const toolNames = (registry: Registry): ReadonlyArray<string> =>
    registry.entries.map((entry) => Schema.decodeUnknownSync(Schema.String)(entry.tool.name))
  const boundOutcome = (call: AnyToolCall, outcome: Outcome): Effect.Effect<Outcome> =>
    outcome._tag === "Success"
      ? bound(outcome, { toolCallId: call.id, maxBytes: options.toolOutputMaxBytes ?? 50 * 1024 })
      : Effect.succeed(outcome)

  const outcomeEvent = (
    turn: number,
    toolCallBatch: Request["toolCallBatch"],
    toolCallIndex: number,
    call: AnyToolCall,
    outcome: Outcome,
    droppedProgress: number,
    registry: Registry,
    durableOperationKey: string,
  ): Effect.Effect<Event, RunError> => {
    const metadata = droppedProgress === 0 ? {} : { metadata: { toolProgress: { dropped: droppedProgress } } }
    const completionEvent = (result: PendingToolResult): Effect.Effect<Event> =>
      Effect.succeed({ _tag: "ToolExecutionCompleted", turn, call, result, ...metadata })
    switch (outcome._tag) {
      case "Success":
        return completionEvent(successResult(call, outcome))
      case "DomainFailure":
        return completionEvent(domainFailureResult(call, outcome))
      case "Suspend":
        return Effect.gen(function* () {
          const propagation = options.suspensionPropagation ?? "propagate"
          if (propagation === "collapse-to-domain-failure") {
            const failure = {
              reason: "suspended" as const,
              message: `Tool ${call.name} suspended (${outcome.token})`,
            }
            return yield* completionEvent(
              domainFailureResult(call, { _tag: "DomainFailure", failure, encodedFailure: failure }),
            )
          }
          return {
            _tag: "ToolExecutionWaiting",
            turn,
            call,
            waitId: durableOperationKey,
            token: outcome.token,
          } satisfies Event
        })
    }
  }

  const activateSkillOutcome = makeActivateSkillOutcome({ skillRuntime, toolState, skillError })

  const activeAgentName = (): Effect.Effect<string> =>
    handoffState === undefined
      ? Effect.succeed(agent.name)
      : Ref.get(handoffState).pipe(Effect.map((handoffRun) => handoffRun.active.name))

  const defaultExecute = (
    request: Request,
    registry: Registry,
  ): Effect.Effect<Outcome, FrameworkFailure, Tool.HandlersFor<T> | Tool.HandlerServices<T[keyof T]>> => {
    const registered = get(registry, request.call.name)
    if (registered?.dispatch === "Static") {
      return executeToolkit(staticToolkit, request)
    }
    return registered === undefined
      ? Effect.fail(
          FrameworkFailure.make({
            stage: "missing-handler",
            tool: request.call.name,
            message: `Tool ${request.call.name} is not registered`,
          }),
        )
      : Effect.fail(
          FrameworkFailure.make({
            stage: "missing-handler",
            tool: request.call.name,
            message: `Activated skill tool ${request.call.name} requires ToolExecutor`,
          }),
        )
  }

  const makeProgressQueue = (): Effect.Effect<Queue.Queue<ToolProgress, Cause.Done | ProgressOverflow>> => {
    switch (progressPolicy._tag) {
      case "Backpressure":
        return Queue.bounded(progressPolicy.capacity)
      case "Dropping":
      case "Fail":
        return Queue.dropping(progressPolicy.capacity)
      case "Sliding":
        return Queue.sliding(progressPolicy.capacity)
    }
  }

  const progressEvent = (turn: number, progress: Progress): ToolProgress => {
    const base = { _tag: "ToolProgress" as const, turn, toolCallId: progress.toolCallId }
    const { message, data } = progress
    if (message === undefined) return data === undefined ? base : { ...base, data }
    if (data === undefined) return { ...base, message }
    return { ...base, message, data }
  }

  const emitProgress =
    (
      turn: number,
      call: AnyToolCall,
      progressQueue: Queue.Queue<ToolProgress, Cause.Done | ProgressOverflow>,
      droppedProgress: Ref.Ref<number>,
      emitSemaphore: Semaphore.Semaphore,
    ) =>
    (progress: Progress): Effect.Effect<boolean> => {
      const event = progressEvent(turn, progress)
      return emitSemaphore.withPermit(
        Effect.gen(function* () {
          if (progressPolicy._tag === "Sliding") {
            const accepted = yield* Effect.sync(() => {
              const full = Queue.isFullUnsafe(progressQueue)
              const offered = Queue.offerUnsafe(progressQueue, event)
              return { dropped: full && offered, offered }
            })
            if (accepted.dropped) yield* Ref.update(droppedProgress, (count) => count + 1)
            return accepted.offered
          }
          const offered = yield* Queue.offer(progressQueue, event)
          if (progressPolicy._tag === "Dropping" && !offered) {
            yield* Ref.update(droppedProgress, (count) => count + 1)
          } else if (progressPolicy._tag === "Fail" && !offered) {
            yield* Queue.fail(
              progressQueue,
              ProgressOverflow.make({ turn, toolCallId: call.id, capacity: progressPolicy.capacity }),
            )
          }
          return offered
        }),
      )
    }

  const executionFor = (
    turn: number,
    call: AnyToolCall,
    request: Request,
    registry: Registry,
    handoffExecution: ReturnType<typeof handoffDispatch> | undefined,
    requestExecutor: typeof ToolExecutor.Service | undefined,
    skillActivation: boolean,
  ): Effect.Effect<
    Outcome,
    RunError,
    ClosedServices<T, never> | ToolContext | import("../../durable/driver/interpreter.js").DriverInterpreter
  > => {
    if (skillActivation) return activateSkillOutcome(turn, call)
    if (handoffExecution !== undefined) return handoffExecution
    if (requestExecutor === undefined) return defaultExecute(request, registry)
    return requestExecutor
      .execute(request)
      .pipe(
        Effect.mapError((error) =>
          Schema.is(RemoteRetryMisconfigured)(error)
            ? AgentError.make({ message: error.message, turn, cause: error })
            : error,
        ),
      )
  }

  const handoffFor = (request: Request, registry: Registry) => {
    if (handoffState === undefined || get(registry, request.call.name)?.dispatch !== "Handoff") return undefined
    return handoffDispatch(request, registry, {
      options,
      activeSession,
      handoffState,
      chat,
      toolState,
      resolvingToolCallIds: request.toolCallBatch.calls.map((entry) => entry.id),
    })
  }

  const executeApproved = (
    turn: number,
    call: AnyToolCall,
    request: Request,
    registry: Registry,
  ): Stream.Stream<
    Event,
    RunError,
    ClosedServices<T, never> | import("../../durable/driver/interpreter.js").DriverInterpreter
  > =>
    Stream.concat(
      Stream.fromIterable<Event>([{ _tag: "ToolExecutionStarted", turn, call }]),
      Stream.unwrap(
        Effect.gen(function* () {
          const progressQueue = yield* Effect.acquireRelease(makeProgressQueue(), Queue.shutdown)
          const droppedProgress = yield* Ref.make(0)
          const emitSemaphore = yield* Semaphore.make(1)
          const signal = yield* Effect.abortSignal
          const logicalId = options.logicalOperationId ?? options.sessionId ?? agent.name
          const durableOperationKey = makeOperationKey(logicalId, "tool", turn, call.id, call.name)
          const invocation = options.invocation ?? {}
          const emit = emitProgress(turn, call, progressQueue, droppedProgress, emitSemaphore)
          const contextBase = {
            signal,
            sessionId,
            toolCallId: call.id,
            operationKey: durableOperationKey,
            idempotencyKey: durableOperationKey,
            ...invocation,
            emit,
          }
          const toolContext = ToolContext.of(
            options.budget?.deadline === undefined
              ? contextBase
              : { ...contextBase, deadline: options.budget.deadline },
          )
          const handoffExecution = handoffFor(request, registry)
          const skillActivation = isSkillActivationCall(call, registry)
          const requestExecutor =
            !skillActivation && handoffExecution === undefined && Option.isSome(executor) ? executor.value : undefined
          const replayPolicy = requestExecutor?.replayPolicy?.(request) ?? "never"
          const cancellation =
            requestExecutor !== undefined && supportsCancellation(requestExecutor, request)
              ? { cancellation: cancellableOperation(request) }
              : {}
          const activatedSkills = [...(yield* Ref.get(toolState)).activatedSkillBodies.keys()]
          const invocationPath =
            handoffState === undefined ? [] : (yield* Ref.get(handoffState)).path.map((frame) => frame.handoffId)
          const executionBase = executionFor(
            turn,
            call,
            request,
            registry,
            handoffExecution,
            requestExecutor,
            skillActivation,
          ).pipe(Effect.flatMap((outcome) => boundOutcome(call, outcome)))
          const execution = intercept(
            {
              kind: "tool",
              key: durableOperationKey,
              turn,
              input: { turn, callId: call.id, name: call.name, ...cancellation },
              replayPolicy,
              success: Outcome,
              failure: RunError,
              applyCheckpoint: applyToolOutcome({
                callIndex: request.toolCallIndex,
                call,
                operationKey: durableOperationKey,
                activatedSkills,
                invocationPath,
                collapseSuspension: options.suspensionPropagation === "collapse-to-domain-failure",
              }),
            },
            executionBase,
          ).pipe(
            Effect.tap((outcome) =>
              Effect.gen(function* () {
                if (!skillActivation || outcome._tag !== "Success") return
                const activation = Schema.decodeUnknownOption(activateSkillSuccess)(outcome.result)
                yield* activateSkillOutcome(turn, call, Option.isSome(activation) ? activation.value.body : undefined)
              }),
            ),
          )
          const toolBody = Effect.uninterruptibleMask((restore) =>
            restore(execution.pipe(Effect.provideService(ToolContext, toolContext))).pipe(
              Effect.flatMap((outcome) =>
                Ref.get(droppedProgress).pipe(
                  Effect.flatMap((dropped) =>
                    outcomeEvent(
                      turn,
                      request.toolCallBatch,
                      request.toolCallIndex,
                      call,
                      outcome,
                      dropped,
                      registry,
                      durableOperationKey,
                    ),
                  ),
                ),
              ),
            ),
          ).pipe(
            Effect.ensuring(Queue.end(progressQueue).pipe(Effect.asVoid)),
            Effect.withSpan("TenetKit.Agent.tool", {
              attributes: {
                "tenetkit.turn": turn,
                "tenetkit.tool.call_id": call.id,
                "tenetkit.tool.name": call.name,
              },
            }),
          )
          const fiber = yield* Effect.forkScoped(toolBody, { startImmediately: true })
          return Stream.concat(Stream.fromQueue(progressQueue), Stream.fromEffect(Fiber.join(fiber)))
        }),
      ),
    )

  const authorizationError = (turn: number, error: AuthorizationError): AgentError =>
    AgentError.make({ message: error.message, turn, cause: error })

  const resumeApproved = (
    turn: number,
    toolCallBatch: Request["toolCallBatch"],
    toolCallIndex: number,
    call: AnyToolCall,
    registry: Registry,
  ): Stream.Stream<
    Event,
    RunError,
    ClosedServices<T, never> | AuthorizationR | import("../../durable/driver/interpreter.js").DriverInterpreter
  > =>
    Stream.unwrap(
      activeAgentName().pipe(
        Effect.map((agentName) =>
          executeApproved(turn, call, { call, toolCallBatch, turn, toolCallIndex, agentName, sessionId }, registry),
        ),
      ),
    )

  const toolCallEvents = (
    turn: number,
    toolCallBatch: Request["toolCallBatch"],
    toolCallIndex: number,
    call: AnyToolCall,
    messages: ReadonlyArray<Prompt.Message>,
    registry: Registry,
  ): Stream.Stream<
    Event,
    RunError,
    ClosedServices<T, never> | AuthorizationR | import("../../durable/driver/interpreter.js").DriverInterpreter
  > => {
    const request: Request = { call, toolCallBatch, turn, toolCallIndex, agentName: "", sessionId }
    const candidate = get(registry, call.name)
    if (candidate === undefined)
      return Stream.fail(
        FrameworkFailure.make({
          stage: "authorization",
          tool: call.name,
          message: `Tool ${call.name} is not active for turn ${turn}`,
        }),
      )
    const activeTools = toolNames(registry)
    return Stream.unwrap(
      Effect.gen(function* () {
        const agentName = yield* activeAgentName()
        const resolvedRequest = { ...request, agentName }
        const activatedSkills = [...(yield* Ref.get(toolState)).activatedSkillBodies.keys()]
        const approvalEvents = yield* Queue.bounded<Event, Cause.Done>(1)
        const authorization = authorizer
          .authorize({
            call,
            agentName,
            turn,
            sessionId,
            tool: candidate.tool,
            active: true,
            activeTools,
            activatedSkills,
            messages,
            onApprovalRequired: (approval) =>
              Queue.offer(approvalEvents, { _tag: "ApprovalRequested", turn, call, request: approval }).pipe(
                Effect.asVoid,
              ),
          })
          .pipe(
            Effect.mapError((error) => authorizationError(turn, error)),
            Effect.ensuring(Queue.end(approvalEvents).pipe(Effect.asVoid)),
          )
        const fiber = yield* Effect.forkScoped(authorization, { startImmediately: true })
        return Stream.concat(
          Stream.fromQueue(approvalEvents),
          Stream.fromEffect(Fiber.join(fiber)).pipe(
            Stream.flatMap((decision) => {
              switch (decision._tag) {
                case "Execute":
                  return Stream.unwrap(
                    updateToolBatch((checkpoint) =>
                      updateCall(checkpoint, {
                        callIndex: toolCallIndex,
                        state: { _tag: "Ready", stage: "execution" },
                      }),
                    ).pipe(Effect.map(() => executeApproved(turn, call, resolvedRequest, registry))),
                  )
                case "Deny":
                  return Stream.fail(
                    FrameworkFailure.make({
                      stage: "authorization",
                      tool: call.name,
                      message: decision.error.message,
                    }),
                  )
                case "Suspend":
                  return Stream.fromEffect(
                    Effect.gen(function* () {
                      const invocationPath =
                        handoffState === undefined
                          ? []
                          : (yield* Ref.get(handoffState)).path.map((frame) => frame.handoffId)
                      yield* updateToolBatch((checkpoint) =>
                        updateCall(checkpoint, {
                          callIndex: toolCallIndex,
                          state: {
                            _tag: "Waiting",
                            reason: "approval",
                            waitId: decision.token,
                            token: decision.token,
                          },
                          activatedSkills,
                          invocationPath,
                        }),
                      )
                    }),
                  ).pipe(Stream.drain)
              }
            }),
          ),
        )
      }),
    )
  }
  return {
    boundOutcome,
    outcomeEvent,
    defaultExecute,
    makeProgressQueue,
    executeApproved,
    activateSkillOutcome,
    authorizationError,
    resumeApproved,
    toolCallEvents,
  }
}
