import { Cause, Context, Effect, Layer, Option, Schema } from "effect"
import { dual } from "effect/Function"
import { Prompt, Response, Tool } from "effect/unstable/ai"
import { AgentSuspended } from "./agent-event.js"
import { type EvaluationRequest, PermissionError, type RuleStoreInterface, matchRule } from "./permissions.js"

type Approvals = import("./approvals.js").Interface
type ApprovalDecision = import("./approvals.js").Decision
type Permissions = import("./permissions.js").Interface
type PermissionDecision = import("./permissions.js").Decision
type ExecutionRequest = import("./tool-executor.js").Request

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
export interface Request {
  readonly call: Response.ToolCallPart<string, unknown>
  readonly tool: Tool.Any | undefined
  readonly active: boolean
  readonly activeTools: ReadonlyArray<string>
  readonly activatedSkills: ReadonlyArray<string>
  readonly authorizationStage?: "permission" | "approval"
  readonly authorizationToken?: string
  readonly messages: ReadonlyArray<Prompt.Message>
  readonly execution: ExecutionRequest
  readonly onApprovalRequired: Effect.Effect<void>
}

/** @experimental Final tool authorization boundary. */
export interface ToolAuthorizer<R = never> {
  readonly authorize: (request: Request) => Effect.Effect<ToolAuthorization, AuthorizationError, R>
}

/** @experimental Optional tool authorizer service for run-layer composition. */
export class ToolAuthorizerService extends Context.Service<ToolAuthorizerService, ToolAuthorizer<never>>()(
  "@batonfx/core/tool-authorization/ToolAuthorizerService",
) {}

/** @experimental Compatibility inputs used to build one final authorizer. */
export interface Options {
  readonly permissions?: Permissions
  readonly approvals?: Approvals
  readonly ruleStore?: RuleStoreInterface
}

const deny = (message: string): Deny => ({
  _tag: "Deny",
  error: PermissionDenied.make({ message }),
})

const suspension = (request: Request, token: string, stage: "permission" | "approval"): Suspend => ({
  _tag: "Suspend",
  suspension: AgentSuspended.make({
    token,
    reason: "approval",
    authorization_stage: stage,
    tool_call_id: request.call.id,
    tool_name: request.call.name,
    tool_params: request.call.params,
    tool_call_batch: request.execution.toolCallBatch.calls,
    active_tools: request.activeTools,
    activated_skills: request.activatedSkills,
  }),
})

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

const evaluationRequest = (request: Request): EvaluationRequest => ({
  tool: request.call.name,
  params: request.call.params,
  agentName: request.execution.agentName,
  turn: request.execution.turn,
  toolCallId: request.call.id,
  sessionId: request.execution.sessionId,
})

const rememberedDecision = (
  request: Request,
  ruleStore: RuleStoreInterface | undefined,
): Effect.Effect<Option.Option<PermissionDecision>, AuthorizationError> =>
  ruleStore?.rules === undefined
    ? Effect.succeedNone
    : ruleStore.rules.pipe(
        Effect.map((rules): Option.Option<PermissionDecision> => {
          if (rules.length === 0) return Option.none()
          const matched = matchRule({ rules }, request.call.name, request.call.params)
          if (Option.isNone(matched)) return Option.none()
          switch (matched.value.level) {
            case "allow":
              return Option.some({ _tag: "Allow" })
            case "deny":
              return Option.some({
                _tag: "Deny",
                ...(matched.value.reason === undefined ? {} : { reason: matched.value.reason }),
              })
            case "ask":
              return Option.some({ _tag: "Ask", token: `permission:${request.call.id}` })
          }
        }),
        Effect.mapError(authorizationError),
      )

const resolveRequiredApproval = (
  request: Request,
  approvals: Approvals | undefined,
): Effect.Effect<ToolAuthorization> =>
  Effect.gen(function* () {
    yield* request.onApprovalRequired
    if (approvals === undefined) return deny("Approvals service is required for approval-gated tools")
    const decision: ApprovalDecision = yield* approvals.check(request.execution)
    switch (decision._tag) {
      case "Approved":
        return { _tag: "Execute" }
      case "Denied":
        return deny(decision.reason ?? "Tool call denied")
      case "Pending":
        return suspension(request, decision.token, "approval")
    }
  })

const finalApproval = (request: Request, approvals: Approvals | undefined): Effect.Effect<ToolAuthorization> =>
  approvalRequired(request).pipe(
    Effect.flatMap((required) => {
      if (!required) return Effect.succeed({ _tag: "Execute" } as const)
      return resolveRequiredApproval(request, approvals)
    }),
  )

/** @experimental Build the default authorizer from compatibility services. */
export const make = (options: Options = {}): ToolAuthorizer => ({
  authorize: (request) =>
    Effect.gen(function* () {
      if (!request.active || request.tool === undefined) {
        return deny(`Tool ${request.call.name} is not active for turn ${request.execution.turn}`)
      }
      if (request.authorizationStage === "approval") {
        return yield* resolveRequiredApproval(request, options.approvals)
      }
      const remembered = yield* rememberedDecision(request, options.ruleStore)
      if (Option.isSome(remembered) && remembered.value._tag === "Deny") {
        return deny(remembered.value.reason ?? "Permission denied")
      }
      if (request.authorizationStage === "permission") {
        const token = request.authorizationToken ?? `permission:${request.call.id}`
        if (options.permissions !== undefined) {
          const current = yield* options.permissions
            .evaluate(evaluationRequest(request))
            .pipe(Effect.mapError(authorizationError))
          if (current._tag === "Deny") return deny(current.reason ?? "Permission denied")
        }
        yield* request.onApprovalRequired
        if (options.permissions === undefined) return suspension(request, token, "permission")
        const answer = yield* options.permissions
          .await({
            token,
            tool: request.call.name,
            params: request.call.params,
            agentName: request.execution.agentName,
            turn: request.execution.turn,
            toolCallId: request.call.id,
          })
          .pipe(Effect.mapError(authorizationError))
        if (Option.isNone(answer)) return suspension(request, token, "permission")
        if (answer.value._tag === "Denied") return deny(answer.value.reason ?? "Permission denied")
        if (answer.value._tag === "Always" && options.ruleStore !== undefined) {
          yield* options.ruleStore
            .remember({ pattern: request.call.name, level: "allow" })
            .pipe(Effect.mapError(authorizationError))
        }
        return yield* finalApproval(request, options.approvals)
      }
      if (options.permissions === undefined) {
        if (Option.isSome(remembered) && remembered.value._tag === "Ask") {
          yield* request.onApprovalRequired
          return suspension(request, remembered.value.token, "permission")
        }
        return yield* finalApproval(request, options.approvals)
      }
      const permissions = options.permissions
      const current = yield* permissions.evaluate(evaluationRequest(request)).pipe(Effect.mapError(authorizationError))
      if (current._tag === "Deny") return deny(current.reason ?? "Permission denied")
      if (current._tag !== "Ask" || (Option.isSome(remembered) && remembered.value._tag === "Allow")) {
        return yield* finalApproval(request, options.approvals)
      }
      const pending = {
        token: current.token,
        tool: request.call.name,
        params: request.call.params,
        agentName: request.execution.agentName,
        turn: request.execution.turn,
        toolCallId: request.call.id,
      }
      yield* request.onApprovalRequired
      const answer = yield* permissions.await(pending).pipe(Effect.mapError(authorizationError))
      if (Option.isNone(answer)) return suspension(request, current.token, "permission")
      switch (answer.value._tag) {
        case "Denied":
          return deny(answer.value.reason ?? "Permission denied")
        case "Always":
          if (options.ruleStore !== undefined) {
            yield* options.ruleStore
              .remember({ pattern: request.call.name, level: "allow" })
              .pipe(Effect.mapError(authorizationError))
          }
          return yield* finalApproval(request, options.approvals)
        case "Approved":
          return yield* finalApproval(request, options.approvals)
      }
    }),
})

/** @experimental Adapt an existing Permissions implementation into final authorization. */
export const fromPermissions: {
  (permissions: Permissions): ToolAuthorizer
  (options: Omit<Options, "permissions">): (permissions: Permissions) => ToolAuthorizer
  (permissions: Permissions, options: Omit<Options, "permissions">): ToolAuthorizer
} = dual(
  (args) => args.length === 2 || (args.length === 1 && "evaluate" in args[0]),
  (permissions: Permissions, options: Omit<Options, "permissions"> = {}): ToolAuthorizer =>
    make({ ...options, permissions }),
)

/** @experimental Adapt an existing Approvals implementation into final authorization. */
export const fromApprovals = (approvals: Approvals): ToolAuthorizer => make({ approvals })

/** @experimental Provide an exact authorizer for tests or run-layer composition. */
export const testLayer = (authorizer: ToolAuthorizer): Layer.Layer<ToolAuthorizerService> =>
  Layer.succeed(ToolAuthorizerService, ToolAuthorizerService.of(authorizer))
