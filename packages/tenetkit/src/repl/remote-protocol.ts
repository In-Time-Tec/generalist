import { Schema } from "effect"
import { CellEvent, CellFailure, CellResult, RestartReason } from "./cell.js"
import { CheckpointKind } from "./kernel-profile.js"
import { CommandClaim } from "./kernel-resource-store.js"

const NonNegative = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))

/** @experimental Execute one authored cell under an exact storage-issued command claim. */
export const Execute = Schema.TaggedStruct("Execute", {
  claim: CommandClaim,
  code: Schema.String,
  deadlineMillis: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
})

/** @experimental Inspect one live namespace under the same fenced boundary as execution. */
export const Inspect = Schema.TaggedStruct("Inspect", {
  claim: CommandClaim,
  name: Schema.optionalKey(Schema.String),
})

/** @experimental Interrupt an earlier admitted cell under the current owner's distinct authority. */
export const Interrupt = Schema.TaggedStruct("Interrupt", {
  claim: CommandClaim,
  expectedCell: CommandClaim,
})

/** @experimental Start a new epoch without exposing provider replacement primitives. */
export const Restart = Schema.TaggedStruct("Restart", { claim: CommandClaim, reason: RestartReason })

/** @experimental Delete the current live or paused resource. */
export const Close = Schema.TaggedStruct("Close", { claim: CommandClaim })

/** @experimental The complete provider-neutral remote KernelPool command union. */
export const Command = Schema.Union([Execute, Inspect, Interrupt, Restart, Close])
/** @experimental */
export type Command = typeof Command.Type

/** @experimental The remote boundary durably admitted this exact command before acting. */
export const Admitted = Schema.TaggedStruct("Admitted", { claim: CommandClaim })

/** @experimental One ordered event for the exact admitted cell. */
export const Event = Schema.TaggedStruct("Event", { claim: CommandClaim, event: CellEvent }).check(
  Schema.makeFilter((response) => {
    const { claim, event } = response
    if (event.cellId !== claim.cellId) return { path: ["event", "cellId"], issue: "cell identity does not match claim" }
    if ("sessionId" in event && event.sessionId !== claim.sessionId) {
      return { path: ["event", "sessionId"], issue: "Session identity does not match claim" }
    }
    if ("epoch" in event && event.epoch !== claim.epoch) {
      return { path: ["event", "epoch"], issue: "kernel epoch does not match claim" }
    }
    if (event._tag === "KernelReady" && event.profileDigest !== claim.profileDigest) {
      return { path: ["event", "profileDigest"], issue: "profile digest does not match claim" }
    }
    return undefined
  }),
)

/** @experimental Proven terminal success for the exact admitted cell. */
export const Result = Schema.TaggedStruct("Result", { claim: CommandClaim, result: CellResult }).check(
  Schema.makeFilter((response) => {
    if (response.result.cellId !== response.claim.cellId) {
      return { path: ["result", "cellId"], issue: "cell identity does not match claim" }
    }
    if (response.result.epoch !== response.claim.epoch) {
      return { path: ["result", "epoch"], issue: "kernel epoch does not match claim" }
    }
    return undefined
  }),
)

/** @experimental Proven terminal failure for the exact admitted cell. */
export const Failure = Schema.TaggedStruct("Failure", { claim: CommandClaim, failure: CellFailure }).check(
  Schema.makeFilter((response) => {
    const { claim, failure } = response
    if ("sessionId" in failure && failure.sessionId !== claim.sessionId) {
      return { path: ["failure", "sessionId"], issue: "Session identity does not match claim" }
    }
    if ("cellId" in failure && failure.cellId !== undefined && failure.cellId !== claim.cellId) {
      return { path: ["failure", "cellId"], issue: "cell identity does not match claim" }
    }
    if ("epoch" in failure && failure.epoch !== claim.epoch) {
      return { path: ["failure", "epoch"], issue: "kernel epoch does not match claim" }
    }
    return undefined
  }),
)

/** @experimental Remote namespace inspection, bound to the admitted control-cell identity. */
export const Inspected = Schema.TaggedStruct("Inspected", {
  claim: CommandClaim,
  bindings: Schema.Array(Schema.Struct({ name: Schema.String, type: Schema.String, snapshotable: Schema.Boolean })),
})

/** @experimental Remote interruption outcome, bound to the admitted cell identity. */
export const Interrupted = Schema.TaggedStruct("Interrupted", {
  claim: CommandClaim,
  expectedCell: CommandClaim,
  outcome: Schema.Literals(["Interrupted", "NotRunning", "Unresponsive"]),
})

/** @experimental Remote epoch replacement with an honest account of the recovery used. */
export const Restarted = Schema.TaggedStruct("Restarted", {
  claim: CommandClaim,
  epoch: NonNegative,
  reason: RestartReason,
  recovery: CheckpointKind,
  restoredNames: Schema.Array(Schema.String),
  droppedNames: Schema.Array(Schema.String),
})

/** @experimental Proven provider deletion for the exact admitted close command. */
export const Closed = Schema.TaggedStruct("Closed", { claim: CommandClaim })

/**
 * @experimental The complete remote response union. A transport drop after `Admitted` without one
 * of the exact terminal frames is `CellOutcomeUnknown`; source is never inferred safe to replay.
 */
export const Response = Schema.Union([Admitted, Event, Result, Failure, Inspected, Interrupted, Restarted, Closed])
/** @experimental */
export type Response = typeof Response.Type
