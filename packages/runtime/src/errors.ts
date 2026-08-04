import { Schema } from "effect"
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

export class ExecutableIdentityMismatch extends Schema.TaggedErrorClass<ExecutableIdentityMismatch>()(
  "@batonfx/runtime/ExecutableIdentityMismatch",
  {
    runId: Schema.String,
    expectedRef: ExecutableRef,
    actualRef: ExecutableRef,
  },
) {}

export class AgentExecutionFailure extends Schema.TaggedErrorClass<AgentExecutionFailure>()(
  "@batonfx/runtime/AgentExecutionFailure",
  { message: Schema.String, cause: Schema.optionalKey(Schema.Defect()) },
) {}

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
