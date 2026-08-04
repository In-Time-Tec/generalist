import { Schema } from "effect"
import { Address } from "./address.js"
import { Cursor } from "./cursor.js"
import { AgentRef } from "./agent-ref.js"
import { RunId } from "./run.js"
import { TreeCursor } from "./tree-cursor.js"

export class AddressNotFound extends Schema.TaggedErrorClass<AddressNotFound>()("@batonfx/runtime/AddressNotFound", {
  address: Address,
}) {}

export class AgentVersionUnavailable extends Schema.TaggedErrorClass<AgentVersionUnavailable>()(
  "@batonfx/runtime/AgentVersionUnavailable",
  {
    agent: AgentRef,
  },
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
  runId: RunId,
  existingRunId: RunId,
}) {}

export class RunNotFound extends Schema.TaggedErrorClass<RunNotFound>()("@batonfx/runtime/RunNotFound", {
  runId: Schema.String,
}) {}

export class RunTerminal extends Schema.TaggedErrorClass<RunTerminal>()("@batonfx/runtime/RunTerminal", {
  runId: Schema.String,
  status: Schema.Literals(["succeeded", "failed", "cancelled"]),
}) {}

export class SteeringConflict extends Schema.TaggedErrorClass<SteeringConflict>()("@batonfx/runtime/SteeringConflict", {
  runId: RunId,
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

export class CursorExpired extends Schema.TaggedErrorClass<CursorExpired>()("@batonfx/runtime/CursorExpired", {
  runId: Schema.String,
  cursor: Cursor,
  earliestSequence: Schema.Int,
}) {}

export class TreeCursorInvalid extends Schema.TaggedErrorClass<TreeCursorInvalid>()(
  "@batonfx/runtime/TreeCursorInvalid",
  { rootRunId: RunId, cursor: TreeCursor, message: Schema.String },
) {}

export class TreeCursorExpired extends Schema.TaggedErrorClass<TreeCursorExpired>()(
  "@batonfx/runtime/TreeCursorExpired",
  { rootRunId: RunId, cursor: TreeCursor, earliestCursor: TreeCursor },
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

export class AgentBindingConflict extends Schema.TaggedErrorClass<AgentBindingConflict>()(
  "@batonfx/runtime/AgentBindingConflict",
  {
    address: Address,
    existing: AgentRef,
    attempted: AgentRef,
  },
) {}

export class AgentNotRegistered extends Schema.TaggedErrorClass<AgentNotRegistered>()(
  "@batonfx/runtime/AgentNotRegistered",
  {
    agent: AgentRef,
  },
) {}

export class FanOutConflict extends Schema.TaggedErrorClass<FanOutConflict>()("@batonfx/runtime/FanOutConflict", {
  parentRunId: RunId,
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
