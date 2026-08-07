import { Cause, Duration, Effect, Fiber, Option, Queue, Ref, Schema, Semaphore, Stream } from "effect"
import { Chat, Prompt, Tool } from "effect/unstable/ai"
import {
  AgentSuspended,
  AgentError,
  type Event,
  type ToolProgress,
  ProgressOverflow,
  type ToolNameCollision,
} from "./agent-event.js"
import { type AnyToolCall, domainFailureResult, successResult, type PendingToolResult } from "./agent-tool-result.js"
import type { Agent, ProgressOverflowPolicy, RunError, RunOptions } from "./agent.js"
import type { AgentRunState } from "./agent-run-state.js"
import type { HandoffRunState } from "./handoff-state.js"
import { type AuthorizationError, type ToolAuthorizer } from "../tools/tool-authorization.js"
import {
  FrameworkFailure,
  type Outcome,
  type Request,
  RemoteRetryMisconfigured,
  type Success,
  ToolExecutor,
  executeToolkit,
} from "../tools/tool-executor.js"
import { bound } from "../tools/tool-output.js"
import { type Registry, get } from "../tools/tool-registry.js"
import { ToolContext } from "../tools/tool-context.js"
import { canonicalSuspensionCall, suspended } from "./agent-suspension.js"
import { makeActivateSkillOutcome, type ToolState } from "./tool-skill-activation.js"
import type { Skill, SkillSourceError } from "../context/skill-source.js"
import { intercept } from "../durable/driver-run.js"
import { operationKey } from "../durable/driver-interpreter.js"
import { handoffDispatch } from "./handoff-tool-execution.js"
import { HandoffCatalog } from "../policy/handoff-target.js"

/**
 * Bound on how long a cancelled run waits for one forked tool or approval fiber to finish tearing down.
 * A fiber that is uninterruptible, or that supervises an uninterruptible child, would otherwise keep the
 * owning scope open forever and strand the run in `cancelling`.
 */
const toolTeardownGrace = Duration.seconds(5)

/** Interrupt a forked tool or approval fiber and wait for its teardown without letting it wedge the run. */
const teardown = <A, E>(fiber: Fiber.Fiber<A, E>): Effect.Effect<void> =>
  Fiber.interrupt(fiber).pipe(Effect.timeoutOption(toolTeardownGrace), Effect.asVoid)

type StaticToolServices<T extends Record<string, Tool.Any>> =
  | Tool.HandlersFor<T>
  | Exclude<Tool.HandlerServices<T[keyof T]>, ToolContext>

interface ToolExecutionContext<T extends Record<string, Tool.Any>, R> {
  readonly options: RunOptions
  readonly state: AgentRunState
  readonly isSkillActivationCall: (call: AnyToolCall, registry: Registry) => boolean
  readonly agent: Agent<T, R>
  readonly chat: Chat.Service
  readonly sessionId: string
  readonly executor: Option.Option<typeof ToolExecutor.Service>
  readonly authorizer: ToolAuthorizer<R>
  readonly skillRuntime:
    | { readonly source: { readonly get: (name: string) => Effect.Effect<Skill | undefined, SkillSourceError> } }
    | undefined
  readonly toolState: Ref.Ref<ToolState>
  readonly handoffState?: Ref.Ref<HandoffRunState>
  readonly progressPolicy: ProgressOverflowPolicy
  readonly activeSession: Option.Option<unknown>
  readonly memoryRuntime: unknown | undefined
  readonly errorMessage: (error: unknown) => string
  readonly skillError: (turn: number, error: SkillSourceError) => AgentError
}

export const makeToolExecution = <T extends Record<string, Tool.Any>, R = never>(
  inputContext: ToolExecutionContext<T, R>,
) => {
  const {
    options,
    state,
    isSkillActivationCall,
    agent,
    chat,
    sessionId,
    executor,
    authorizer,
    skillRuntime,
    toolState,
    handoffState,
    progressPolicy,
    skillError,
  } = inputContext
  const boundedSuccessResult = (call: AnyToolCall, outcome: Success): Effect.Effect<PendingToolResult> =>
    options.toolOutputMaxBytes === undefined
      ? Effect.succeed(successResult(call, outcome))
      : bound(outcome, { toolCallId: call.id, maxBytes: options.toolOutputMaxBytes }).pipe(
          Effect.map((bounded) => successResult(call, bounded)),
        )

  const outcomeEvent = (
    turn: number,
    toolCallBatch: Request["toolCallBatch"],
    toolCallIndex: number,
    call: AnyToolCall,
    outcome: Outcome,
    droppedProgress: number,
    registry: Registry,
  ): Effect.Effect<Event, RunError> => {
    const metadata = droppedProgress === 0 ? {} : { metadata: { toolProgress: { dropped: droppedProgress } } }
    const completed = (result: PendingToolResult): Effect.Effect<Event> =>
      Effect.sync(() => {
        state.pending.set(toolCallIndex, result)
        return { _tag: "ToolExecutionCompleted", turn, call, result, ...metadata }
      })
    switch (outcome._tag) {
      case "Success":
        return (
          isSkillActivationCall(call, registry)
            ? Effect.succeed(successResult(call, outcome))
            : boundedSuccessResult(call, outcome)
        ).pipe(Effect.flatMap(completed))
      case "DomainFailure":
        return completed(domainFailureResult(call, outcome))
      case "Suspend":
        return Effect.gen(function* () {
          const propagation = options.suspensionPropagation ?? "propagate"
          if (propagation === "collapse-to-domain-failure") {
            const failure = {
              reason: "suspended" as const,
              message: `Tool ${call.name} suspended (${outcome.token})`,
            }
            return yield* completed(
              domainFailureResult(call, { _tag: "DomainFailure", failure, encodedFailure: failure }),
            )
          }
          const invocationPath =
            handoffState === undefined ? undefined : (yield* Ref.get(handoffState)).path.map((frame) => frame.handoffId)
          const activatedSkills = [...(yield* Ref.get(toolState)).activatedSkillBodies.keys()]
          return yield* suspended(
            call, toolCallBatch, toolCallIndex, outcome.token, "tool-wait", {
              active_tools: registry.entries.map((entry) => entry.tool.name),
              activated_skills: activatedSkills,
              ...(invocationPath === undefined || invocationPath.length === 0
                ? {}
                : { invocation_path: invocationPath }),
            },
          )
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
      const executed: Effect.Effect<
        Outcome,
        FrameworkFailure,
        Tool.HandlersFor<T> | Tool.HandlerServices<T[keyof T]>
      > = executeToolkit(registry.toolkit, request)
      return executed
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

  const executeApproved = (
    turn: number,
    call: AnyToolCall,
    request: Request,
    registry: Registry,
  ): Stream.Stream<
    Event,
    RunError,
    StaticToolServices<T> | HandoffCatalog | import("../durable/driver-interpreter.js").DriverInterpreter
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
          const durableOperationKey = operationKey(logicalId, "tool", turn, request.toolCallIndex, call.id, call.name)
          const toolContext = ToolContext.of({
            signal,
            sessionId,
            toolCallId: call.id,
            operationKey: durableOperationKey,
            idempotencyKey: durableOperationKey,
            ...(options.invocation === undefined ? {} : options.invocation),
            ...(options.budget?.deadline === undefined ? {} : { deadline: options.budget.deadline }),
            emit: (progress) => {
              const event: ToolProgress = {
                _tag: "ToolProgress",
                turn,
                toolCallId: progress.toolCallId,
                ...(progress.message === undefined ? {} : { message: progress.message }),
                ...(progress.data === undefined ? {} : { data: progress.data }),
              }
              return emitSemaphore.withPermit(
                Effect.gen(function* () {
                  if (progressPolicy._tag === "Sliding") {
                    const dropped = yield* Effect.sync(() => {
                      const full = Queue.isFullUnsafe(progressQueue)
                      Queue.offerUnsafe(progressQueue, event)
                      return full
                    })
                    if (dropped) yield* Ref.update(droppedProgress, (count) => count + 1)
                    return
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
                }),
              )
            },
          })
          const handoffCandidate = get(registry, request.call.name)
          const handoffExecution =
            handoffState !== undefined && handoffCandidate?.dispatch === "Handoff"
              ? handoffDispatch(request, registry, {
                  options,
                  handoffState,
                  chat,
                  toolState,
                  resolvingToolCallIds: request.toolCallBatch.calls.map((entry) => entry.id),
                })
              : undefined
          const executionBase: Effect.Effect<
            Outcome,
            AgentError | ToolNameCollision | FrameworkFailure | import("./agent.js").RunError,
            | ToolContext
            | Tool.HandlersFor<T>
            | Tool.HandlerServices<T[keyof T]>
            | HandoffCatalog
            | import("../durable/driver-interpreter.js").DriverInterpreter
          > = isSkillActivationCall(call, registry)
            ? activateSkillOutcome(turn, call)
            : handoffExecution !== undefined
              ? handoffExecution
              : Option.isNone(executor)
                ? defaultExecute(request, registry)
                : executor.value
                    .execute(request)
                    .pipe(
                      Effect.mapError((error) =>
                        Schema.is(RemoteRetryMisconfigured)(error)
                          ? AgentError.make({ message: error.message, turn, cause: error })
                          : error,
                      ),
                    )
          const execution = intercept(
            {
              kind: "tool",
              key: durableOperationKey,
              input: {
                turn,
                toolCallIndex: request.toolCallIndex,
                callId: call.id,
                name: call.name,
              },
              replayPolicy: "never",
            },
            executionBase,
          )
          const toolBody = Effect.uninterruptibleMask((restore) =>
            restore(execution.pipe(Effect.provideService(ToolContext, toolContext))).pipe(
              Effect.flatMap((outcome) =>
                Ref.get(droppedProgress).pipe(
                  Effect.flatMap((dropped) =>
                    outcomeEvent(turn, request.toolCallBatch, request.toolCallIndex, call, outcome, dropped, registry),
                  ),
                ),
              ),
            ),
          ).pipe(Effect.ensuring(Queue.end(progressQueue).pipe(Effect.asVoid)))
          const fiber = yield* Effect.acquireRelease(Effect.forkDetach(toolBody, { startImmediately: true }), teardown)
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
  ): Stream.Stream<Event, RunError, StaticToolServices<T> | R> =>
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
  ): Stream.Stream<Event, RunError, StaticToolServices<T> | R> => {
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
    const activeTools = registry.entries.map((entry) => entry.tool.name)
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
        const fiber = yield* Effect.acquireRelease(
          Effect.forkDetach(authorization, { startImmediately: true }),
          teardown,
        )
        return Stream.concat(
          Stream.fromQueue(approvalEvents),
          Stream.fromEffect(Fiber.join(fiber)).pipe(
            Stream.flatMap((decision) => {
              switch (decision._tag) {
                case "Execute":
                  return executeApproved(turn, call, resolvedRequest, registry)
                case "Deny":
                  return Stream.fail(
                    FrameworkFailure.make({
                      stage: "authorization",
                      tool: call.name,
                      message: decision.error.message,
                    }),
                  )
                case "Suspend":
                  return Stream.unwrap(
                    Effect.gen(function* () {
                      const invocationPath =
                        handoffState === undefined
                          ? undefined
                          : (yield* Ref.get(handoffState)).path.map((frame) => frame.handoffId)
                      return yield* AgentSuspended.make({
                        token: decision.suspension.token,
                        reason: "approval",
                        tool_call_index: toolCallIndex,
                        tool_call_id: call.id,
                        tool_name: call.name,
                        tool_params: call.params,
                        tool_call_batch: toolCallBatch.calls.map(canonicalSuspensionCall),
                        active_tools: activeTools,
                        activated_skills: activatedSkills,
                        ...(invocationPath === undefined || invocationPath.length === 0
                          ? {}
                          : { invocation_path: invocationPath }),
                      })
                    }),
                  )
              }
            }),
          ),
        )
      }),
    )
  }
  return {
    boundedSuccessResult,
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
