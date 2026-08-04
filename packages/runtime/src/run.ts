import { Schema } from "effect"
import { AgentRef } from "./agent-ref.js"
import { RunWait } from "./run-wait.js"
import { Cursor } from "./cursor.js"
import { Prompt } from "effect/unstable/ai"
import { ModelTelemetry } from "@batonfx/core"

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

export const AgentResult = Schema.Struct({
  text: Schema.String,
  turns: Schema.Finite,
  transcript: Prompt.Prompt,
})
export type AgentResult = typeof AgentResult.Type

export const RunFailure = Schema.Struct({
  message: Schema.String,
  cause: Schema.optionalKey(Schema.Defect()),
})
export type RunFailure = typeof RunFailure.Type

export const RunOutcome = Schema.Union([
  Schema.TaggedStruct("Succeeded", {
    result: AgentResult,
    eventId: Schema.String,
    occurredAt: Schema.String,
  }),
  Schema.TaggedStruct("Failed", {
    error: RunFailure,
    eventId: Schema.String,
    occurredAt: Schema.String,
  }),
  Schema.TaggedStruct("Cancelled", {
    reason: Schema.optionalKey(Schema.String),
    eventId: Schema.String,
    occurredAt: Schema.String,
  }),
])
export type RunOutcome = typeof RunOutcome.Type

export const RawUsageFact = Schema.Union([
  Schema.TaggedStruct("Completed", {
    runId: RunId,
    turn: Schema.Finite,
    purpose: Schema.Literals(["conversation", "structured-output", "compaction-summary"]),
    modelCallId: Schema.String,
    modelAttemptId: Schema.String,
    attempt: Schema.Int,
    usageAt: Schema.Finite,
    usage: ModelTelemetry.ModelAttemptCompleted.fields.usage,
    provider: Schema.optionalKey(Schema.String),
    model: Schema.optionalKey(Schema.String),
    requestId: Schema.optionalKey(Schema.String),
    responseModel: Schema.optionalKey(Schema.String),
    serviceTier: Schema.optionalKey(Schema.String),
  }),
  Schema.TaggedStruct("Failed", {
    runId: RunId,
    turn: Schema.Finite,
    purpose: Schema.Literals(["conversation", "structured-output", "compaction-summary"]),
    modelCallId: Schema.String,
    modelAttemptId: Schema.String,
    attempt: Schema.Int,
    category: ModelTelemetry.ModelFailureCategory,
    usageAt: Schema.Finite,
    providerUsage: ModelTelemetry.ModelProviderUsage,
    provider: Schema.optionalKey(Schema.String),
    model: Schema.optionalKey(Schema.String),
  }),
])
export type RawUsageFact = typeof RawUsageFact.Type

const CompactionBase = {
  runId: RunId,
  turn: Schema.Finite,
  compactionId: Schema.String,
  startedAt: Schema.Finite,
  trigger: ModelTelemetry.CompactionTrigger,
  contextTokensBefore: Schema.optionalKey(Schema.Finite),
  entriesBefore: Schema.optionalKey(Schema.Finite),
}
export const CompactionInspection = Schema.Union([
  Schema.TaggedStruct("Running", CompactionBase),
  Schema.TaggedStruct("Applied", {
    ...CompactionBase,
    checkpointId: Schema.String,
    appliedAt: Schema.Finite,
    kind: Schema.Literals(["microcompact", "summarize"]),
    commit: ModelTelemetry.CompactionCommit,
  }),
  Schema.TaggedStruct("Failed", { ...CompactionBase, failedAt: Schema.Finite }),
])
export type CompactionInspection = typeof CompactionInspection.Type

export const RunSnapshot = Schema.Struct({
  run: RunInspection,
  cursor: Cursor,
  outcome: Schema.optionalKey(RunOutcome),
  usage: Schema.Array(RawUsageFact),
  compactions: Schema.Array(CompactionInspection),
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
export const encodeSnapshot = Schema.encodeEffect(RunSnapshot)
export const decodeSnapshot = Schema.decodeEffect(RunSnapshot)
