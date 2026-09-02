import { Schema } from "effect"
import { BudgetExhausted, BudgetLimits, Dimension } from "../../../core/durable/run-budget.js"
import type { Approved, Denied } from "../../../core/policy/approvals.js"
import type { RunStatus } from "../../run.js"
import type { RunWait } from "../../run/wait.js"
import { OperationResolution } from "../../operation/resolution.js"
import type { ExecutionSuspension } from "../state.js"

const RecoveryRunStatus = Schema.Literals([
  "queued",
  "running",
  "waiting",
  "needs-resolution",
  "cancelling",
  "succeeded",
  "failed",
  "cancelled",
])

/** One operation fact needed to derive recovery from the authoritative journal. */
export interface JournalOperation {
  readonly operationId: string
  readonly status:
    | "requested"
    | "reserved"
    | "running"
    | "waiting"
    | "cancelling"
    | "cancelled"
    | "succeeded"
    | "failed"
    | "unknown"
  readonly replay: "safe" | "never"
  readonly attempt: number
}

/** Store-neutral facts read atomically from one Run journal. */
export interface Journal {
  readonly runId: string
  readonly status: RunStatus
  readonly lastSequence: number
  readonly waits: ReadonlyArray<RunWait>
  readonly operations: ReadonlyArray<JournalOperation>
  readonly actions: ReadonlyArray<ActionRecord & { readonly operationId: string }>
  readonly suspension?: ExecutionSuspension
  readonly failure?: unknown
}

export const RecoveryDecision = Schema.Union([
  Schema.TaggedStruct("Resume", {}),
  Schema.TaggedStruct("RetryOperation", {
    operationId: Schema.String,
    attempt: Schema.Int,
  }),
  Schema.TaggedStruct("AwaitApproval", { token: Schema.String }),
  Schema.TaggedStruct("AwaitBudget", { budget: Dimension }),
  Schema.TaggedStruct("Unknown", {
    operationId: Schema.String,
    reason: Schema.String,
  }),
  Schema.TaggedStruct("Failed", { error: Schema.Unknown }),
])
export type RecoveryDecision = typeof RecoveryDecision.Type

export const Explanation = Schema.Struct({
  status: RecoveryRunStatus,
  decision: RecoveryDecision,
  lastSequence: Schema.Int,
  obligations: Schema.Array(RecoveryDecision),
})
export type Explanation = typeof Explanation.Type

export const Verification = Schema.Struct({
  ...Explanation.fields,
  drift: Schema.Array(Schema.String),
})
export type Verification = typeof Verification.Type

export const Obligation = Schema.Struct({
  runId: Schema.String,
  decision: RecoveryDecision,
})
export type Obligation = typeof Obligation.Type

export const UnknownResolution = Schema.Union([
  Schema.Struct({ outcome: Schema.Literal("succeeded"), result: Schema.Unknown }),
  Schema.Struct({ outcome: Schema.Literal("failed"), error: Schema.Unknown }),
])
export type UnknownResolution = typeof UnknownResolution.Type

export interface OperatorActionInput {
  readonly runId: string
  readonly operator: string
}

export interface RetryInput extends OperatorActionInput {
  readonly operationId: string
}

export type WakeInput = OperatorActionInput

export interface ResolveUnknownInput extends OperatorActionInput {
  readonly operationId: string
  readonly resolution: OperationResolution
}

export const Action = Schema.Union([
  Schema.TaggedStruct("Retry", { operationId: Schema.String }),
  Schema.TaggedStruct("Wake", {}),
  Schema.TaggedStruct("ResolveUnknown", {
    operationId: Schema.String,
    resolution: OperationResolution,
  }),
  Schema.TaggedStruct("ResolveApproval", {
    token: Schema.String,
    decision: Schema.Union([
      Schema.TaggedStruct("Approved", {}),
      Schema.TaggedStruct("Denied", { reason: Schema.optionalKey(Schema.String) }),
    ]),
  }),
  Schema.TaggedStruct("ExtendBudget", { delta: BudgetLimits }),
])
export type Action = typeof Action.Type

export const ActionRecord = Schema.Struct({
  operator: Schema.String,
  action: Action,
})
export type ActionRecord = typeof ActionRecord.Type

const unknownReason = (operation: JournalOperation): string =>
  operation.replay === "never"
    ? "The side effect was dispatched without a replay guarantee, so its outcome requires an operator decision."
    : "The journal records an unknown outcome that requires an operator decision."

/** Pure projection from durable facts; no recovery decision is stored separately. */
export const explain = (journal: Journal): Explanation => {
  const unknowns = journal.operations
    .filter((operation) => operation.status === "unknown")
    .map(
      (operation): RecoveryDecision => ({
        _tag: "Unknown",
        operationId: operation.operationId,
        reason: unknownReason(operation),
      }),
    )
  const retries = journal.operations
    .filter((operation) => operation.status === "running" && operation.replay === "safe")
    .map(
      (operation): RecoveryDecision => ({
        _tag: "RetryOperation",
        operationId: operation.operationId,
        attempt: operation.attempt,
      }),
    )
  const approvals = journal.waits
    .filter((wait) => wait.status === "open" && wait.reason._tag === "Approval")
    .map(
      (wait): RecoveryDecision => ({
        _tag: "AwaitApproval",
        token: wait.waitId,
      }),
    )
  const budget = Schema.is(BudgetExhausted)(journal.suspension) ? journal.suspension.budget : undefined
  const budgetObligation: ReadonlyArray<RecoveryDecision> =
    budget === undefined ? [] : [{ _tag: "AwaitBudget", budget }]
  const obligations = [...unknowns, ...retries, ...approvals, ...budgetObligation]
  let decision = obligations[0]
  if (decision === undefined) {
    decision =
      journal.status === "failed" && journal.failure !== undefined
        ? { _tag: "Failed", error: journal.failure }
        : { _tag: "Resume" }
  }
  return {
    status: journal.status,
    decision,
    lastSequence: journal.lastSequence,
    obligations,
  }
}

/** Recompute recovery and report contradictions between materialized Run state and its journal. */
export const verify = (journal: Journal): Verification => {
  const explanation = explain(journal)
  const drift: Array<string> = []
  const hasUnknown = explanation.obligations.some((decision) => decision._tag === "Unknown")
  const awaitsApproval = explanation.obligations.some((decision) => decision._tag === "AwaitApproval")
  const awaitsBudget = explanation.obligations.some((decision) => decision._tag === "AwaitBudget")
  if (hasUnknown && journal.status !== "needs-resolution") {
    drift.push(`Unknown operation requires needs-resolution status, found ${journal.status}`)
  }
  if (!hasUnknown && journal.status === "needs-resolution") {
    drift.push("needs-resolution status has no unknown operation")
  }
  if (awaitsApproval && journal.status !== "waiting") {
    drift.push(`Open approval requires waiting status, found ${journal.status}`)
  }
  if (awaitsBudget && journal.status !== "waiting") {
    drift.push(`Budget exhaustion requires waiting status, found ${journal.status}`)
  }
  if (journal.status === "failed" && journal.failure === undefined) {
    drift.push("failed status has no terminal failure event")
  }
  return { ...explanation, drift }
}

export type ResolveApprovalDecision = Approved | Denied
