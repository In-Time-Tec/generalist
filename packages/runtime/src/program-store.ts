import { Schema } from "effect"
import { ProgramBindings, ProgramCapabilities, ProgramManifest } from "@batonfx/core"
import type { ExecutionClaim } from "./run-store.js"
import type { AdmitFanOutInput } from "./fan-out.js"
import type { ExecutionCheckpoint, ExecutionSuspension } from "./execution-state.js"
import type { RunWait } from "./run-wait.js"
import { OperationResolution } from "./operation-resolution.js"

/** @experimental Program replay vocabulary persisted without translation. */
export const ProgramOperationKind = Schema.Literals(["tool", "step", "log", "agent", "agent-map", "agent-fan-out"])
/** @experimental */
export type ProgramOperationKind = typeof ProgramOperationKind.Type

/** @experimental */
export const ProgramOperationStatus = Schema.Literals([
  "reserved",
  "running",
  "waiting",
  "succeeded",
  "failed",
  "unknown",
])
/** @experimental */
export type ProgramOperationStatus = typeof ProgramOperationStatus.Type

/** @experimental Persisted counters and the fixed deadline for one Program Run. */
export const ProgramRunState = Schema.Struct({
  runId: Schema.String,
  programPin: Schema.String,
  budget: ProgramManifest.ProgramBudget,
  deadlineMillis: Schema.Number,
  toolCalls: Schema.Int,
  agentRuns: Schema.Int,
  tokens: Schema.Int,
  logBytes: Schema.Int,
  activeSlots: Schema.Int,
})
/** @experimental */
export type ProgramRunState = typeof ProgramRunState.Type

/** @experimental Exact durable record for one Core Program operation. */
export const ProgramOperationRecord = Schema.Struct({
  runId: Schema.String,
  operation: ProgramCapabilities.ProgramOperationName,
  kind: ProgramOperationKind,
  capability: Schema.String,
  inputDigest: Schema.String,
  input: Schema.Unknown,
  replay: ProgramBindings.ProgramReplayPolicy,
  status: ProgramOperationStatus,
  result: Schema.optionalKey(Schema.Unknown),
  error: Schema.optionalKey(Schema.Unknown),
  waitId: Schema.optionalKey(Schema.String),
  fanOutId: Schema.optionalKey(Schema.String),
  childRunIds: Schema.Array(Schema.String),
  resolutionIdempotencyKey: Schema.optionalKey(Schema.String),
  resolution: Schema.optionalKey(OperationResolution),
})
/** @experimental */
export type ProgramOperationRecord = typeof ProgramOperationRecord.Type

/** @experimental Resources atomically reserved with a Program operation. */
export interface ProgramReservation {
  readonly toolCalls?: number
  readonly agentRuns?: number
  readonly logBytes?: number
  readonly activeSlots?: number
}

/** @experimental */
export interface ReserveProgramOperationInput extends ExecutionClaim {
  readonly programPin: string
  readonly budget: ProgramManifest.ProgramBudget
  readonly nowMillis: number
  readonly operation: typeof ProgramCapabilities.ProgramOperationName.Type
  readonly kind: ProgramOperationKind
  readonly capability: string
  readonly inputDigest: string
  readonly input: unknown
  readonly replay: ProgramBindings.ProgramReplayPolicy
  readonly reservation: ProgramReservation
}

/** @experimental */
export type ProgramOperationOutcome =
  | { readonly _tag: "Succeeded"; readonly value: unknown; readonly tokens?: number }
  | { readonly _tag: "Failed"; readonly error: unknown }
  | { readonly _tag: "Unknown" }

/** @experimental */
export interface SettleProgramOperationInput extends ExecutionClaim {
  readonly operation: typeof ProgramCapabilities.ProgramOperationName.Type
  readonly outcome: ProgramOperationOutcome
  readonly releaseSlots: number
}

/** @experimental Atomic Program operation, budget, and durable child admission. */
export interface AdmitProgramAgentsInput extends ReserveProgramOperationInput {
  readonly fanOut: AdmitFanOutInput
  readonly suspension: ExecutionSuspension
  readonly wait: RunWait
}

/** @experimental Atomic Program operation reservation and wait creation. */
export interface SuspendProgramOperationInput extends ReserveProgramOperationInput {
  readonly suspension: ExecutionSuspension
  readonly wait: RunWait
  readonly checkpoint?: ExecutionCheckpoint
}

/** @experimental Atomic Program log reservation, event append, and settlement. */
export interface CommitProgramLogInput extends ReserveProgramOperationInput {
  readonly level: "debug" | "info" | "warn" | "error"
  readonly message: string
  readonly data?: Readonly<Record<string, unknown>>
}

/** @experimental */
export interface CompleteProgramInput extends ExecutionClaim {
  readonly output: unknown
  readonly outputBytes: number
  readonly outputLimit: number
}

/** @experimental Expected Program store decisions remain typed. */
export type ProgramStoreFailure =
  | InstanceType<typeof ProgramCapabilities.ProgramBudgetExhausted>
  | InstanceType<typeof ProgramCapabilities.ProgramReplayDivergence>
  | InstanceType<typeof ProgramCapabilities.ProgramOperationUnknown>
