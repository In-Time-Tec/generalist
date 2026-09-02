import { Cause, Deferred, Effect, Fiber, Option, Queue, Ref, Schema, Semaphore, Stream } from "effect"
import { Chat, Tool, Toolkit } from "effect/unstable/ai"
import { AgentError, type Event, type ToolProgress, ProgressOverflow } from "../event.js"
import { type AnyToolCall, domainFailureResult, interrupted, successResult, type PendingToolResult } from "./result.js"
import type { Agent, ClosedServices, ProgressOverflowPolicy, RunOptions } from "../service.js"
import { RunError } from "../run/error.js"
import type { AgentRunState } from "../run-state.js"
import type { HandoffRunState } from "../handoff/state.js"
import type { Authorizer } from "../../tools/tool-authorization.js"
import {
  FrameworkFailure,
  Outcome,
  type Request,
  RemoteRetryMisconfigured,
  type SettledOutcome,
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
import { intercept } from "../../durable/driver/run.js"
import { type DriverInterpreter, operationKey as makeOperationKey } from "../../durable/driver/interpreter.js"
import { handoffDispatch } from "../handoff/tool-execution.js"
import { applyToolOutcome } from "./checkpoint-operation.js"
import { Exhausted } from "../../durable/run-budget.js"
import { memoizeRegistered } from "../../memo/tool.js"
import { toolResult as applyToolResult } from "../lifecycle/hooks.js"
import type { RunId } from "../../durable/run-id.js"
import { make as makeToolAuthorization } from "./authorization.js"
import { definition as fanOutDefinition, withoutFanOut } from "../tool/fan-out.js"
import { execute as executeFanOut } from "./fan-out.js"
import type { RunInbox } from "../../turn/steering-inbox.js"
interface ToolExecutionContext<T extends Record<string, Tool.Any>, AgentR, PolicyR, AuthorizationR> {
  readonly runId: RunId
  readonly inbox?: RunInbox
  readonly options: RunOptions
  readonly state: AgentRunState
  readonly isSkillActivationCall: (call: AnyToolCall, registry: Registry) => boolean
  readonly agent: Agent<T, AgentR, PolicyR, AuthorizationR, Schema.Top, Schema.Top>
  readonly staticToolkit: Toolkit.Toolkit<T>
  readonly chat: Chat.Service
  readonly lastWirePrompt: Ref.Ref<import("effect/unstable/ai").Prompt.Prompt | undefined>
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
    runId,
    options,
    isSkillActivationCall,
    agent,
    staticToolkit,
    chat,
    lastWirePrompt,
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
        if (Schema.is(Exhausted)(outcome.failure)) return Effect.fail(outcome.failure)
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
            ...(outcome.awaitEvent === undefined ? undefined : { awaitEvent: outcome.awaitEvent }),
          } satisfies Event
        })
    }
  }
  const activateSkillOutcome = makeActivateSkillOutcome({ skillRuntime, toolState, skillError })
  const activeAgentName = (): Effect.Effect<string> =>
    handoffState === undefined
      ? Effect.succeed(agent.name)
      : Ref.get(handoffState).pipe(Effect.map((handoffRun) => handoffRun.active.name))
  const unlessBlocked = <E, R>(reason: string | undefined, execute: () => Effect.Effect<Outcome, E, R>) =>
    reason === undefined ? execute() : Effect.succeed(hookBlockedOutcome("ToolCall", reason))
  const defaultExecute = (request: Request, registry: Registry) => {
    const registered = get(registry, request.call.name)
    if (registered?.dispatch === "Static") {
      const fanOut = fanOutDefinition(registered.tool)
      if (fanOut !== undefined) return executeFanOut(agent, fanOut, request)
      return executeToolkit(withoutFanOut(staticToolkit), request)
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
  ): Effect.Effect<Outcome, RunError, ClosedServices<T, never> | ToolContext | DriverInterpreter> => {
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

  const hookBlockedOutcome = (event: "ToolCall" | "ToolResult", reason: string): Outcome => {
    const failure = { reason: "hook-blocked", message: `${event} hook blocked the tool: ${reason}` }
    return { _tag: "DomainFailure", failure, encodedFailure: failure }
  }

  const hookToolResult = (
    agentName: string,
    turn: number,
    call: AnyToolCall,
    outcome: Outcome,
  ): Effect.Effect<Outcome, RunError, DriverInterpreter> => {
    if (outcome._tag === "Suspend") return Effect.succeed(outcome)
    const result = outcome._tag === "Success" ? outcome.result : outcome.failure
    const input = { runId, agentName, turn, tool: call.name, args: call.params, call, result }
    return applyToolResult(input).pipe(
      Effect.map((hook) => {
        if (hook.blocked !== undefined) return hookBlockedOutcome("ToolResult", hook.blocked)
        if (!hook.decisions.some((decision) => decision._tag === "Replace")) return outcome
        const value = hook.input.result
        return outcome._tag === "Success"
          ? { ...outcome, result: value, encodedResult: value }
          : { ...outcome, failure: value, encodedFailure: value }
      }),
    )
  }

  const executeApproved = (
    turn: number,
    call: AnyToolCall,
    request: Request,
    registry: Registry,
    blockedReason?: string,
  ): Stream.Stream<Event, RunError, ClosedServices<T, never> | DriverInterpreter> =>
    Stream.unwrap(
      Effect.gen(function* () {
        const startQueue = yield* Effect.acquireRelease(Queue.bounded<Event, Cause.Done>(1), Queue.shutdown)
        const progressQueue = yield* Effect.acquireRelease(makeProgressQueue(), Queue.shutdown)
        const startPersisted = yield* Deferred.make<void>()
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
          runId,
          agentName: request.agentName,
          turn,
          toolCallId: call.id,
          operationKey: durableOperationKey,
          idempotencyKey: durableOperationKey,
          ...invocation,
          emit,
          history: Ref.get(lastWirePrompt).pipe(
            Effect.flatMap((prompt) => (prompt === undefined ? Ref.get(chat.history) : Effect.succeed(prompt))),
          ),
          agent,
        }
        const toolContext = ToolContext.of(contextBase)
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
        const liveOutcome = unlessBlocked(blockedReason, () =>
          memoizeRegistered({
            registry,
            name: call.name,
            skillActivation,
            handoff: handoffExecution !== undefined,
            params: call.params,
            run: options.invocation?.runId ?? sessionId,
            operation: durableOperationKey,
            execute: executionFor(
              turn,
              call,
              request,
              registry,
              handoffExecution,
              requestExecutor,
              skillActivation,
            ).pipe(Effect.flatMap((outcome) => boundOutcome(call, outcome))),
          }),
        )
        const start = Queue.offer(startQueue, { _tag: "ToolExecutionStarted", turn, call }).pipe(
          Effect.ensuring(Queue.end(startQueue).pipe(Effect.asVoid)),
          Effect.andThen(Deferred.await(startPersisted)),
        )
        const executionBase = start.pipe(
          Effect.andThen(inputContext.inbox?.interruptTool(liveOutcome, interrupted) ?? liveOutcome),
          Effect.flatMap((outcome) => hookToolResult(request.agentName, turn, call, outcome)),
        )
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
          Effect.ensuring(Queue.end(startQueue).pipe(Effect.asVoid)),
          Effect.ensuring(Queue.end(progressQueue).pipe(Effect.asVoid)),
          Effect.withSpan("Generalist.Agent.tool", {
            attributes: {
              "generalist.turn": turn,
              "generalist.tool.call_id": call.id,
              "generalist.tool.name": call.name,
            },
          }),
        )
        const fiber = yield* Effect.forkScoped(toolBody, { startImmediately: true })
        const started = Stream.concat(
          Stream.fromQueue(startQueue),
          Stream.fromEffect(Deferred.succeed(startPersisted, undefined)).pipe(Stream.drain),
        )
        return Stream.concat(
          started,
          Stream.concat(Stream.fromQueue(progressQueue), Stream.fromEffect(Fiber.join(fiber))),
        )
      }),
    )
  const resumeApproved = (
    turn: number,
    toolCallBatch: Request["toolCallBatch"],
    toolCallIndex: number,
    call: AnyToolCall,
    registry: Registry,
  ): Stream.Stream<Event, RunError, ClosedServices<T, never> | AuthorizationR | DriverInterpreter> =>
    Stream.unwrap(
      activeAgentName().pipe(
        Effect.map((agentName) =>
          executeApproved(turn, call, { call, toolCallBatch, turn, toolCallIndex, agentName, sessionId }, registry),
        ),
      ),
    )

  const transformResolved = (
    turn: number,
    toolCallBatch: Request["toolCallBatch"],
    toolCallIndex: number,
    call: AnyToolCall,
    result: PendingToolResult,
  ): Effect.Effect<PendingToolResult, RunError, ClosedServices<T, never> | DriverInterpreter> =>
    Effect.gen(function* () {
      const agentName = yield* activeAgentName()
      const request = { call, toolCallBatch, turn, toolCallIndex, agentName, sessionId }
      const outcome: SettledOutcome = result.isFailure
        ? { _tag: "DomainFailure", failure: result.result, encodedFailure: result.encodedResult }
        : { _tag: "Success", result: result.result, encodedResult: result.encodedResult }
      const transform = Option.isSome(executor) ? executor.value.transformResolved : undefined
      const transformed =
        transform !== undefined
          ? yield* Effect.scoped(
              Effect.gen(function* () {
                const signal = yield* Effect.abortSignal
                const logicalId = options.logicalOperationId ?? options.sessionId ?? agent.name
                const operationKey = makeOperationKey(logicalId, "tool", turn, call.id, call.name)
                const context = ToolContext.of({
                  signal,
                  sessionId,
                  runId,
                  agentName,
                  turn,
                  toolCallId: call.id,
                  operationKey,
                  idempotencyKey: operationKey,
                  ...options.invocation,
                  emit: () => Effect.succeed(true),
                })
                return yield* transform(request, outcome).pipe(Effect.provideService(ToolContext, context))
              }),
            ).pipe(
              Effect.mapError((error) =>
                Schema.is(RemoteRetryMisconfigured)(error)
                  ? AgentError.make({ message: error.message, turn, cause: error })
                  : error,
              ),
            )
          : outcome
      const hooked = yield* hookToolResult(agentName, turn, call, transformed)
      if (hooked._tag === "Suspend") {
        return yield* AgentError.make({ message: `Resolved tool ${call.name} suspended again`, turn })
      }
      return hooked._tag === "Success" ? successResult(call, hooked) : domainFailureResult(call, hooked)
    })
  const toolCallEvents = makeToolAuthorization({
    runId,
    sessionId,
    invocationRunId: options.invocation?.runId,
    authorizer,
    toolState,
    handoffState,
    activeAgentName,
    executeApproved,
  })
  return {
    boundOutcome,
    outcomeEvent,
    defaultExecute,
    makeProgressQueue,
    executeApproved,
    activateSkillOutcome,
    resumeApproved,
    transformResolved,
    toolCallEvents,
  }
}
