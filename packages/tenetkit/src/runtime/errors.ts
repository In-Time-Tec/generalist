import { Schema } from "effect"
import { AgentEvent } from "../core/index.js"
import { RunBudget } from "../core/durable/public/run-budget.js"
import { Address } from "./address.js"
import { Cursor } from "./cursor.js"
import { ExecutableRef } from "./executable/manifest.js"
import { TreeCursor, TreeCursorInvalid, TreeCursorRootMismatch } from "./tree/cursor.js"

export { TreeCursorInvalid, TreeCursorRootMismatch }

export class AddressNotFound extends Schema.TaggedError<AddressNotFound>()("tenetkit/runtime/AddressNotFound", {
  address: Address,
}) {}

export class ExecutablePinMissing extends Schema.TaggedError<ExecutablePinMissing>()(
  "tenetkit/runtime/ExecutablePinMissing",
  { runId: Schema.String, ref: ExecutableRef },
) {}

export class ExecutableRegistrationInvalid extends Schema.TaggedError<ExecutableRegistrationInvalid>()(
  "tenetkit/runtime/ExecutableRegistrationInvalid",
  { message: Schema.String },
) {}

export class ExecutableRegistrationConflict extends Schema.TaggedError<ExecutableRegistrationConflict>()(
  "tenetkit/runtime/ExecutableRegistrationConflict",
  { pin: Schema.String },
) {}

export class ExecutableRegistrationMissing extends Schema.TaggedError<ExecutableRegistrationMissing>()(
  "tenetkit/runtime/ExecutableRegistrationMissing",
  { pin: Schema.String },
) {}

export class ExecutableIdentityMismatch extends Schema.TaggedError<ExecutableIdentityMismatch>()(
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

export class AgentExecutionFailure extends Schema.TaggedError<AgentExecutionFailure>()(
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

export class IdempotencyConflict extends Schema.TaggedError<IdempotencyConflict>()(
  "tenetkit/runtime/IdempotencyConflict",
  {
    address: Address,
    sessionId: Schema.String,
    idempotencyKey: Schema.String,
    existingRunId: Schema.String,
  },
) {}

export class RunIdConflict extends Schema.TaggedError<RunIdConflict>()("tenetkit/runtime/RunIdConflict", {
  runId: Schema.String,
  existingRunId: Schema.String,
}) {}

export class RunNotFound extends Schema.TaggedError<RunNotFound>()("tenetkit/runtime/RunNotFound", {
  runId: Schema.String,
}) {}

export class RunTerminal extends Schema.TaggedError<RunTerminal>()("tenetkit/runtime/RunTerminal", {
  runId: Schema.String,
  status: Schema.Literals(["succeeded", "failed", "cancelled"]),
}) {}

export class ChildSelectionMissing extends Schema.TaggedError<ChildSelectionMissing>()(
  "tenetkit/runtime/ChildSelectionMissing",
  { parentRunId: Schema.String, selection: Schema.String },
) {}

export class ChildDepthExceeded extends Schema.TaggedError<ChildDepthExceeded>()(
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

export class ChildLimitExceeded extends Schema.TaggedError<ChildLimitExceeded>()(
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

export class TreePolicyInvalid extends Schema.TaggedError<TreePolicyInvalid>()("tenetkit/runtime/TreePolicyInvalid", {
  message: Schema.String,
}) {}

export class StartInvalid extends Schema.TaggedError<StartInvalid>()("tenetkit/runtime/StartInvalid", {
  message: Schema.String,
}) {}

export class SteeringConflict extends Schema.TaggedError<SteeringConflict>()("tenetkit/runtime/SteeringConflict", {
  runId: Schema.String,
  idempotencyKey: Schema.String,
}) {}

export class WaitNotOpen extends Schema.TaggedError<WaitNotOpen>()("tenetkit/runtime/WaitNotOpen", {
  runId: Schema.String,
  waitId: Schema.String,
}) {}

export class ResponseConflict extends Schema.TaggedError<ResponseConflict>()("tenetkit/runtime/ResponseConflict", {
  runId: Schema.String,
  waitId: Schema.String,
}) {}

/** @experimental The approval no longer names an unresolved request. */
export class ApprovalStale extends Schema.TaggedError<ApprovalStale>()("tenetkit/runtime/ApprovalStale", {
  runId: Schema.String,
  approvalId: Schema.String,
}) {}

/** @experimental The response conflicts with the authoritative approval identity or decision. */
export class ApprovalMismatch extends Schema.TaggedError<ApprovalMismatch>()("tenetkit/runtime/ApprovalMismatch", {
  runId: Schema.String,
  approvalId: Schema.String,
  mismatch: Schema.Literals(["approval-id", "wait-kind", "decision"]),
  expectedApprovalId: Schema.optionalKey(Schema.String),
}) {}

export class OperationResolutionConflict extends Schema.TaggedError<OperationResolutionConflict>()(
  "tenetkit/runtime/OperationResolutionConflict",
  { runId: Schema.String, operationId: Schema.String, idempotencyKey: Schema.String },
) {}

export class CursorExpired extends Schema.TaggedError<CursorExpired>()("tenetkit/runtime/CursorExpired", {
  runId: Schema.String,
  cursor: Cursor,
  earliestSequence: Schema.Int,
}) {}

export class TreeCursorExpired extends Schema.TaggedError<TreeCursorExpired>()("tenetkit/runtime/TreeCursorExpired", {
  rootRunId: Schema.String,
  cursor: TreeCursor,
  earliestCursor: TreeCursor,
}) {}

/** @experimental The cursor names a position that has not committed. */
export class TreeCursorFuture extends Schema.TaggedError<TreeCursorFuture>()("tenetkit/runtime/TreeCursorFuture", {
  rootRunId: Schema.String,
  cursor: TreeCursor,
  latestCursor: TreeCursor,
}) {}

/** @experimental A replay request falls outside the fixed page-size contract. */
export class TreeReplayLimitInvalid extends Schema.TaggedError<TreeReplayLimitInvalid>()(
  "tenetkit/runtime/TreeReplayLimitInvalid",
  {
    received: Schema.String,
    minimum: Schema.Int,
    maximum: Schema.Int,
  },
) {}

export class SubscriberLagged extends Schema.TaggedError<SubscriberLagged>()("tenetkit/runtime/SubscriberLagged", {
  runId: Schema.String,
  lastDeliveredSequence: Schema.Int,
}) {}

export class RuntimeUnavailable extends Schema.TaggedError<RuntimeUnavailable>()(
  "tenetkit/runtime/RuntimeUnavailable",
  {
    message: Schema.String,
  },
) {}

export class SessionEntryNotFound extends Schema.TaggedError<SessionEntryNotFound>()(
  "tenetkit/runtime/SessionEntryNotFound",
  { sessionId: Schema.String, entryId: Schema.String },
) {}

export class SessionEntryCorrupt extends Schema.TaggedError<SessionEntryCorrupt>()(
  "tenetkit/runtime/SessionEntryCorrupt",
  { sessionId: Schema.String, entryId: Schema.String, message: Schema.String },
) {}

export class FanOutConflict extends Schema.TaggedError<FanOutConflict>()("tenetkit/runtime/FanOutConflict", {
  parentRunId: Schema.String,
  idempotencyKey: Schema.String,
  existingFanOutId: Schema.String,
}) {}

export class FanOutNotFound extends Schema.TaggedError<FanOutNotFound>()("tenetkit/runtime/FanOutNotFound", {
  fanOutId: Schema.String,
}) {}

export class FanOutInvalid extends Schema.TaggedError<FanOutInvalid>()("tenetkit/runtime/FanOutInvalid", {
  message: Schema.String,
}) {}

export class FanOutRemainderUnsupported extends Schema.TaggedError<FanOutRemainderUnsupported>()(
  "tenetkit/runtime/FanOutRemainderUnsupported",
  { remainder: Schema.Literal("terminate"), durability: Schema.Literals(["ephemeral", "durable"]) },
) {}

export class MessagingUnauthorized extends Schema.TaggedError<MessagingUnauthorized>()(
  "tenetkit/runtime/MessagingUnauthorized",
  {
    from: Address,
    to: Address,
    reason: Schema.Literals(["unrelated", "cross-session", "policy"]),
  },
) {}

export class MailboxFull extends Schema.TaggedError<MailboxFull>()("tenetkit/runtime/MailboxFull", {
  to: Address,
  dimension: Schema.Literals(["pending", "bytes"]),
  limit: Schema.Int,
}) {}

export class MailboxRateLimited extends Schema.TaggedError<MailboxRateLimited>()(
  "tenetkit/runtime/MailboxRateLimited",
  { to: Address, limit: Schema.Int, windowMillis: Schema.Int },
) {}

export class MessageConflict extends Schema.TaggedError<MessageConflict>()("tenetkit/runtime/MessageConflict", {
  to: Address,
  messageId: Schema.String,
  idempotencyKey: Schema.String,
}) {}

export class AgentNameConflict extends Schema.TaggedError<AgentNameConflict>()("tenetkit/runtime/AgentNameConflict", {
  scope: Schema.String,
  name: Schema.String,
  existingRunId: Schema.String,
}) {}
