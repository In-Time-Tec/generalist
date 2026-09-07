import { Schema } from "effect"
import {
  CapabilityFailure,
  type ProgramBudgetExhausted,
  type ProgramOperationUnknown,
  ProgramOperationName,
  type ProgramReplayDivergence,
} from "../../core/program/capabilities.js"
import { ProgramReplayPolicy } from "../../core/program/handlers.js"
import { ProgramBudget } from "../../core/durable/manifest/program-manifest.js"
import type { ExecutionClaim } from "../run/store.js"
import type { AdmitFanOutInput } from "../child/fan-out-internal.js"
import type { ExecutionCheckpoint, ExecutionSuspension } from "../execution/state.js"
import type { RunWait } from "../run/wait.js"
import { OperationResolution } from "../operation/resolution.js"

/** Program replay vocabulary persisted without translation. */
export const ProgramOperationKind = Schema.Literals(["tool", "step", "log", "agent", "agent-map", "agent-fan-out"])
export type ProgramOperationKind = typeof ProgramOperationKind.Type
export const ProgramOperationStatus = Schema.Literals([
  "reserved",
  "running",
  "waiting",
  "succeeded",
  "failed",
  "unknown",
])
export type ProgramOperationStatus = typeof ProgramOperationStatus.Type
const ProgramOperationFailure = CapabilityFailure.pipe(Schema.toTaggedUnion("_tag"))
const programOperationFailureCases = ProgramOperationFailure.cases

/** Known Program failures use their domain codec; malformed tagged failures cannot fall through as opaque data. */
const ProgramOperationError = Schema.Union([
  ProgramOperationFailure,
  Schema.Unknown.check(Schema.makeFilter(
    (value) =>
      value === null ||
      typeof value !== "object" ||
      !("_tag" in value) ||
      typeof value._tag !== "string" ||
      !Object.hasOwn(programOperationFailureCases, value._tag),
    { message: "Program operation failures must match their domain schema" },
  )),
])

/** Persisted counters and the fixed deadline for one Program Run. */
export const ProgramRunState = Schema.Struct({
  runId: Schema.String,
  programPin: Schema.String,
  budget: ProgramBudget,
  deadlineMillis: Schema.Finite,
  /** All forks share the original concurrency pool; additive allocations are reserved separately. */
  concurrencyRoot: Schema.optionalKey(Schema.String),
  toolCalls: Schema.Int,
  agentRuns: Schema.Int,
  tokens: Schema.Int,
  logBytes: Schema.Int,
  activeSlots: Schema.Int,
})
export type ProgramRunState = typeof ProgramRunState.Type

/** Exact durable record for one Core Program operation. */
export const ProgramOperationRecord = Schema.Struct({
  runId: Schema.String,
  operation: ProgramOperationName,
  authoredOperation: ProgramOperationName,
  kind: ProgramOperationKind,
  capability: Schema.String,
  inputDigest: Schema.String,
  input: Schema.Unknown,
  replay: ProgramReplayPolicy,
  status: ProgramOperationStatus,
  result: Schema.optionalKey(Schema.Unknown),
  error: Schema.optionalKey(ProgramOperationError),
  waitId: Schema.optionalKey(Schema.String),
  fanOutId: Schema.optionalKey(Schema.String),
  childRunIds: Schema.Array(Schema.String),
  resolutionIdempotencyKey: Schema.optionalKey(Schema.String),
  resolution: Schema.optionalKey(OperationResolution),
  completedSequence: Schema.optionalKey(Schema.Int),
})
export type ProgramOperationRecord = typeof ProgramOperationRecord.Type

/** Resources atomically reserved with a Program operation. */
export interface ProgramReservation {
  readonly toolCalls?: number
  readonly agentRuns?: number
  readonly logBytes?: number
  readonly activeSlots?: number
}
export interface ReserveProgramOperationInput extends ExecutionClaim {
  readonly programPin: string
  readonly budget: ProgramBudget
  readonly operation: ProgramOperationName
  readonly authoredOperation: ProgramOperationName
  readonly kind: ProgramOperationKind
  readonly capability: string
  readonly inputDigest: string
  readonly input: unknown
  readonly replay: ProgramReplayPolicy
  readonly reservation: ProgramReservation
}
export type ProgramOperationOutcome =
  | { readonly _tag: "Succeeded"; readonly value: unknown; readonly tokens?: number }
  | { readonly _tag: "Failed"; readonly error: unknown }
  | { readonly _tag: "Unknown" }
export interface SettleProgramOperationInput extends ExecutionClaim {
  readonly operation: ProgramOperationName
  readonly outcome: ProgramOperationOutcome
  readonly releaseSlots: number
}

/** Atomic Program operation, budget, and durable child admission. */
export interface AdmitProgramAgentsInput extends ReserveProgramOperationInput {
  readonly fanOut: AdmitFanOutInput
  readonly suspension: ExecutionSuspension
  readonly wait: RunWait
}

/** Atomic Program operation reservation and wait creation. */
export interface SuspendProgramOperationInput extends ReserveProgramOperationInput {
  readonly suspension: ExecutionSuspension
  readonly wait: RunWait
  readonly checkpoint?: ExecutionCheckpoint
}

/** Atomic Program log reservation, event append, and settlement. */
export interface CommitProgramLogInput extends ReserveProgramOperationInput {
  readonly level: "debug" | "info" | "warn" | "error"
  readonly message: string
  readonly data?: Readonly<Record<string, Schema.Json>>
}
export interface CompleteProgramInput extends ExecutionClaim {
  readonly output: unknown
  readonly outputBytes: number
  readonly outputLimit: number
}

/** Expected Program store decisions remain typed. */
export type ProgramStoreFailure =
  | InstanceType<typeof ProgramBudgetExhausted>
  | InstanceType<typeof ProgramReplayDivergence>
  | InstanceType<typeof ProgramOperationUnknown>
