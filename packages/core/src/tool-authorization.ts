import { Cause, Context, Effect, Layer, Schema } from "effect"
import { type Prompt, type Response, type Tool } from "effect/unstable/ai"
import { AgentSuspended } from "./agent-event.js"
import { PermissionError, evaluateWithRules, type RuleStoreInterface } from "./permissions.js"

type Approvals = import("./approvals.js").Interface
type Permissions = import("./permissions.js").Interface

/** @experimental The common identity and context of one authorization attempt. */
export interface AccessRequest {
  readonly call: Response.ToolCallPart<string, unknown>
  readonly agentName: string
  readonly turn: number
  readonly sessionId?: string
}

/** @experimental A final authorization denial. */
export class PermissionDenied extends Schema.TaggedErrorClass<PermissionDenied>()("@batonfx/core/PermissionDenied", {
  message: Schema.String,
}) {}

/** @experimental Failure while producing a final authorization decision. */
export class AuthorizationError extends Schema.TaggedErrorClass<AuthorizationError>()(
  "@batonfx/core/AuthorizationError",
  { message: Schema.String, cause: Schema.optional(Schema.Defect()) },
) {}

/** @experimental The tool may execute. */
export interface Execute {
  readonly _tag: "Execute"
}
/** @experimental The tool must not execute. */
export interface Deny {
  readonly _tag: "Deny"
  readonly error: PermissionDenied
}
/** @experimental The run must suspend before the tool can execute. */
export interface Suspend {
  readonly _tag: "Suspend"
  readonly suspension: AgentSuspended
}
/** @experimental The one final decision for a tool execution attempt. */
export type ToolAuthorization = Execute | Deny | Suspend

/** @experimental Input to the final tool authorization boundary. */
export interface Request extends AccessRequest {
  readonly tool: Tool.Any | undefined
  readonly active: boolean
  readonly activeTools: ReadonlyArray<string>
  readonly activatedSkills: ReadonlyArray<string>
  readonly messages: ReadonlyArray<Prompt.Message>
  readonly onApprovalRequired: Effect.Effect<void>
}

/** @experimental Final tool authorization boundary. */
export interface ToolAuthorizer<R = never> {
  readonly authorize: (request: Request) => Effect.Effect<ToolAuthorization, AuthorizationError, R>
}

/** @experimental Optional exact tool authorizer service for run-layer composition. */
export class ToolAuthorizerService extends Context.Service<ToolAuthorizerService, ToolAuthorizer<never>>()(
  "@batonfx/core/ToolAuthorizerService",
) {}

/** @experimental Required services used by the linear authorization pass. */
export interface Options {
  readonly permissions: Permissions
  readonly approvals: Approvals
  readonly ruleStore: RuleStoreInterface
}

const deny = (message: string): Deny => ({ _tag: "Deny", error: PermissionDenied.make({ message }) })
const authorizationError = (error: PermissionError): AuthorizationError =>
  AuthorizationError.make({ message: error.message, cause: error })

const approvalRequired = (request: Request): Effect.Effect<boolean> => {
  const needsApproval = request.tool?.needsApproval
  if (needsApproval === undefined) return Effect.succeed(false)
  if (typeof needsApproval === "boolean") return Effect.succeed(needsApproval)
  return Effect.suspend(() => {
    const result = needsApproval(request.call.params as never, {
      toolCallId: request.call.id,
      messages: request.messages,
    })
    return Effect.isEffect(result) ? result : Effect.succeed(result)
  }).pipe(Effect.catchCause((cause) => (Cause.hasInterrupts(cause) ? Effect.interrupt : Effect.succeed(true))))
}

const suspend = (request: Request, token: string): Suspend => ({
  _tag: "Suspend",
  suspension: AgentSuspended.make({
    token,
    reason: "approval",
    tool_call_id: request.call.id,
    tool_name: request.call.name,
    tool_params: request.call.params,
    tool_call_batch: [request.call],
    active_tools: request.activeTools,
    activated_skills: request.activatedSkills,
  }),
})

/** @experimental Build the authorizer from its three required policy seams. */
export const make = (options: Options): ToolAuthorizer => ({
  authorize: (request) =>
    Effect.gen(function* () {
      if (!request.active || request.tool === undefined)
        return deny(`Tool ${request.call.name} is not active for turn ${request.turn}`)
      const decision = yield* evaluateWithRules(options.permissions, options.ruleStore, request).pipe(
        Effect.mapError(authorizationError),
      )
      if (decision._tag === "Deny") return deny(decision.reason ?? "Permission denied")
      const required = decision._tag === "Ask" || (yield* approvalRequired(request))
      if (!required) return { _tag: "Execute" }
      yield* request.onApprovalRequired
      const resolution = yield* options.approvals.resolve({
        _tag: "Pending",
        token: decision._tag === "Ask" ? decision.token : `approval:${request.call.id}`,
        call: request.call,
        agentName: request.agentName,
        turn: request.turn,
        ...(request.sessionId === undefined ? {} : { sessionId: request.sessionId }),
      })
      switch (resolution._tag) {
        case "Approved":
          if (resolution.remember !== undefined)
            yield* options.ruleStore.remember(resolution.remember).pipe(Effect.mapError(authorizationError))
          return { _tag: "Execute" }
        case "Denied":
          return deny(resolution.reason ?? "Tool call denied")
        case "Pending":
          return suspend(request, resolution.token)
      }
    }),
})

/** @experimental Provide an exact authorizer for tests or run-layer composition. */
export const layerTest = (authorizer: ToolAuthorizer): Layer.Layer<ToolAuthorizerService> =>
  Layer.succeed(ToolAuthorizerService, ToolAuthorizerService.of(authorizer))
