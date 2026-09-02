import { ApprovalId as CoreApprovalId, ApprovalRequest } from "../../core/agent/event.js"
import { Effect, Function, Schema } from "effect"
import { ActionableTaggedError, errorHint } from "../../core/error-hint.js"
import type { Approved, Denied } from "../../core/policy/approvals.js"
import { RuleStore, type RuleStoreError } from "../../core/policy/permissions.js"
import { IllegalOperatorAction } from "../errors.js"
import { Runtime, type RespondApprovalError, type Service as RuntimeService } from "../service.js"

/** Stable identity for one approval request. */
export const ApprovalId = CoreApprovalId
export type ApprovalId = typeof ApprovalId.Type

/** The exact operation and capability awaiting authorization. */
export const Request = ApprovalRequest
export type Request = typeof Request.Type

/** One terminal response to an approval request. */
export const Decision = Schema.Union([
  Schema.TaggedStruct("Approved", {}),
  Schema.TaggedStruct("Denied", { reason: Schema.optionalKey(Schema.String) }),
])
export type Decision = typeof Decision.Type

/** Respond to exactly one stable approval request. */
export const RespondInput = Schema.Struct({
  runId: Schema.String,
  approvalId: ApprovalId,
  decision: Decision,
  operator: Schema.optionalKey(Schema.String),
})
export type RespondInput = typeof RespondInput.Type

/** Approve exactly one pending authorization request. */
export const ApproveInput = Schema.Struct({ runId: Schema.String, approvalId: ApprovalId })
export type ApproveInput = typeof ApproveInput.Type

/** Deny exactly one pending authorization request. */
export const DenyInput = Schema.Struct({
  runId: Schema.String,
  approvalId: ApprovalId,
  reason: Schema.optionalKey(Schema.String),
})
export type DenyInput = typeof DenyInput.Type

/** Approve through the active Runtime service. */
export const approve = (input: ApproveInput): Effect.Effect<void, RespondApprovalError, Runtime> =>
  Runtime.use((runtime) => runtime.respondApproval({ ...input, decision: { _tag: "Approved" } }))

/** Deny through the active Runtime service. */
export const deny = (input: DenyInput): Effect.Effect<void, RespondApprovalError, Runtime> =>
  Runtime.use((runtime) =>
    runtime.respondApproval({
      runId: input.runId,
      approvalId: input.approvalId,
      decision: Object.assign(
        { _tag: "Denied" as const },
        input.reason === undefined ? undefined : { reason: input.reason },
      ),
    }),
  )

/** A Runtime approval token was malformed or did not carry a Run identity. */
export class ApprovalTokenInvalid extends ActionableTaggedError<ApprovalTokenInvalid>()(
  "generalist/approvals/ApprovalTokenInvalid",
  {
    token: Schema.String,
    message: Schema.String,
    hint: errorHint("Resolve the exact token emitted by Approvals.layerDurable."),
  },
) {}

const invalidToken = (token: string): ApprovalTokenInvalid =>
  ApprovalTokenInvalid.make({
    token,
    message: "Approval token does not contain a durable Runtime Run identity",
  })

const runIdFromToken = (token: string): Effect.Effect<string, ApprovalTokenInvalid> => {
  const prefix = "runtime-approval:"
  if (!token.startsWith(prefix)) return Effect.fail(invalidToken(token))
  const separator = token.indexOf(":", prefix.length)
  if (separator === -1) return Effect.fail(invalidToken(token))
  return Effect.try({
    try: () => decodeURIComponent(token.slice(prefix.length, separator)),
    catch: () => invalidToken(token),
  }).pipe(
    Effect.filterOrFail(
      (runId) => runId.length > 0,
      () => invalidToken(token),
    ),
  )
}

export type ResolveError = ApprovalTokenInvalid | RespondApprovalError | RuleStoreError | IllegalOperatorAction

export interface ResolveOptions {
  /** Operator identity journaled with the decision; also requires the token to be an open obligation. */
  readonly operator: string
}

/** @internal Resolve one exact durable approval token through the supplied Runtime. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- internal seam for a Runtime resolving through itself.
export const resolveWith = (
  runtime: RuntimeService,
  token: string,
  decision: Approved | Denied,
  options?: ResolveOptions,
): Effect.Effect<void, ResolveError, RuleStore> =>
  Effect.gen(function* () {
    const runId = yield* runIdFromToken(token)
    const operator = options?.operator
    if (operator !== undefined) {
      const explanation = yield* runtime.operator.explain(runId)
      const legal = explanation.obligations.some(
        (obligation) => obligation._tag === "AwaitApproval" && obligation.token === token,
      )
      if (!legal) {
        return yield* IllegalOperatorAction.make({ runId, decision: explanation.decision, action: "resolveApproval" })
      }
    }
    if (decision._tag === "Approved" && decision.remember !== undefined) {
      const rules = yield* RuleStore
      yield* rules.remember(decision.remember)
    }
    const identity = operator === undefined ? undefined : { operator }
    if (decision._tag === "Approved") {
      return yield* runtime.respondApproval({ runId, approvalId: token, decision: { _tag: "Approved" }, ...identity })
    }
    return yield* runtime.respondApproval({
      runId,
      approvalId: token,
      decision: decision.reason === undefined ? { _tag: "Denied" } : { _tag: "Denied", reason: decision.reason },
      ...identity,
    })
  })

type ResolveEffect = Effect.Effect<void, ResolveError, Runtime | RuleStore>

/** Resolve one exact durable approval token through the active Runtime. */
export const resolve: {
  (token: string, decision: Approved | Denied, options?: ResolveOptions): ResolveEffect
  (decision: Approved | Denied, options?: ResolveOptions): (token: string) => ResolveEffect
} = Function.dual(
  (args) => Schema.is(Schema.String)(args[0]),
  (token: string, decision: Approved | Denied, options?: ResolveOptions): ResolveEffect =>
    Runtime.use((runtime) => resolveWith(runtime, token, decision, options)),
)
