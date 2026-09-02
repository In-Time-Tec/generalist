import { Cause, Effect, Fiber, Queue, Ref, Schema, Stream, Types } from "effect"
import type { Prompt } from "effect/unstable/ai"
import { AgentError, type Event } from "../event.js"
import type { HandoffRunState } from "../handoff/state.js"
import type { RunError } from "../run/error.js"
import type { AnyToolCall } from "./result.js"
import {
  AuthorizationError,
  type Authorizer,
  type Request as AuthorizationRequest,
} from "../../tools/tool-authorization.js"
import { FrameworkFailure, type Request } from "../../tools/tool-executor.js"
import { type Registry, get } from "../../tools/tool-registry.js"
import type { ToolState } from "./skill-activation.js"
import { updateToolBatch } from "../../durable/driver/run.js"
import type { DriverInterpreter } from "../../durable/driver/interpreter.js"
import { replaceCall, updateCall } from "./checkpoint.js"
import { approvalRequest as applyApprovalRequest, toolCall as applyToolCall } from "../lifecycle/hooks.js"
import type { RunId } from "../../durable/run-id.js"

interface AuthorizationContext<AuthorizationR, ExecuteR> {
  readonly runId: RunId
  readonly sessionId: string
  readonly invocationRunId: string | undefined
  readonly authorizer: Authorizer<AuthorizationR>
  readonly toolState: Ref.Ref<ToolState>
  readonly handoffState: Ref.Ref<HandoffRunState> | undefined
  readonly activeAgentName: () => Effect.Effect<string>
  readonly executeApproved: (
    turn: number,
    call: AnyToolCall,
    request: Request,
    registry: Registry,
    blockedReason?: string,
  ) => Stream.Stream<Event, RunError, ExecuteR>
}

/** @internal Build the authorization half of one Agent tool execution boundary. */
export const make = <AuthorizationR, ExecuteR>(input: AuthorizationContext<AuthorizationR, ExecuteR>) =>
  function toolCallEvents(
    turn: number,
    toolCallBatch: Request["toolCallBatch"],
    toolCallIndex: number,
    call: AnyToolCall,
    messages: ReadonlyArray<Prompt.Message>,
    registry: Registry,
  ): Stream.Stream<Event, RunError, AuthorizationR | ExecuteR | DriverInterpreter> {
    const candidate = get(registry, call.name)
    if (candidate === undefined) {
      return Stream.fail(
        FrameworkFailure.make({
          stage: "authorization",
          tool: call.name,
          message: `Tool ${call.name} is not active for turn ${turn}`,
        }),
      )
    }
    const activeTools = registry.entries.map((entry) => Schema.decodeUnknownSync(Schema.String)(entry.tool.name))
    return Stream.unwrap(
      Effect.gen(function* () {
        const agentName = yield* input.activeAgentName()
        const hook = yield* applyToolCall({
          runId: input.runId,
          agentName,
          turn,
          tool: call.name,
          args: call.params,
          call,
        })
        const resolvedCall = hook.input.call
        const resolvedBatch: Request["toolCallBatch"] = {
          calls: toolCallBatch.calls.map((entry, index) => (index === toolCallIndex ? resolvedCall : entry)),
        }
        const resolvedRequest: Request = {
          call: resolvedCall,
          toolCallBatch: resolvedBatch,
          turn,
          toolCallIndex,
          agentName,
          sessionId: input.sessionId,
        }
        yield* updateToolBatch((checkpoint) => replaceCall(checkpoint, toolCallIndex, resolvedCall))
        if (hook.blocked !== undefined) {
          yield* updateToolBatch((checkpoint) =>
            updateCall(checkpoint, {
              callIndex: toolCallIndex,
              state: { _tag: "Ready", stage: "execution" },
            }),
          )
          return input.executeApproved(turn, resolvedCall, resolvedRequest, registry, hook.blocked)
        }
        const activatedSkills = [...(yield* Ref.get(input.toolState)).activatedSkillBodies.keys()]
        const approvalEvents = yield* Queue.bounded<Event, Cause.Done>(1)
        const authorizationRequest: Types.Mutable<AuthorizationRequest<RunError>> = {
          call: resolvedCall,
          agentName,
          turn,
          sessionId: input.sessionId,
          tool: candidate.tool,
          active: true,
          activeTools,
          activatedSkills,
          messages,
          onApprovalRequired: (approval) =>
            Queue.offer(approvalEvents, {
              _tag: "ApprovalRequested",
              turn,
              call: resolvedCall,
              request: approval,
            }).pipe(
              Effect.asVoid,
              Effect.andThen(
                applyApprovalRequest({
                  runId: input.runId,
                  agentName,
                  turn,
                  call: resolvedCall,
                  request: approval,
                }),
              ),
              Effect.map((approvalHook) =>
                approvalHook.blocked === undefined
                  ? undefined
                  : `ApprovalRequest hook blocked approval: ${approvalHook.blocked}`,
              ),
            ),
        }
        if (input.invocationRunId !== undefined) authorizationRequest.runId = input.invocationRunId
        if (hook.asked) authorizationRequest.forceApproval = true
        const authorization = input.authorizer.authorize(authorizationRequest).pipe(
          Effect.mapError((error) =>
            Schema.is(AuthorizationError)(error)
              ? AgentError.make({ message: error.message, turn, cause: error })
              : error,
          ),
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
                    ).pipe(Effect.map(() => input.executeApproved(turn, resolvedCall, resolvedRequest, registry))),
                  )
                case "Deny":
                  return Stream.fail(decision.error)
                case "Suspend":
                  return Stream.fromEffect(
                    Effect.gen(function* () {
                      const invocationPath =
                        input.handoffState === undefined
                          ? []
                          : (yield* Ref.get(input.handoffState)).path.map((frame) => frame.handoffId)
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
