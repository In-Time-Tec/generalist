import { Schema } from "effect"
import { AgentEvent, RunBudget } from "tenetkit"
import { Address } from "./address.js"
import { Cursor } from "./cursor.js"
import { ExecutableRef } from "./executable-manifest.js"
import { TreeCursor } from "./tree-cursor.js"

export class AddressNotFound extends Schema.TaggedErrorClass<AddressNotFound>()("tenetkit/runtime/AddressNotFound", {
  address: Address,
}) {}

export class ExecutablePinMissing extends Schema.TaggedErrorClass<ExecutablePinMissing>()(
  "tenetkit/runtime/ExecutablePinMissing",
  { runId: Schema.String, ref: ExecutableRef },
) {}

export class ExecutableRegistrationInvalid extends Schema.TaggedErrorClass<ExecutableRegistrationInvalid>()(
  "tenetkit/runtime/ExecutableRegistrationInvalid",
  { message: Schema.String },
) {}

export class ExecutableRegistrationConflict extends Schema.TaggedErrorClass<ExecutableRegistrationConflict>()(
  "tenetkit/runtime/ExecutableRegistrationConflict",
  { pin: Schema.String },
) {}

export class ExecutableRegistrationMissing extends Schema.TaggedErrorClass<ExecutableRegistrationMissing>()(
  "tenetkit/runtime/ExecutableRegistrationMissing",
  { pin: Schema.String },
) {}

export class ExecutableIdentityMismatch extends Schema.TaggedErrorClass<ExecutableIdentityMismatch>()(
  "tenetkit/runtime/ExecutableIdentityMismatch",
  {
    runId: Schema.String,
    expectedRef: ExecutableRef,
    actualRef: ExecutableRef,
  },
) {}

/** @experimental The structured Agent failures a durable terminal event preserves verbatim. */
export type StructuredAgentFailure = RunBudget.RunBudgetExhausted | AgentEvent.ResumeMismatch

export const StructuredAgentFailure: Schema.Codec<
  StructuredAgentFailure,
  typeof RunBudget.RunBudgetExhausted.Encoded | typeof AgentEvent.ResumeMismatch.Encoded
> = Schema.Union([RunBudget.RunBudgetExhausted, AgentEvent.ResumeMismatch])

export class AgentExecutionFailure extends Schema.TaggedErrorClass<AgentExecutionFailure>()(
  "tenetkit/runtime/AgentExecutionFailure",
  {
    message: Schema.String,
    failure: Schema.optionalKey(StructuredAgentFailure),
    cause: Schema.optionalKey(Schema.Defect()),
  },
) {}

/** @experimental Guarantee an actionable non-empty terminal message. */
export const failureMessage = (message: string): string => {
  const trimmed = message.trim()
  return trimmed.length === 0 ? "Agent execution failed" : trimmed
}

/** @experimental Internal canonical failure for resolver-owned compaction option drift. */
export const compactionOptionsMismatch = AgentExecutionFailure.make({
  message: "Resolved compaction options do not match Agent manifest",
})

export const undecodableSuspension = AgentExecutionFailure.make({
  message: "Persisted suspension could not be decoded",
})

export class IdempotencyConflict extends Schema.TaggedErrorClass<IdempotencyConflict>()(
  "tenetkit/runtime/IdempotencyConflict",
  {
    address: Address,
    sessionId: Schema.String,
    idempotencyKey: Schema.String,
    existingRunId: Schema.String,
  },
) {}

export class RunIdConflict extends Schema.TaggedErrorClass<RunIdConflict>()("tenetkit/runtime/RunIdConflict", {
  runId: Schema.String,
  existingRunId: Schema.String,
}) {}

export class RunNotFound extends Schema.TaggedErrorClass<RunNotFound>()("tenetkit/runtime/RunNotFound", {
  runId: Schema.String,
}) {}

export class RunTerminal extends Schema.TaggedErrorClass<RunTerminal>()("tenetkit/runtime/RunTerminal", {
  runId: Schema.String,
  status: Schema.Literals(["succeeded", "failed", "cancelled"]),
}) {}

export class ChildSelectionMissing extends Schema.TaggedErrorClass<ChildSelectionMissing>()(
  "tenetkit/runtime/ChildSelectionMissing",
  { parentRunId: Schema.String, selection: Schema.String },
) {}

export class ChildDepthExceeded extends Schema.TaggedErrorClass<ChildDepthExceeded>()(
  "tenetkit/runtime/ChildDepthExceeded",
  {
    parentRunId: Schema.String,
    rootRunId: Schema.String,
    parentDepth: Schema.Int,
    depth: Schema.Int,
    requested: Schema.Int,
    current: Schema.Int,
    limit: Schema.Int,
  },
) {}

export class ChildLimitExceeded extends Schema.TaggedErrorClass<ChildLimitExceeded>()(
  "tenetkit/runtime/ChildLimitExceeded",
  {
    parentRunId: Schema.String,
    rootRunId: Schema.String,
    parentDepth: Schema.Int,
    depth: Schema.Int,
    requested: Schema.Int,
    current: Schema.Int,
    limit: Schema.Int,
  },
) {}

export class TreePolicyInvalid extends Schema.TaggedErrorClass<TreePolicyInvalid>()(
  "tenetkit/runtime/TreePolicyInvalid",
  { message: Schema.String },
) {}

export class StartInvalid extends Schema.TaggedErrorClass<StartInvalid>()("tenetkit/runtime/StartInvalid", {
  message: Schema.String,
}) {}

export class SteeringConflict extends Schema.TaggedErrorClass<SteeringConflict>()("tenetkit/runtime/SteeringConflict", {
  runId: Schema.String,
  idempotencyKey: Schema.String,
}) {}

export class WaitNotOpen extends Schema.TaggedErrorClass<WaitNotOpen>()("tenetkit/runtime/WaitNotOpen", {
  runId: Schema.String,
  waitId: Schema.String,
}) {}

export class ResponseConflict extends Schema.TaggedErrorClass<ResponseConflict>()("tenetkit/runtime/ResponseConflict", {
  runId: Schema.String,
  waitId: Schema.String,
}) {}

/** @experimental The approval no longer names an unresolved request. */
export class ApprovalStale extends Schema.TaggedErrorClass<ApprovalStale>()("tenetkit/runtime/ApprovalStale", {
  runId: Schema.String,
  approvalId: Schema.String,
}) {}

/** @experimental The response conflicts with the authoritative approval identity or decision. */
export class ApprovalMismatch extends Schema.TaggedErrorClass<ApprovalMismatch>()("tenetkit/runtime/ApprovalMismatch", {
  runId: Schema.String,
  approvalId: Schema.String,
  mismatch: Schema.Literals(["approval-id", "wait-kind", "decision"]),
  expectedApprovalId: Schema.optionalKey(Schema.String),
}) {}

export class OperationResolutionConflict extends Schema.TaggedErrorClass<OperationResolutionConflict>()(
  "tenetkit/runtime/OperationResolutionConflict",
  { runId: Schema.String, operationId: Schema.String, idempotencyKey: Schema.String },
) {}

export class CursorExpired extends Schema.TaggedErrorClass<CursorExpired>()("tenetkit/runtime/CursorExpired", {
  runId: Schema.String,
  cursor: Cursor,
  earliestSequence: Schema.Int,
}) {}

export class TreeCursorInvalid extends Schema.TaggedErrorClass<TreeCursorInvalid>()(
  "tenetkit/runtime/TreeCursorInvalid",
  { rootRunId: Schema.String, cursor: TreeCursor, message: Schema.String },
) {}

export class TreeCursorExpired extends Schema.TaggedErrorClass<TreeCursorExpired>()(
  "tenetkit/runtime/TreeCursorExpired",
  { rootRunId: Schema.String, cursor: TreeCursor, earliestCursor: TreeCursor },
) {}

export class SubscriberLagged extends Schema.TaggedErrorClass<SubscriberLagged>()("tenetkit/runtime/SubscriberLagged", {
  runId: Schema.String,
  lastDeliveredSequence: Schema.Int,
}) {}

export class RuntimeUnavailable extends Schema.TaggedErrorClass<RuntimeUnavailable>()(
  "tenetkit/runtime/RuntimeUnavailable",
  {
    message: Schema.String,
  },
) {}

export class SessionEntryNotFound extends Schema.TaggedErrorClass<SessionEntryNotFound>()(
  "tenetkit/runtime/SessionEntryNotFound",
  { sessionId: Schema.String, entryId: Schema.String },
) {}

export class SessionEntryCorrupt extends Schema.TaggedErrorClass<SessionEntryCorrupt>()(
  "tenetkit/runtime/SessionEntryCorrupt",
  { sessionId: Schema.String, entryId: Schema.String, message: Schema.String },
) {}

export class FanOutConflict extends Schema.TaggedErrorClass<FanOutConflict>()("tenetkit/runtime/FanOutConflict", {
  parentRunId: Schema.String,
  idempotencyKey: Schema.String,
  existingFanOutId: Schema.String,
}) {}

export class FanOutNotFound extends Schema.TaggedErrorClass<FanOutNotFound>()("tenetkit/runtime/FanOutNotFound", {
  fanOutId: Schema.String,
}) {}

export class FanOutInvalid extends Schema.TaggedErrorClass<FanOutInvalid>()("tenetkit/runtime/FanOutInvalid", {
  message: Schema.String,
}) {}

export class FanOutRemainderUnsupported extends Schema.TaggedErrorClass<FanOutRemainderUnsupported>()(
  "tenetkit/runtime/FanOutRemainderUnsupported",
  { remainder: Schema.Literal("terminate"), durability: Schema.Literals(["ephemeral", "durable"]) },
) {}

export class MessagingUnauthorized extends Schema.TaggedErrorClass<MessagingUnauthorized>()(
  "tenetkit/runtime/MessagingUnauthorized",
  {
    from: Address,
    to: Address,
    reason: Schema.Literals(["unrelated", "cross-session", "policy"]),
  },
) {}

export class MailboxFull extends Schema.TaggedErrorClass<MailboxFull>()("tenetkit/runtime/MailboxFull", {
  to: Address,
  dimension: Schema.Literals(["pending", "bytes"]),
  limit: Schema.Int,
}) {}

export class MailboxRateLimited extends Schema.TaggedErrorClass<MailboxRateLimited>()(
  "tenetkit/runtime/MailboxRateLimited",
  { to: Address, limit: Schema.Int, windowMillis: Schema.Int },
) {}

export class MessageConflict extends Schema.TaggedErrorClass<MessageConflict>()("tenetkit/runtime/MessageConflict", {
  to: Address,
  messageId: Schema.String,
  idempotencyKey: Schema.String,
}) {}

export class AgentNameConflict extends Schema.TaggedErrorClass<AgentNameConflict>()(
  "tenetkit/runtime/AgentNameConflict",
  { scope: Schema.String, name: Schema.String, existingRunId: Schema.String },
) {}
