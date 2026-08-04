import { Schema } from "effect"
import { Address } from "./address.js"
import { Cursor } from "./cursor.js"
import { AgentRef } from "./agent-ref.js"
import { RunId } from "./run.js"

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
