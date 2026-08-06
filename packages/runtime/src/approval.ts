import { AgentEvent } from "@batonfx/core"
import { Effect, Schema } from "effect"
import { Runtime } from "./runtime.js"

/** @experimental Stable identity for one approval request. */
export const ApprovalId = AgentEvent.ApprovalId
export type ApprovalId = typeof ApprovalId.Type

/** @experimental The exact operation and capability awaiting authorization. */
export const Request = AgentEvent.ApprovalRequest
export type Request = typeof Request.Type

/** @experimental One terminal response to an approval request. */
export const Decision = Schema.Union([
  Schema.TaggedStruct("Approved", {}),
  Schema.TaggedStruct("Denied", { reason: Schema.optionalKey(Schema.String) }),
])
export type Decision = typeof Decision.Type

/** @experimental Respond to exactly one stable approval request. */
export const RespondInput = Schema.Struct({
  runId: Schema.String,
  approvalId: ApprovalId,
  decision: Decision,
})
export type RespondInput = typeof RespondInput.Type

/** @experimental Approve exactly one pending authorization request. */
export const ApproveInput = Schema.Struct({ runId: Schema.String, approvalId: ApprovalId })
export type ApproveInput = typeof ApproveInput.Type

/** @experimental Deny exactly one pending authorization request. */
export const DenyInput = Schema.Struct({
  runId: Schema.String,
  approvalId: ApprovalId,
  reason: Schema.optionalKey(Schema.String),
})
export type DenyInput = typeof DenyInput.Type

/** @experimental Approve through the active Runtime service. */
export const approve = (
  input: ApproveInput,
): Effect.Effect<void, import("./runtime.js").RespondApprovalError, Runtime> =>
  Runtime.use((runtime) => runtime.respondApproval({ ...input, decision: { _tag: "Approved" } }))

/** @experimental Deny through the active Runtime service. */
export const deny = (input: DenyInput): Effect.Effect<void, import("./runtime.js").RespondApprovalError, Runtime> =>
  Runtime.use((runtime) =>
    runtime.respondApproval({
      runId: input.runId,
      approvalId: input.approvalId,
      decision: { _tag: "Denied", ...(input.reason === undefined ? {} : { reason: input.reason }) },
    }),
  )
