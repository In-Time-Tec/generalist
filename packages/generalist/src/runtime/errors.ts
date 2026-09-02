import { Schema } from "effect"
import { ResumeMismatch } from "../core/agent/event.js"
import { Exhausted } from "../core/durable/run-budget.js"
import { Address } from "./address.js"
import { Cursor } from "./cursor.js"
import { ExecutableRef } from "./executable/manifest.js"
import { TreeCursor, TreeCursorInvalid, TreeCursorRootMismatch } from "./tree/cursor.js"

export { TreeCursorInvalid, TreeCursorRootMismatch }
export {
  MultiWorkerUnsupported,
  SchemaChecksumMismatch,
  SchemaDirty,
  SchemaMigrationFailed,
  SchemaUpgradeRequired,
  SchemaVersionUnsupported,
  StaleClaim,
} from "./sql/errors.js"

export class AddressNotFound extends Schema.TaggedError<AddressNotFound>()("generalist/runtime/AddressNotFound", {
  address: Address,
}) {}

export class ExecutablePinMissing extends Schema.TaggedError<ExecutablePinMissing>()(
  "generalist/runtime/ExecutablePinMissing",
  { runId: Schema.String, ref: ExecutableRef },
) {}

export class ExecutableRegistrationInvalid extends Schema.TaggedError<ExecutableRegistrationInvalid>()(
  "generalist/runtime/ExecutableRegistrationInvalid",
  { message: Schema.String },
) {}

export class ExecutableRegistrationConflict extends Schema.TaggedError<ExecutableRegistrationConflict>()(
  "generalist/runtime/ExecutableRegistrationConflict",
  { pin: Schema.String },
) {}

export class ExecutableRegistrationMissing extends Schema.TaggedError<ExecutableRegistrationMissing>()(
  "generalist/runtime/ExecutableRegistrationMissing",
  { pin: Schema.String },
) {}

export class ExecutableIdentityMismatch extends Schema.TaggedError<ExecutableIdentityMismatch>()(
  "generalist/runtime/ExecutableIdentityMismatch",
  {
    runId: Schema.String,
    expectedRef: ExecutableRef,
    actualRef: ExecutableRef,
  },
) {}

/** The structured Agent failures a durable terminal event preserves verbatim. */
export type StructuredAgentFailure = Exhausted | ResumeMismatch

export const StructuredAgentFailure: Schema.Codec<
  StructuredAgentFailure,
  typeof Exhausted.Encoded | typeof ResumeMismatch.Encoded
> = Schema.Union([Exhausted, ResumeMismatch])

export class AgentExecutionFailure extends Schema.TaggedError<AgentExecutionFailure>()(
  "generalist/runtime/AgentExecutionFailure",
  {
    message: Schema.String,
    failure: Schema.optionalKey(StructuredAgentFailure),
    cause: Schema.optionalKey(Schema.Defect()),
  },
) {}

export class IdempotencyConflict extends Schema.TaggedError<IdempotencyConflict>()(
  "generalist/runtime/IdempotencyConflict",
  {
    address: Address,
    sessionId: Schema.String,
    idempotencyKey: Schema.String,
    existingRunId: Schema.String,
  },
) {}

export class RunIdConflict extends Schema.TaggedError<RunIdConflict>()("generalist/runtime/RunIdConflict", {
  runId: Schema.String,
  existingRunId: Schema.String,
}) {}

export class RunNotFound extends Schema.TaggedError<RunNotFound>()("generalist/runtime/RunNotFound", {
  runId: Schema.String,
}) {}

/** @experimental An Agent name is already registered in this Runtime process. */
export class DuplicateAgent extends Schema.TaggedError<DuplicateAgent>()("generalist/runtime/DuplicateAgent", {
  name: Schema.String,
}) {}

/** @experimental A durable Run names an Agent that this Runtime process has not registered. */
export class UnknownAgent extends Schema.TaggedError<UnknownAgent>()("generalist/runtime/UnknownAgent", {
  name: Schema.String,
  runId: Schema.String,
}) {}

export class RunTerminal extends Schema.TaggedError<RunTerminal>()("generalist/runtime/RunTerminal", {
  runId: Schema.String,
  status: Schema.Literals(["succeeded", "failed", "cancelled"]),
}) {}

export class ChildSelectionMissing extends Schema.TaggedError<ChildSelectionMissing>()(
  "generalist/runtime/ChildSelectionMissing",
  { parentRunId: Schema.String, selection: Schema.String },
) {}

export class ChildDepthExceeded extends Schema.TaggedError<ChildDepthExceeded>()(
  "generalist/runtime/ChildDepthExceeded",
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
  "generalist/runtime/ChildLimitExceeded",
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

export class TreePolicyInvalid extends Schema.TaggedError<TreePolicyInvalid>()("generalist/runtime/TreePolicyInvalid", {
  message: Schema.String,
}) {}

export class StartInvalid extends Schema.TaggedError<StartInvalid>()("generalist/runtime/StartInvalid", {
  message: Schema.String,
}) {}

export class SteeringConflict extends Schema.TaggedError<SteeringConflict>()("generalist/runtime/SteeringConflict", {
  runId: Schema.String,
  idempotencyKey: Schema.String,
}) {}

export class WaitNotOpen extends Schema.TaggedError<WaitNotOpen>()("generalist/runtime/WaitNotOpen", {
  runId: Schema.String,
  waitId: Schema.String,
}) {}

export class ResponseConflict extends Schema.TaggedError<ResponseConflict>()("generalist/runtime/ResponseConflict", {
  runId: Schema.String,
  waitId: Schema.String,
}) {}

/** The approval no longer names an unresolved request. */
export class ApprovalStale extends Schema.TaggedError<ApprovalStale>()("generalist/runtime/ApprovalStale", {
  runId: Schema.String,
  approvalId: Schema.String,
}) {}

/** The response conflicts with the authoritative approval identity or decision. */
export class ApprovalMismatch extends Schema.TaggedError<ApprovalMismatch>()("generalist/runtime/ApprovalMismatch", {
  runId: Schema.String,
  approvalId: Schema.String,
  mismatch: Schema.Literals(["approval-id", "wait-kind", "decision"]),
  expectedApprovalId: Schema.optionalKey(Schema.String),
}) {}

export class OperationResolutionConflict extends Schema.TaggedError<OperationResolutionConflict>()(
  "generalist/runtime/OperationResolutionConflict",
  { runId: Schema.String, operationId: Schema.String, idempotencyKey: Schema.String },
) {}

export class CursorExpired extends Schema.TaggedError<CursorExpired>()("generalist/runtime/CursorExpired", {
  runId: Schema.String,
  cursor: Cursor,
  earliestSequence: Schema.Int,
}) {}

export class TreeCursorExpired extends Schema.TaggedError<TreeCursorExpired>()("generalist/runtime/TreeCursorExpired", {
  rootRunId: Schema.String,
  cursor: TreeCursor,
  earliestCursor: TreeCursor,
}) {}

/** The cursor names a position that has not committed. */
export class TreeCursorFuture extends Schema.TaggedError<TreeCursorFuture>()("generalist/runtime/TreeCursorFuture", {
  rootRunId: Schema.String,
  cursor: TreeCursor,
  latestCursor: TreeCursor,
}) {}

/** A replay request falls outside the fixed page-size contract. */
export class TreeReplayLimitInvalid extends Schema.TaggedError<TreeReplayLimitInvalid>()(
  "generalist/runtime/TreeReplayLimitInvalid",
  {
    received: Schema.String,
    minimum: Schema.Int,
    maximum: Schema.Int,
  },
) {}

export class SubscriberLagged extends Schema.TaggedError<SubscriberLagged>()("generalist/runtime/SubscriberLagged", {
  runId: Schema.String,
  lastDeliveredSequence: Schema.Int,
}) {}

/** The acknowledged sequence is not a valid processed-through point for the Run. */
export class AckInvalid extends Schema.TaggedError<AckInvalid>()("generalist/runtime/AckInvalid", {
  runId: Schema.String,
  // oxlint-disable-next-line effecttsgo/schema-number
  sequence: Schema.Number,
  message: Schema.String,
}) {}

/** The acknowledged sequence is beyond the last committed model cycle. */
export class AckBeyondCommitted extends Schema.TaggedError<AckBeyondCommitted>()(
  "generalist/runtime/AckBeyondCommitted",
  {
    runId: Schema.String,
    sequence: Schema.Int,
    lastCommittedSequence: Schema.Int,
  },
) {}

export class RuntimeUnavailable extends Schema.TaggedError<RuntimeUnavailable>()(
  "generalist/runtime/RuntimeUnavailable",
  {
    message: Schema.String,
  },
) {}

export class SessionEntryNotFound extends Schema.TaggedError<SessionEntryNotFound>()(
  "generalist/runtime/SessionEntryNotFound",
  { sessionId: Schema.String, entryId: Schema.String },
) {}

export class SessionEntryCorrupt extends Schema.TaggedError<SessionEntryCorrupt>()(
  "generalist/runtime/SessionEntryCorrupt",
  { sessionId: Schema.String, entryId: Schema.String, message: Schema.String },
) {}

export class FanOutConflict extends Schema.TaggedError<FanOutConflict>()("generalist/runtime/FanOutConflict", {
  parentRunId: Schema.String,
  idempotencyKey: Schema.String,
  existingFanOutId: Schema.String,
}) {}

export class FanOutNotFound extends Schema.TaggedError<FanOutNotFound>()("generalist/runtime/FanOutNotFound", {
  fanOutId: Schema.String,
}) {}

export class FanOutInvalid extends Schema.TaggedError<FanOutInvalid>()("generalist/runtime/FanOutInvalid", {
  message: Schema.String,
}) {}

export class FanOutRemainderUnsupported extends Schema.TaggedError<FanOutRemainderUnsupported>()(
  "generalist/runtime/FanOutRemainderUnsupported",
  { remainder: Schema.Literal("terminate"), durability: Schema.Literals(["ephemeral", "durable"]) },
) {}

export class MessagingUnauthorized extends Schema.TaggedError<MessagingUnauthorized>()(
  "generalist/runtime/MessagingUnauthorized",
  {
    from: Address,
    to: Address,
    reason: Schema.Literals(["unrelated", "cross-session", "policy"]),
  },
) {}

export class MailboxFull extends Schema.TaggedError<MailboxFull>()("generalist/runtime/MailboxFull", {
  to: Address,
  dimension: Schema.Literals(["pending", "bytes"]),
  limit: Schema.Int,
}) {}

export class MailboxRateLimited extends Schema.TaggedError<MailboxRateLimited>()(
  "generalist/runtime/MailboxRateLimited",
  { to: Address, limit: Schema.Int, windowMillis: Schema.Int },
) {}

export class MessageConflict extends Schema.TaggedError<MessageConflict>()("generalist/runtime/MessageConflict", {
  to: Address,
  messageId: Schema.String,
  idempotencyKey: Schema.String,
}) {}

export class AgentNameConflict extends Schema.TaggedError<AgentNameConflict>()("generalist/runtime/AgentNameConflict", {
  scope: Schema.String,
  name: Schema.String,
  existingRunId: Schema.String,
}) {}
