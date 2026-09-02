import { Schema } from "effect"
import { ResumeMismatch } from "../core/agent/event.js"
import { Exhausted } from "../core/durable/run-budget.js"
import { Address } from "./address.js"
import { Cursor } from "./cursor.js"
import { ExecutableRef } from "./executable/manifest.js"
import { TreeCursor, TreeCursorInvalid, TreeCursorRootMismatch } from "./tree/cursor.js"
import { ActionableTaggedError, errorHint } from "../core/error-hint.js"
import { RecoveryDecision } from "./execution/recovery/operator.js"

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

export class AddressNotFound extends ActionableTaggedError<AddressNotFound>()("generalist/runtime/AddressNotFound", {
  address: Address,
  hint: errorHint("Bind this address to a registered Agent before sending or starting work."),
}) {}

export class ExecutablePinMissing extends ActionableTaggedError<ExecutablePinMissing>()(
  "generalist/runtime/ExecutablePinMissing",
  {
    runId: Schema.String,
    ref: ExecutableRef,
    hint: errorHint("Register the exact executable pin recorded for this Run before recovery."),
  },
) {}

export class ExecutableRegistrationInvalid extends ActionableTaggedError<ExecutableRegistrationInvalid>()(
  "generalist/runtime/ExecutableRegistrationInvalid",
  {
    message: Schema.String,
    hint: errorHint("Correct the executable registration described by message before starting the Run."),
  },
) {}

export class ExecutableRegistrationConflict extends ActionableTaggedError<ExecutableRegistrationConflict>()(
  "generalist/runtime/ExecutableRegistrationConflict",
  {
    pin: Schema.String,
    hint: errorHint("Keep one exact registration per pin, or assign a new pin to changed content."),
  },
) {}

export class ExecutableRegistrationMissing extends ActionableTaggedError<ExecutableRegistrationMissing>()(
  "generalist/runtime/ExecutableRegistrationMissing",
  {
    pin: Schema.String,
    hint: errorHint("Supply the registration named by pin before starting or recovering the Run."),
  },
) {}

export class ExecutableIdentityMismatch extends ActionableTaggedError<ExecutableIdentityMismatch>()(
  "generalist/runtime/ExecutableIdentityMismatch",
  {
    runId: Schema.String,
    expectedRef: ExecutableRef,
    actualRef: ExecutableRef,
    hint: errorHint("Resolve the executable using the exact reference persisted with this Run."),
  },
) {}

/** The structured Agent failures a durable terminal event preserves verbatim. */
export type StructuredAgentFailure = Exhausted | ResumeMismatch

export const StructuredAgentFailure: Schema.Codec<
  StructuredAgentFailure,
  typeof Exhausted.Encoded | typeof ResumeMismatch.Encoded
> = Schema.Union([Exhausted, ResumeMismatch])

export class AgentExecutionFailure extends ActionableTaggedError<AgentExecutionFailure>()(
  "generalist/runtime/AgentExecutionFailure",
  {
    message: Schema.String,
    failure: Schema.optionalKey(StructuredAgentFailure),
    cause: Schema.optionalKey(Schema.Defect()),
    hint: errorHint("Inspect failure and cause, repair the Agent boundary, then resume or start again."),
  },
) {}

export class IdempotencyConflict extends ActionableTaggedError<IdempotencyConflict>()(
  "generalist/runtime/IdempotencyConflict",
  {
    address: Address,
    sessionId: Schema.String,
    idempotencyKey: Schema.String,
    existingRunId: Schema.String,
    hint: errorHint(
      "Reuse the original request for this idempotency key or submit the changed request under a new key.",
    ),
  },
) {}

export class RunIdConflict extends ActionableTaggedError<RunIdConflict>()("generalist/runtime/RunIdConflict", {
  runId: Schema.String,
  existingRunId: Schema.String,
  hint: errorHint("Use the existing Run identity for an exact replay, or allocate a new Run ID."),
}) {}

export class RunNotFound extends ActionableTaggedError<RunNotFound>()("generalist/runtime/RunNotFound", {
  runId: Schema.String,
  hint: errorHint("Check the Run ID and inspect the Runtime instance that admitted it."),
}) {}

export class IllegalOperatorAction extends ActionableTaggedError<IllegalOperatorAction>()(
  "generalist/runtime/IllegalOperatorAction",
  {
    runId: Schema.String,
    decision: RecoveryDecision,
    action: Schema.String,
    hint: errorHint("Re-run runtime.operator.explain and choose an action legal for the reported decision."),
  },
) {}

/** A fork point has no committed sandbox image to restore. */
export class NoSnapshot extends ActionableTaggedError<NoSnapshot>()("generalist/runtime/NoSnapshot", {
  runId: Schema.String,
  atSequence: Schema.Int,
  hint: errorHint("Fork at or after a committed SandboxSnapshot progress event."),
}) {}

/** A fork or rewind sequence is outside the committed journal. */
export class ForkSequenceInvalid extends ActionableTaggedError<ForkSequenceInvalid>()(
  "generalist/runtime/ForkSequenceInvalid",
  {
    runId: Schema.String,
    sequence: Schema.Int,
    lastSequence: Schema.Int,
    hint: errorHint("Choose a sequence from the Run's committed journal."),
  },
) {}

/** A counterfactual substitution does not name a completed operation in the selected prefix. */
export class SubstitutionInvalid extends ActionableTaggedError<SubstitutionInvalid>()(
  "generalist/runtime/SubstitutionInvalid",
  {
    runId: Schema.String,
    operationId: Schema.String,
    hint: errorHint("Choose a completed operation from the selected journal prefix."),
  },
) {}

/** An Agent name is already registered in this Runtime process. */
export class DuplicateAgent extends ActionableTaggedError<DuplicateAgent>()("generalist/runtime/DuplicateAgent", {
  name: Schema.String,
  hint: errorHint("Register each Agent name once per Runtime process, or rename the conflicting Agent."),
}) {}

/** A durable Run names an Agent that this Runtime process has not registered. */
export class UnknownAgent extends ActionableTaggedError<UnknownAgent>()("generalist/runtime/UnknownAgent", {
  name: Schema.String,
  runId: Schema.String,
  hint: errorHint("Register the named Agent in this Runtime process before recovering or inspecting the Run."),
}) {}

export class RunTerminal extends ActionableTaggedError<RunTerminal>()("generalist/runtime/RunTerminal", {
  runId: Schema.String,
  status: Schema.Literals(["succeeded", "failed", "cancelled"]),
  hint: errorHint("Inspect the terminal Run outcome and start a new Run for additional work."),
}) {}

export class ChildSelectionMissing extends ActionableTaggedError<ChildSelectionMissing>()(
  "generalist/runtime/ChildSelectionMissing",
  {
    parentRunId: Schema.String,
    selection: Schema.String,
    hint: errorHint("Add the selected child Agent to the parent's admitted registration catalog."),
  },
) {}

export class ChildDepthExceeded extends ActionableTaggedError<ChildDepthExceeded>()(
  "generalist/runtime/ChildDepthExceeded",
  {
    parentRunId: Schema.String,
    rootRunId: Schema.String,
    parentDepth: Schema.Int,
    depth: Schema.Int,
    requested: Schema.Int,
    current: Schema.Int,
    limit: Schema.Int,
    hint: errorHint("Reduce child depth or increase the root tree depth limit before spawning."),
  },
) {}

export class ChildLimitExceeded extends ActionableTaggedError<ChildLimitExceeded>()(
  "generalist/runtime/ChildLimitExceeded",
  {
    parentRunId: Schema.String,
    rootRunId: Schema.String,
    parentDepth: Schema.Int,
    depth: Schema.Int,
    requested: Schema.Int,
    current: Schema.Int,
    limit: Schema.Int,
    hint: errorHint("Wait for existing children to settle, reduce the fan-out, or increase the child limit."),
  },
) {}

export class TreePolicyInvalid extends ActionableTaggedError<TreePolicyInvalid>()(
  "generalist/runtime/TreePolicyInvalid",
  {
    message: Schema.String,
    hint: errorHint("Correct the finite tree policy values described by message before admission."),
  },
) {}

export class StartInvalid extends ActionableTaggedError<StartInvalid>()("generalist/runtime/StartInvalid", {
  message: Schema.String,
  hint: errorHint("Correct the invalid start input described by message and submit it again."),
}) {}

export class SteeringConflict extends ActionableTaggedError<SteeringConflict>()("generalist/runtime/SteeringConflict", {
  runId: Schema.String,
  idempotencyKey: Schema.String,
  hint: errorHint("Reuse the original steering payload for this key or send the changed payload under a new key."),
}) {}

export class WaitNotOpen extends ActionableTaggedError<WaitNotOpen>()("generalist/runtime/WaitNotOpen", {
  runId: Schema.String,
  waitId: Schema.String,
  hint: errorHint("Inspect the Run's open waits and respond to one that is still unresolved."),
}) {}

export class ResponseConflict extends ActionableTaggedError<ResponseConflict>()("generalist/runtime/ResponseConflict", {
  runId: Schema.String,
  waitId: Schema.String,
  hint: errorHint("Reuse the original wait response or submit a response for a different open wait."),
}) {}

/** The approval no longer names an unresolved request. */
export class ApprovalStale extends ActionableTaggedError<ApprovalStale>()("generalist/runtime/ApprovalStale", {
  runId: Schema.String,
  approvalId: Schema.String,
  hint: errorHint("Inspect current approvals and respond only to an unresolved approval identity."),
}) {}

/** The response conflicts with the authoritative approval identity or decision. */
export class ApprovalMismatch extends ActionableTaggedError<ApprovalMismatch>()("generalist/runtime/ApprovalMismatch", {
  runId: Schema.String,
  approvalId: Schema.String,
  mismatch: Schema.Literals(["approval-id", "wait-kind", "decision"]),
  expectedApprovalId: Schema.optionalKey(Schema.String),
  hint: errorHint("Respond with the exact current approval identity and repeat only the same decision."),
}) {}

export class OperationResolutionConflict extends ActionableTaggedError<OperationResolutionConflict>()(
  "generalist/runtime/OperationResolutionConflict",
  {
    runId: Schema.String,
    operationId: Schema.String,
    idempotencyKey: Schema.String,
    hint: errorHint("Reuse the original resolution or submit a changed resolution under a new idempotency key."),
  },
) {}

export class CursorExpired extends ActionableTaggedError<CursorExpired>()("generalist/runtime/CursorExpired", {
  runId: Schema.String,
  cursor: Cursor,
  earliestSequence: Schema.Int,
  hint: errorHint("Take a fresh snapshot and resume replay from its current exclusive cursor."),
}) {}

export class TreeCursorExpired extends ActionableTaggedError<TreeCursorExpired>()(
  "generalist/runtime/TreeCursorExpired",
  {
    rootRunId: Schema.String,
    cursor: TreeCursor,
    earliestCursor: TreeCursor,
    hint: errorHint("Take a fresh tree checkpoint and replay from its current exclusive cursor."),
  },
) {}

/** The cursor names a position that has not committed. */
export class TreeCursorFuture extends ActionableTaggedError<TreeCursorFuture>()("generalist/runtime/TreeCursorFuture", {
  rootRunId: Schema.String,
  cursor: TreeCursor,
  latestCursor: TreeCursor,
  hint: errorHint("Wait for more tree events or replay from a cursor no later than latestCursor."),
}) {}

/** A replay request falls outside the fixed page-size contract. */
export class TreeReplayLimitInvalid extends ActionableTaggedError<TreeReplayLimitInvalid>()(
  "generalist/runtime/TreeReplayLimitInvalid",
  {
    received: Schema.String,
    minimum: Schema.Int,
    maximum: Schema.Int,
    hint: errorHint("Request a replay page whose limit is within the reported minimum and maximum."),
  },
) {}

export class SubscriberLagged extends ActionableTaggedError<SubscriberLagged>()("generalist/runtime/SubscriberLagged", {
  runId: Schema.String,
  lastDeliveredSequence: Schema.Int,
  hint: errorHint("Take a fresh snapshot and reconnect from its exclusive cursor."),
}) {}

/** The acknowledged sequence is not a valid processed-through point for the Run. */
export class AckInvalid extends ActionableTaggedError<AckInvalid>()("generalist/runtime/AckInvalid", {
  runId: Schema.String,
  // oxlint-disable-next-line effecttsgo/schema-number
  sequence: Schema.Number,
  message: Schema.String,
  hint: errorHint("Acknowledge -1 or the sequence of a committed TurnCompleted boundary."),
}) {}

/** The acknowledged sequence is beyond the last committed model cycle. */
export class AckBeyondCommitted extends ActionableTaggedError<AckBeyondCommitted>()(
  "generalist/runtime/AckBeyondCommitted",
  {
    runId: Schema.String,
    sequence: Schema.Int,
    lastCommittedSequence: Schema.Int,
    hint: errorHint("Acknowledge no later than lastCommittedSequence after that cycle commits."),
  },
) {}

export class RuntimeUnavailable extends ActionableTaggedError<RuntimeUnavailable>()(
  "generalist/runtime/RuntimeUnavailable",
  {
    message: Schema.String,
    hint: errorHint("Restore the Runtime store or host dependency described by message, then retry."),
  },
) {}

export class SessionEntryNotFound extends ActionableTaggedError<SessionEntryNotFound>()(
  "generalist/runtime/SessionEntryNotFound",
  {
    sessionId: Schema.String,
    entryId: Schema.String,
    hint: errorHint("Check the Session and entry identities against the authoritative Session store."),
  },
) {}

export class SessionEntryCorrupt extends ActionableTaggedError<SessionEntryCorrupt>()(
  "generalist/runtime/SessionEntryCorrupt",
  {
    sessionId: Schema.String,
    entryId: Schema.String,
    message: Schema.String,
    hint: errorHint("Repair or restore the identified Session entry from authoritative data before replay."),
  },
) {}

export class FanOutConflict extends ActionableTaggedError<FanOutConflict>()("generalist/runtime/FanOutConflict", {
  parentRunId: Schema.String,
  idempotencyKey: Schema.String,
  existingFanOutId: Schema.String,
  hint: errorHint("Reuse the original fan-out request for this key or submit changed members under a new key."),
}) {}

export class FanOutNotFound extends ActionableTaggedError<FanOutNotFound>()("generalist/runtime/FanOutNotFound", {
  fanOutId: Schema.String,
  hint: errorHint("Check the fan-out ID against the Runtime that admitted the group."),
}) {}

export class FanOutInvalid extends ActionableTaggedError<FanOutInvalid>()("generalist/runtime/FanOutInvalid", {
  message: Schema.String,
  hint: errorHint("Correct the fan-out input described by message before admission."),
}) {}

export class FanOutRemainderUnsupported extends ActionableTaggedError<FanOutRemainderUnsupported>()(
  "generalist/runtime/FanOutRemainderUnsupported",
  {
    remainder: Schema.Literal("terminate"),
    durability: Schema.Literals(["ephemeral", "durable"]),
    hint: errorHint("Choose a remainder policy supported by this Runtime durability mode."),
  },
) {}

export class MessagingUnauthorized extends ActionableTaggedError<MessagingUnauthorized>()(
  "generalist/runtime/MessagingUnauthorized",
  {
    from: Address,
    to: Address,
    reason: Schema.Literals(["unrelated", "cross-session", "policy"]),
    hint: errorHint("Send only along an allowed relationship or update the host messaging policy."),
  },
) {}

export class MailboxFull extends ActionableTaggedError<MailboxFull>()("generalist/runtime/MailboxFull", {
  to: Address,
  dimension: Schema.Literals(["pending", "bytes"]),
  limit: Schema.Int,
  hint: errorHint("Drain the target mailbox, reduce the message, or increase its finite bound."),
}) {}

export class MailboxRateLimited extends ActionableTaggedError<MailboxRateLimited>()(
  "generalist/runtime/MailboxRateLimited",
  {
    to: Address,
    limit: Schema.Int,
    windowMillis: Schema.Int,
    hint: errorHint("Wait for the reported rate window before sending another message to this address."),
  },
) {}

export class MessageConflict extends ActionableTaggedError<MessageConflict>()("generalist/runtime/MessageConflict", {
  to: Address,
  messageId: Schema.String,
  idempotencyKey: Schema.String,
  hint: errorHint("Reuse the original message payload or submit changed content under a new identity."),
}) {}

export class AgentNameConflict extends ActionableTaggedError<AgentNameConflict>()(
  "generalist/runtime/AgentNameConflict",
  {
    scope: Schema.String,
    name: Schema.String,
    existingRunId: Schema.String,
    hint: errorHint("Use a unique name in this scope or address the existing named Run."),
  },
) {}
