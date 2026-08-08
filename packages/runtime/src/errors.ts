import { Schema } from "effect"
import { AgentEvent, RunBudget } from "@batonfx/core"
import { Address } from "./address.js"
import { Cursor } from "./cursor.js"
import { ExecutableRef } from "./executable-manifest.js"
import { TreeCursor } from "./tree-cursor.js"

export class AddressNotFound extends Schema.TaggedErrorClass<AddressNotFound>()("@batonfx/runtime/AddressNotFound", {
  address: Address,
}) {}

export class ExecutablePinMissing extends Schema.TaggedErrorClass<ExecutablePinMissing>()(
  "@batonfx/runtime/ExecutablePinMissing",
  { runId: Schema.String, ref: ExecutableRef },
) {}

export class ExecutableRegistrationInvalid extends Schema.TaggedErrorClass<ExecutableRegistrationInvalid>()(
  "@batonfx/runtime/ExecutableRegistrationInvalid",
  { message: Schema.String },
) {}

export class ExecutableRegistrationConflict extends Schema.TaggedErrorClass<ExecutableRegistrationConflict>()(
  "@batonfx/runtime/ExecutableRegistrationConflict",
  { pin: Schema.String },
) {}

export class ExecutableRegistrationMissing extends Schema.TaggedErrorClass<ExecutableRegistrationMissing>()(
  "@batonfx/runtime/ExecutableRegistrationMissing",
  { pin: Schema.String },
) {}

export class ExecutableIdentityMismatch extends Schema.TaggedErrorClass<ExecutableIdentityMismatch>()(
  "@batonfx/runtime/ExecutableIdentityMismatch",
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
  "@batonfx/runtime/AgentExecutionFailure",
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
  "@batonfx/runtime/IdempotencyConflict",
  {
    address: Address,
    sessionId: Schema.String,
    idempotencyKey: Schema.String,
    existingRunId: Schema.String,
  },
) {}

export class RunIdConflict extends Schema.TaggedErrorClass<RunIdConflict>()("@batonfx/runtime/RunIdConflict", {
  runId: Schema.String,
  existingRunId: Schema.String,
}) {}

export class RunNotFound extends Schema.TaggedErrorClass<RunNotFound>()("@batonfx/runtime/RunNotFound", {
  runId: Schema.String,
}) {}

export class RunTerminal extends Schema.TaggedErrorClass<RunTerminal>()("@batonfx/runtime/RunTerminal", {
  runId: Schema.String,
  status: Schema.Literals(["succeeded", "failed", "cancelled"]),
}) {}

export class ChildSelectionMissing extends Schema.TaggedErrorClass<ChildSelectionMissing>()(
  "@batonfx/runtime/ChildSelectionMissing",
  { parentRunId: Schema.String, selection: Schema.String },
) {}

export class StartInvalid extends Schema.TaggedErrorClass<StartInvalid>()("@batonfx/runtime/StartInvalid", {
  message: Schema.String,
}) {}

export class SteeringConflict extends Schema.TaggedErrorClass<SteeringConflict>()("@batonfx/runtime/SteeringConflict", {
  runId: Schema.String,
  idempotencyKey: Schema.String,
}) {}

export class WaitNotOpen extends Schema.TaggedErrorClass<WaitNotOpen>()("@batonfx/runtime/WaitNotOpen", {
  runId: Schema.String,
  waitId: Schema.String,
}) {}

export class ResponseConflict extends Schema.TaggedErrorClass<ResponseConflict>()("@batonfx/runtime/ResponseConflict", {
  runId: Schema.String,
  waitId: Schema.String,
}) {}

/** @experimental The approval no longer names an unresolved request. */
export class ApprovalStale extends Schema.TaggedErrorClass<ApprovalStale>()("@batonfx/runtime/ApprovalStale", {
  runId: Schema.String,
  approvalId: Schema.String,
}) {}

/** @experimental The response conflicts with the authoritative approval identity or decision. */
export class ApprovalMismatch extends Schema.TaggedErrorClass<ApprovalMismatch>()("@batonfx/runtime/ApprovalMismatch", {
  runId: Schema.String,
  approvalId: Schema.String,
  mismatch: Schema.Literals(["approval-id", "wait-kind", "decision"]),
  expectedApprovalId: Schema.optionalKey(Schema.String),
}) {}

export class OperationResolutionConflict extends Schema.TaggedErrorClass<OperationResolutionConflict>()(
  "@batonfx/runtime/OperationResolutionConflict",
  { runId: Schema.String, operationId: Schema.String, idempotencyKey: Schema.String },
) {}

export class CursorExpired extends Schema.TaggedErrorClass<CursorExpired>()("@batonfx/runtime/CursorExpired", {
  runId: Schema.String,
  cursor: Cursor,
  earliestSequence: Schema.Int,
}) {}

export class TreeCursorInvalid extends Schema.TaggedErrorClass<TreeCursorInvalid>()(
  "@batonfx/runtime/TreeCursorInvalid",
  { rootRunId: Schema.String, cursor: TreeCursor, message: Schema.String },
) {}

export class TreeCursorExpired extends Schema.TaggedErrorClass<TreeCursorExpired>()(
  "@batonfx/runtime/TreeCursorExpired",
  { rootRunId: Schema.String, cursor: TreeCursor, earliestCursor: TreeCursor },
) {}

export class SubscriberLagged extends Schema.TaggedErrorClass<SubscriberLagged>()("@batonfx/runtime/SubscriberLagged", {
  runId: Schema.String,
  lastDeliveredSequence: Schema.Int,
}) {}

export class RuntimeUnavailable extends Schema.TaggedErrorClass<RuntimeUnavailable>()(
  "@batonfx/runtime/RuntimeUnavailable",
  {
    message: Schema.String,
  },
) {}

export class FanOutConflict extends Schema.TaggedErrorClass<FanOutConflict>()("@batonfx/runtime/FanOutConflict", {
  parentRunId: Schema.String,
  idempotencyKey: Schema.String,
  existingFanOutId: Schema.String,
}) {}

export class FanOutNotFound extends Schema.TaggedErrorClass<FanOutNotFound>()("@batonfx/runtime/FanOutNotFound", {
  fanOutId: Schema.String,
}) {}

export class FanOutInvalid extends Schema.TaggedErrorClass<FanOutInvalid>()("@batonfx/runtime/FanOutInvalid", {
  message: Schema.String,
}) {}

export class FanOutRemainderUnsupported extends Schema.TaggedErrorClass<FanOutRemainderUnsupported>()(
  "@batonfx/runtime/FanOutRemainderUnsupported",
  { remainder: Schema.Literal("terminate"), durability: Schema.Literals(["ephemeral", "durable"]) },
) {}

const ReportedNumber = Schema.declare((input): input is number => typeof input === "number")

/** @experimental The acknowledged sequence is not a valid processed-through point for the Run. */
export class AckInvalid extends Schema.TaggedErrorClass<AckInvalid>()("@batonfx/runtime/AckInvalid", {
  runId: Schema.String,
  sequence: ReportedNumber,
  message: Schema.String,
}) {}

/** @experimental The acknowledged sequence is beyond the last committed cycle boundary. */
export class AckBeyondCommitted extends Schema.TaggedErrorClass<AckBeyondCommitted>()(
  "@batonfx/runtime/AckBeyondCommitted",
  {
    runId: Schema.String,
    sequence: Schema.Int,
    lastCommittedSequence: Schema.Int,
  },
) {}
