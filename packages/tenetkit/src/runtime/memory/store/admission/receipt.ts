import type { RunReceipt } from "../../../run.js"
import type { StartReceipt } from "../../../service.js"
import { childRunIdFor, fanOutIdFor, type AdmitFanOutInput, type FanOutReceipt } from "../../../child/fan-out.js"
import { fanOutMemberSessionId } from "../../../child/session.js"
import type { AdmitStartInput } from "../../../run/store.js"
import type { MemoryState } from "../../state.js"

const newRunId = (state: MemoryState): readonly [string, MemoryState] => {
  const runId = `run_${state.nextRunCounter}`
  return [runId, { ...state, nextRunCounter: state.nextRunCounter + 1 }]
}

const duplicateReceipt = (receipt: RunReceipt): RunReceipt => ({
  runId: receipt.runId,
  messageId: receipt.messageId,
  acceptedSequence: receipt.acceptedSequence,
  duplicate: true,
})

const startReceipt = (
  receipt: RunReceipt,
  childRunIds: ReadonlyArray<string>,
  fanOuts: ReadonlyArray<FanOutReceipt>,
): StartReceipt => ({
  runId: receipt.runId,
  messageId: receipt.messageId,
  acceptedSequence: receipt.acceptedSequence,
  duplicate: receipt.duplicate,
  childRunIds,
  fanOuts,
})

type FanOutAdmissionMember = AdmitFanOutInput["members"][number]
type MutableFanOutMember = { -readonly [Key in keyof FanOutAdmissionMember]: FanOutAdmissionMember[Key] }
type MutableFanOutAdmission = { -readonly [Key in keyof AdmitFanOutInput]: AdmitFanOutInput[Key] }

const fanOutAdmissionMember = (
  fanOutId: string,
  ordinal: number,
  member: AdmitStartInput["initialFanOuts"][number]["members"][number],
): FanOutAdmissionMember => {
  const admitted: MutableFanOutMember = {
    ordinal,
    key: member.key,
    childRunId: childRunIdFor(fanOutId, ordinal),
    selection: member.selection,
    prompt: member.prompt,
    sessionId: member.sessionId ?? fanOutMemberSessionId({ fanOutId, key: member.key }),
    metadata: member.metadata ?? {},
  }
  if (member.label !== undefined) admitted.label = member.label
  if (member.origin !== undefined) admitted.origin = member.origin
  return admitted
}

const fanOutAdmission = (receipt: RunReceipt, fanOut: AdmitStartInput["initialFanOuts"][number]): AdmitFanOutInput => {
  const fanOutId = fanOutIdFor(receipt.runId, fanOut.idempotencyKey)
  const admitted: MutableFanOutAdmission = {
    fanOutId,
    parentRunId: receipt.runId,
    idempotencyKey: fanOut.idempotencyKey,
    join: fanOut.join,
    remainder: fanOut.remainder,
    members: fanOut.members.map((member, ordinal) => fanOutAdmissionMember(fanOutId, ordinal, member)),
  }
  if (fanOut.concurrency !== undefined) admitted.concurrency = Math.min(fanOut.concurrency, fanOut.members.length)
  return admitted
}

export const receiptAdmission = { duplicateReceipt, fanOutAdmission, newRunId, startReceipt }
