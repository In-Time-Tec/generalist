import { Schema } from "effect"
import { AgentRef } from "./agent-ref.js"
import { RunWait } from "./run-wait.js"
import { Cursor } from "./cursor.js"

export const RunStatus = Schema.Literals([
  "queued",
  "running",
  "waiting",
  "needs-resolution",
  "cancelling",
  "succeeded",
  "failed",
  "cancelled",
])
export type RunStatus = typeof RunStatus.Type

export const RunId = Schema.String.check(Schema.isNonEmpty())
export type RunId = typeof RunId.Type

export const RunReceipt = Schema.Struct({
  runId: RunId,
  messageId: Schema.String,
  acceptedSequence: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  duplicate: Schema.Boolean,
})
export type RunReceipt = typeof RunReceipt.Type

export const RunInspection = Schema.Struct({
  runId: RunId,
  status: RunStatus,
  agent: AgentRef,
  parentRunId: Schema.optionalKey(RunId),
  wait: Schema.optionalKey(RunWait),
  lastSequence: Schema.Int.check(Schema.isGreaterThanOrEqualTo(-1)),
  durability: Schema.Literals(["ephemeral", "durable"]),
})
export type RunInspection = typeof RunInspection.Type

export const RunSnapshot = Schema.Struct({
  run: RunInspection,
  cursor: Cursor,
})
export type RunSnapshot = typeof RunSnapshot.Type

export const Run = Schema.Struct({
  runId: RunId,
  status: RunStatus,
  agent: AgentRef,
  messageId: Schema.String,
  sessionId: Schema.String,
  rootRunId: RunId,
  parentRunId: Schema.optionalKey(RunId),
  wait: Schema.optionalKey(RunWait),
  lastSequence: Schema.Int.check(Schema.isGreaterThanOrEqualTo(-1)),
  attempt: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
})
export type Run = typeof Run.Type

export const isTerminal = (status: RunStatus): status is "succeeded" | "failed" | "cancelled" =>
  status === "succeeded" || status === "failed" || status === "cancelled"

export const encodeReceipt = Schema.encodeEffect(RunReceipt)
export const decodeReceipt = Schema.decodeEffect(RunReceipt)
export const encodeInspection = Schema.encodeEffect(RunInspection)
export const decodeInspection = Schema.decodeEffect(RunInspection)
