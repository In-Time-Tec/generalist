import { Cause, Context, Effect, Layer, Schema } from "effect"
import type { Prompt, Response, Tool } from "effect/unstable/ai"
import type { ApprovalRequest } from "../agent/event.js"
import { RuleStore, evaluateWithRules, type RuleStoreError } from "../policy/permissions.js"

type Approvals = import("../policy/approvals.js").Service
type PendingApproval = import("../policy/approvals.js").Pending
type Permissions = import("../policy/permissions.js").Service

/** The common identity and context of one authorization attempt. */
export interface AccessRequest {
  readonly call: Response.ToolCallPart<string, unknown>
  readonly agentName: string
  readonly turn: number
  readonly sessionId?: string
}

/** A final authorization denial. */
export class PermissionDenied extends Schema.TaggedError<PermissionDenied>()("generalist/core/PermissionDenied", {
  message: Schema.String,
}) {}

/** Failure while producing a final authorization decision. */
export class AuthorizationError extends Schema.TaggedError<AuthorizationError>()("generalist/core/AuthorizationError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {}

/** The tool may execute. */
export interface Execute {
  readonly _tag: "Execute"
}
/** The tool must not execute. */
export interface Deny {
  readonly _tag: "Deny"
  readonly error: PermissionDenied
}
/** The run must suspend before the tool can execute. */
export interface Suspend {
  readonly _tag: "Suspend"
  readonly token: string
}
/** The one final decision for a tool execution attempt. */
export type ToolAuthorization = Execute | Deny | Suspend

/** Input to the final tool authorization boundary. */
export interface Request extends AccessRequest {
  readonly tool: Tool.Any | undefined
  readonly active: boolean
  readonly activeTools: ReadonlyArray<string>
  readonly activatedSkills: ReadonlyArray<string>
  readonly messages: ReadonlyArray<Prompt.Message>
  readonly onApprovalRequired: (request: ApprovalRequest) => Effect.Effect<void>
}

/** Final tool authorization boundary. */
export interface Authorizer<R = never> {
  readonly authorize: (request: Request) => Effect.Effect<ToolAuthorization, AuthorizationError, R>
}

/** Optional exact tool authorizer service for run-layer composition. */
export class ToolAuthorizer extends Context.Service<ToolAuthorizer, Authorizer<never>>()(
  "generalist/core/tools/tool-authorization/ToolAuthorizer",
) {}

/** Required services used by the linear authorization pass. */
export interface Options {
  readonly permissions: Permissions
  readonly approvals: Approvals
  readonly ruleStore: RuleStore["Service"]
}

const deny = (message: string): Deny => ({ _tag: "Deny", error: PermissionDenied.make({ message }) })
const authorizationError = (error: RuleStoreError): AuthorizationError =>
  AuthorizationError.make({
    message:
      error._tag === "generalist/core/PermissionError"
        ? error.message
        : `Invalid permission rule file at ${error.path}: ${error.issues}`,
    cause: error,
  })

const approvalRequired = (request: Request): Effect.Effect<boolean> => {
  const needsApproval = request.tool?.needsApproval
  if (needsApproval === undefined) return Effect.succeed(false)
  if (Schema.is(Schema.Boolean)(needsApproval)) return Effect.succeed(needsApproval)
  return Effect.suspend(() => {
    const result = needsApproval(request.call.params, {
      toolCallId: request.call.id,
      messages: request.messages,
    })
    return Effect.isEffect(result) ? result : Effect.succeed(result)
  }).pipe(Effect.catchCause((cause) => (Cause.hasInterrupts(cause) ? Effect.interrupt : Effect.succeed(true))))
}

const suspend = (request: Request, token: string): Suspend => ({
  _tag: "Suspend",
  token,
})

/** Build the authorizer from its three required policy seams. */
export const make = (options: Options): Authorizer => ({
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
      const pending: PendingApproval =
        request.sessionId === undefined
          ? {
              _tag: "Pending",
              token: decision._tag === "Ask" ? decision.token : `approval:${request.call.id}`,
              call: request.call,
              agentName: request.agentName,
              turn: request.turn,
            }
          : {
              _tag: "Pending",
              token: decision._tag === "Ask" ? decision.token : `approval:${request.call.id}`,
              call: request.call,
              agentName: request.agentName,
              turn: request.turn,
              sessionId: request.sessionId,
            }
      yield* request.onApprovalRequired({
        approvalId: pending.token,
        operation: request.call.id,
        capability: request.call.name,
        input: request.call.params,
      })
      const resolution = yield* options.approvals.resolve(pending)
      switch (resolution._tag) {
        case "Approved":
          if (resolution.remember !== undefined)
            yield* options.ruleStore.remember(resolution.remember).pipe(Effect.mapError(authorizationError))
          return { _tag: "Execute" }
        case "Denied":
          return deny(resolution.reason ?? "Tool call denied")
        case "Pending":
          return suspend(request, pending.token)
      }
    }),
})

/** Provide an exact authorizer for tests or run-layer composition. */
export const layerTest = (authorizer: Authorizer): Layer.Layer<ToolAuthorizer> =>
  Layer.succeed(ToolAuthorizer, ToolAuthorizer.of(authorizer))
