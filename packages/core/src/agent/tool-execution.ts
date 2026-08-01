import { Cause, Effect, Fiber, Option, Queue, Ref, Schema, Semaphore, Stream } from "effect"
import { Prompt, Tool, Toolkit } from "effect/unstable/ai"
import {
  AgentSuspended,
  AgentError,
  type Event,
  type ToolProgress,
  ProgressOverflow,
  ToolNameCollision,
} from "../agent-event.js"
import { type AnyToolCall, domainFailureResult, successResult, type PendingToolResult } from "../agent-tool-result.js"
import type { Agent, ProgressOverflowPolicy, RunError, RunOptions } from "../agent.js"
import type { AgentRunState } from "./agent-run-state.js"
import { type AuthorizationError, type ToolAuthorizer } from "../tool-authorization.js"
import {
  type DomainFailure,
  FrameworkFailure,
  type Outcome,
  type Request,
  RemoteRetryMisconfigured,
  type Success,
  ToolExecutor,
  executeToolkit,
} from "../tool-executor.js"
import { bound } from "../tool-output.js"
import { type Candidate, type Registry, assemble, get } from "../tool-registry.js"
import { ToolContext } from "../tool-context.js"
import { activateSkillParameters } from "../agent-skill-tool.js"
import { canonicalSuspensionCall, suspended } from "../agent-suspension.js"
import type { Skill, SkillSourceError } from "../skill-source.js"

type StaticToolServices<T extends Record<string, Tool.Any>> =
  | Tool.HandlersFor<T>
  | Exclude<Tool.HandlerServices<T[keyof T]>, ToolContext>
const isToolNameCollision = Schema.is(ToolNameCollision)

interface ToolState {
  readonly registry: Registry
  readonly activatedSkillBodies: Map<string, string>
}

interface ToolExecutionContext<T extends Record<string, Tool.Any>, R> {
  readonly options: RunOptions
  readonly state: AgentRunState
  readonly isSkillActivationCall: (call: AnyToolCall, registry: Registry) => boolean
  readonly agent: Agent<T, R>
  readonly sessionId: string
  readonly staticToolkit: Toolkit.Toolkit<Record<string, Tool.Any>>
  readonly executor: Option.Option<typeof ToolExecutor.Service>
  readonly authorizer: ToolAuthorizer<R>
  readonly skillRuntime:
    | { readonly source: { readonly get: (name: string) => Effect.Effect<Skill | undefined, SkillSourceError> } }
    | undefined
  readonly toolState: Ref.Ref<ToolState>
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
    sessionId,
    staticToolkit,
    executor,
    authorizer,
    skillRuntime,
    toolState,
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
        return Effect.fail(suspended(call, toolCallBatch, toolCallIndex, outcome.token, "tool-wait"))
    }
  }

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

  const executeApproved = (
    turn: number,
    call: AnyToolCall,
    request: Request,
    registry: Registry,
  ): Stream.Stream<Event, RunError, StaticToolServices<T>> =>
    Stream.concat(
      Stream.fromIterable<Event>([{ _tag: "ToolExecutionStarted", turn, call }]),
      Stream.unwrap(
        Effect.gen(function* () {
          const progressQueue = yield* Effect.acquireRelease(makeProgressQueue(), Queue.shutdown)
          const droppedProgress = yield* Ref.make(0)
          const emitSemaphore = yield* Semaphore.make(1)
          const signal = yield* Effect.abortSignal
          const toolContext = ToolContext.of({
            signal,
            sessionId,
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
          const execution: Effect.Effect<
            Outcome,
            AgentError | ToolNameCollision | FrameworkFailure,
            ToolContext | Tool.HandlersFor<T> | Tool.HandlerServices<T[keyof T]>
          > = isSkillActivationCall(call, registry)
            ? activateSkillOutcome(turn, call)
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
          const fiber = yield* Effect.uninterruptibleMask((restore) =>
            restore(execution.pipe(Effect.provideService(ToolContext, toolContext))).pipe(
              Effect.flatMap((outcome) =>
                Ref.get(droppedProgress).pipe(
                  Effect.flatMap((dropped) =>
                    outcomeEvent(turn, request.toolCallBatch, request.toolCallIndex, call, outcome, dropped, registry),
                  ),
                ),
              ),
            ),
          ).pipe(
            Effect.ensuring(Queue.end(progressQueue).pipe(Effect.asVoid)),
            Effect.forkScoped({ startImmediately: true }),
          )
          return Stream.concat(Stream.fromQueue(progressQueue), Stream.fromEffect(Fiber.join(fiber)))
        }),
      ),
    )

  const activateSkillOutcome = (
    turn: number,
    call: AnyToolCall,
  ): Effect.Effect<Outcome, AgentError | ToolNameCollision | FrameworkFailure> =>
    Effect.gen(function* () {
      if (skillRuntime === undefined) {
        return yield* FrameworkFailure.make({
          stage: "missing-handler",
          tool: call.name,
          message: "SkillSource is not available",
        })
      }
      const params = Schema.decodeUnknownOption(activateSkillParameters)(call.params)
      if (Option.isNone(params)) {
        return yield* FrameworkFailure.make({
          stage: "decode-input",
          tool: call.name,
          message: "Skill activation requires a name",
        })
      }
      const skill = yield* skillRuntime.source.get(params.value.name)
      if (skill === undefined) {
        const failure = { reason: "not-found" as const, message: `Skill not found: ${params.value.name}` }
        return { _tag: "DomainFailure", failure, encodedFailure: failure } satisfies DomainFailure
      }
      if (skill.frontmatter.disableModelInvocation === true) {
        const failure = {
          reason: "not-model-invocable" as const,
          message: `Skill is not model-invocable: ${params.value.name}`,
        }
        return { _tag: "DomainFailure", failure, encodedFailure: failure } satisfies DomainFailure
      }
      const current = yield* Ref.get(toolState)
      let body = current.activatedSkillBodies.get(skill.frontmatter.name)
      if (body === undefined) {
        const registry = yield* assemble([
          ...current.registry.entries,
          ...skill.tools.map(
            (tool): Candidate => ({
              tool,
              origin: { _tag: "Skill", skill: skill.frontmatter.name },
              dispatch: "Skill",
            }),
          ),
        ])
        body = yield* skill.body
        const activatedSkillBodies = new Map(current.activatedSkillBodies)
        activatedSkillBodies.set(skill.frontmatter.name, body)
        yield* Ref.set(toolState, { registry, activatedSkillBodies })
      }
      const output = {
        name: skill.frontmatter.name,
        body,
        allowedTools: [...(skill.frontmatter.allowedTools ?? [])],
      }
      return { _tag: "Success", result: output, encodedResult: output } satisfies Success
    }).pipe(
      Effect.mapError((error) =>
        isToolNameCollision(error) || Schema.is(FrameworkFailure)(error) ? error : skillError(turn, error),
      ),
    )

  const authorizationError = (turn: number, error: AuthorizationError): AgentError =>
    AgentError.make({ message: error.message, turn, cause: error })

  const toolCallEvents = (
    turn: number,
    toolCallBatch: Request["toolCallBatch"],
    toolCallIndex: number,
    call: AnyToolCall,
    messages: ReadonlyArray<Prompt.Message>,
    registry: Registry,
  ): Stream.Stream<Event, RunError, StaticToolServices<T> | R> => {
    const request: Request = { call, toolCallBatch, turn, toolCallIndex, agentName: agent.name, sessionId }
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
        const activatedSkills = [...(yield* Ref.get(toolState)).activatedSkillBodies.keys()]
        const approvalEvents = yield* Queue.bounded<Event, Cause.Done>(1)
        const fiber = yield* authorizer
          .authorize({
            call,
            agentName: agent.name,
            turn,
            sessionId,
            tool: candidate.tool,
            active: true,
            activeTools,
            activatedSkills,
            messages,
            onApprovalRequired: Queue.offer(approvalEvents, { _tag: "ApprovalRequested", turn, call }).pipe(
              Effect.asVoid,
            ),
          })
          .pipe(
            Effect.mapError((error) => authorizationError(turn, error)),
            Effect.ensuring(Queue.end(approvalEvents).pipe(Effect.asVoid)),
            Effect.forkScoped({ startImmediately: true }),
          )
        return Stream.concat(
          Stream.fromQueue(approvalEvents),
          Stream.fromEffect(Fiber.join(fiber)).pipe(
            Stream.flatMap((decision) => {
              switch (decision._tag) {
                case "Execute":
                  return executeApproved(turn, call, request, registry)
                case "Deny":
                  return Stream.fail(
                    FrameworkFailure.make({
                      stage: "authorization",
                      tool: call.name,
                      message: decision.error.message,
                    }),
                  )
                case "Suspend":
                  return Stream.fail(
                    AgentSuspended.make({
                      token: decision.suspension.token,
                      reason: "approval",
                      tool_call_index: toolCallIndex,
                      tool_call_id: call.id,
                      tool_name: call.name,
                      tool_params: call.params,
                      tool_call_batch: toolCallBatch.calls.map(canonicalSuspensionCall),
                      active_tools: activeTools,
                      activated_skills: activatedSkills,
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
    toolCallEvents,
  }
}
