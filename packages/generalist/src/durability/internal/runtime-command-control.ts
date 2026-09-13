import { Schema, type Types } from "effect"
import { ExecutionClaim } from "./runtime-state/schema.js"
import { WakeEvent } from "../../core/agent/tools/wake-event.js"
import { WaitResolution } from "../../runtime/run/wait.js"
import { RespondInput as ApprovalResponse } from "../../runtime/operation/approval.js"
import { ScheduleRecord, ScheduleReceipt } from "../../runtime/execution/trigger/schedule.js"
import { WakeDisposition } from "../../runtime/execution/trigger/wake.js"

const commandId = Schema.String.check(Schema.isNonEmpty())
const Response = Schema.Struct({
  runId: Schema.String,
  waitId: Schema.String,
  resolution: WaitResolution.pipe(
    Schema.refine((value): value is Exclude<typeof value, { readonly _tag: "Signal" }> => value._tag !== "Signal"),
  ),
})
const Signal = Schema.Struct({
  commandId,
  runId: Schema.String,
  name: Schema.String,
  payload: Schema.optionalKey(Schema.Unknown),
})
const Cancel = Schema.Struct({ commandId, runId: Schema.String, reason: Schema.optionalKey(Schema.String) })
const CancelScopedChild = Schema.Struct({
  ...ExecutionClaim.fields,
  commandId,
  childRunId: Schema.String,
  reason: Schema.optionalKey(Schema.String),
})
const CancelSession = Schema.Struct({ commandId, sessionId: Schema.String, reason: Schema.optionalKey(Schema.String) })
const Wake = Schema.Struct({ commandId, runId: Schema.String, event: WakeEvent })
const Timeout = Schema.Struct({ commandId, runId: Schema.String, waitId: Schema.String, deadline: Schema.String })
const ClaimSchedules = Schema.Struct({
  commandId,
  ownerId: Schema.String,
  leaseMillis: Schema.Finite,
  limit: Schema.Int,
})
const AdvanceSchedule = Schema.Struct({
  commandId,
  scheduleId: Schema.String,
  ownerId: Schema.String,
  occurrence: Schema.Int,
  nextAt: Schema.String,
})
const ClaimedSchedule = Schema.Struct({
  ...ScheduleRecord.fields,
  ownerId: Schema.String,
  leaseExpiresAt: Schema.String,
})
const key = (...parts: readonly (string | number)[]) => JSON.stringify(parts)

/**
 * A schedule's durable identity is the caller's stable definition: schedule id, normalized
 * recurrence, and captured definition. `nextAt`, `occurrence`, `status`, and `createdAt` are
 * derived from the registration clock, so projecting them to fixed values keeps the journal
 * input digest time-independent — otherwise a restart re-asserting the same schedule conflicts
 * with its own retained receipt.
 */
const scheduleDigestInput = ([record]: readonly [ScheduleRecord]): readonly [ScheduleRecord] => [
  { ...record, nextAt: "", occurrence: 0, status: "active", createdAt: "" },
]

export const commands = {
  respond: {
    tag: "respond",
    input: Schema.Tuple([Response]),
    receipt: Schema.Void,
    identity: ([input]: readonly [typeof Response.Type]) => key(input.runId, input.waitId),
  },
  respondApproval: {
    tag: "respondApproval",
    input: Schema.Tuple([ApprovalResponse]),
    receipt: Schema.Void,
    identity: ([input]: readonly [ApprovalResponse]) => input.commandId ?? key(input.runId, input.approvalId),
  },
  signal: {
    tag: "signal",
    input: Schema.Tuple([Signal]),
    receipt: Schema.Void,
    identity: ([input]: readonly [typeof Signal.Type]) => input.commandId,
  },
  cancel: {
    tag: "cancel",
    input: Schema.Tuple([Cancel]),
    receipt: Schema.Void,
    identity: ([input]: readonly [typeof Cancel.Type]) => input.commandId,
  },
  cancelScopedChild: {
    tag: "cancelScopedChild",
    input: Schema.Tuple([CancelScopedChild]),
    receipt: Schema.Void,
    identity: ([input]: readonly [typeof CancelScopedChild.Type]) => key(input.runId, input.commandId),
    digestInput: ([input]: readonly [typeof CancelScopedChild.Type]): readonly [typeof CancelScopedChild.Type] => {
      const normalized: Types.Mutable<typeof CancelScopedChild.Type> = {
        runId: input.runId,
        ownerId: "",
        attemptFence: 0,
        commandId: input.commandId,
        childRunId: input.childRunId,
      }
      if (input.reason !== undefined) normalized.reason = input.reason
      return [normalized]
    },
  },
  cancelSession: {
    tag: "cancelSession",
    input: Schema.Tuple([CancelSession]),
    receipt: Schema.Array(Schema.String),
    identity: ([input]: readonly [typeof CancelSession.Type]) => input.commandId,
  },
  wake: {
    tag: "wake",
    input: Schema.Tuple([Wake]),
    receipt: WakeDisposition,
    identity: ([input]: readonly [typeof Wake.Type]) => input.commandId,
  },
  timeoutAwaitEvent: {
    tag: "timeoutAwaitEvent",
    input: Schema.Tuple([Timeout]),
    receipt: Schema.Boolean,
    identity: ([input]: readonly [typeof Timeout.Type]) => input.commandId,
  },
  registerSchedule: {
    tag: "registerSchedule",
    input: Schema.Tuple([ScheduleRecord]),
    receipt: ScheduleReceipt,
    identity: ([input]: readonly [ScheduleRecord]) => input.scheduleId,
    digestInput: scheduleDigestInput,
  },
  claimSchedules: {
    tag: "claimSchedules",
    input: Schema.Tuple([ClaimSchedules]),
    receipt: Schema.Array(ClaimedSchedule),
    identity: ([input]: readonly [typeof ClaimSchedules.Type]) => input.commandId,
  },
  advanceSchedule: {
    tag: "advanceSchedule",
    input: Schema.Tuple([AdvanceSchedule]),
    receipt: Schema.Void,
    identity: ([input]: readonly [typeof AdvanceSchedule.Type]) => input.commandId,
  },
} as const

export { externalChildCommands } from "./runtime-external-child-command-control.js"
export { externalRootCommands } from "./runtime-external-root-command-control.js"
