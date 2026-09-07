import { Schema } from "effect"
import { WakeEvent } from "../../core/agent/tools/wake-event.js"
import { WaitResolution } from "../../runtime/run/wait.js"
import { RespondInput as ApprovalResponse } from "../../runtime/operation/approval.js"
import { ScheduleRecord, ScheduleReceipt } from "../../runtime/execution/trigger/schedule.js"
import { WakeDisposition } from "../../runtime/execution/trigger/wake.js"
import { RunOutcome } from "../../runtime/run.js"
import { ExternalRoot, ExternalRootSettlement, ExternalRunRef, Placement, ReserveInput } from "../../runtime/child/external/placement.js"
import { Message } from "../../runtime/messaging/message.js"
import { ExecutableManifest, ExecutableRef } from "../../runtime/executable/manifest.js"
import { ExecutableRegistration } from "../../runtime/executable/registration.js"
import { TreePolicy } from "../../runtime/tree/policy.js"
import { BudgetLimits } from "../../core/durable/run-budget.js"

const commandId = Schema.String.check(Schema.isNonEmpty())
const Response = Schema.Struct({ runId: Schema.String, waitId: Schema.String,
  resolution: WaitResolution.pipe(Schema.refine((value): value is Exclude<typeof value, { readonly _tag: "Signal" }> => value._tag !== "Signal")),
})
const Signal = Schema.Struct({ commandId, runId: Schema.String, name: Schema.String, payload: Schema.optionalKey(Schema.Unknown) })
const Cancel = Schema.Struct({ commandId, runId: Schema.String, reason: Schema.optionalKey(Schema.String) })
const CancelSession = Schema.Struct({ commandId, sessionId: Schema.String, reason: Schema.optionalKey(Schema.String) })
const Wake = Schema.Struct({ runId: Schema.String, event: WakeEvent })
const Timeout = Schema.Struct({ commandId, runId: Schema.String, waitId: Schema.String, deadline: Schema.String })
const ClaimSchedules = Schema.Struct({ commandId, ownerId: Schema.String, leaseMillis: Schema.Finite, limit: Schema.Int })
const AdvanceSchedule = Schema.Struct({ commandId, scheduleId: Schema.String, ownerId: Schema.String, occurrence: Schema.Int, nextAt: Schema.String })
const ClaimedSchedule = Schema.Struct({ ...ScheduleRecord.fields, ownerId: Schema.String, leaseExpiresAt: Schema.String })
const RootAdmission = Schema.Struct({ placementId: Schema.String, parent: ExternalRunRef, ref: ExternalRunRef,
  requestDigest: Schema.String, executableDigest: Schema.String,
  root: Schema.Struct({ message: Message, executableRef: ExecutableRef, executableManifest: ExecutableManifest,
    registrations: Schema.Array(ExecutableRegistration), treePolicy: Schema.optionalKey(TreePolicy), budget: Schema.optionalKey(BudgetLimits),
  }),
})
const Settlement = Schema.Struct({ placementId: Schema.String, settlementId: Schema.String, outcome: RunOutcome })
const SettlementAcknowledgement = Schema.Struct({ placementId: Schema.String, settlementId: Schema.String })
const key = (...parts: readonly (string | number)[]) => JSON.stringify(parts)

export const commands = {
  respond: { tag: "respond", input: Schema.Tuple([Response]), receipt: Schema.Void, identity: ([input]: readonly [typeof Response.Type]) => key(input.runId, input.waitId) },
  respondApproval: { tag: "respondApproval", input: Schema.Tuple([ApprovalResponse]), receipt: Schema.Void, identity: ([input]: readonly [typeof ApprovalResponse.Type]) => key(input.runId, input.approvalId) },
  signal: { tag: "signal", input: Schema.Tuple([Signal]), receipt: Schema.Void, identity: ([input]: readonly [typeof Signal.Type]) => input.commandId },
  cancel: { tag: "cancel", input: Schema.Tuple([Cancel]), receipt: Schema.Void, identity: ([input]: readonly [typeof Cancel.Type]) => input.commandId },
  cancelSession: { tag: "cancelSession", input: Schema.Tuple([CancelSession]), receipt: Schema.Array(Schema.String), identity: ([input]: readonly [typeof CancelSession.Type]) => input.commandId },
  wake: { tag: "wake", input: Schema.Tuple([Wake]), receipt: WakeDisposition, identity: ([input]: readonly [typeof Wake.Type]) => key(input.runId, input.event.dedupeKey) },
  timeoutAwaitEvent: { tag: "timeoutAwaitEvent", input: Schema.Tuple([Timeout]), receipt: Schema.Boolean, identity: ([input]: readonly [typeof Timeout.Type]) => input.commandId },
  registerSchedule: { tag: "registerSchedule", input: Schema.Tuple([ScheduleRecord]), receipt: ScheduleReceipt, identity: ([input]: readonly [typeof ScheduleRecord.Type]) => input.scheduleId },
  claimSchedules: { tag: "claimSchedules", input: Schema.Tuple([ClaimSchedules]), receipt: Schema.Array(ClaimedSchedule), identity: ([input]: readonly [typeof ClaimSchedules.Type]) => input.commandId },
  advanceSchedule: { tag: "advanceSchedule", input: Schema.Tuple([AdvanceSchedule]), receipt: Schema.Void, identity: ([input]: readonly [typeof AdvanceSchedule.Type]) => input.commandId },
} as const

export const externalCommands = {
  reserve: { tag: "external.reserve", input: Schema.Tuple([ReserveInput]), receipt: Placement, identity: ([input]: readonly [typeof ReserveInput.Type]) => key(input.runId, input.attemptFence, input.placementId) },
  acknowledge: { tag: "external.acknowledge", input: Schema.Tuple([Schema.String]), receipt: Placement, identity: ([id]: readonly [string]) => id },
  settle: { tag: "external.settle", input: Schema.Tuple([Settlement]), receipt: Placement, identity: ([input]: readonly [typeof Settlement.Type]) => key(input.placementId, input.settlementId) },
  cancel: { tag: "external.cancel", input: Schema.Tuple([Schema.String]), receipt: Placement, identity: ([id]: readonly [string]) => id },
  admitRoot: { tag: "external.admitRoot", input: Schema.Tuple([RootAdmission]), receipt: ExternalRoot, identity: ([input]: readonly [typeof RootAdmission.Type]) => input.placementId },
  activateRoot: { tag: "external.activateRoot", input: Schema.Tuple([Schema.String]), receipt: ExternalRoot, identity: ([id]: readonly [string]) => id },
  cancelRoot: { tag: "external.cancelRoot", input: Schema.Tuple([Schema.String, Schema.optionalKey(Schema.UndefinedOr(Schema.String))]), receipt: ExternalRoot, identity: ([id]: readonly [string, (string | undefined)?]) => id },
  acknowledgeRootSettlement: { tag: "external.acknowledgeRootSettlement", input: Schema.Tuple([SettlementAcknowledgement]), receipt: ExternalRootSettlement, identity: ([input]: readonly [typeof SettlementAcknowledgement.Type]) => key(input.placementId, input.settlementId) },
} as const
