import { Effect } from "effect"
import { DurabilityFailure } from "../errors.js"
import { commands as admissions } from "./runtime-command-admission.js"
import { commands as operations } from "./runtime-command-operation.js"
import { defaultMaxStateBytes } from "./journal.js"

const admissionCommands = new Set<string>([
  admissions.admitSend.tag,
  admissions.admitStart.tag,
  admissions.admitSpawn.tag,
  admissions.admitProgramChild.tag,
  admissions.admitProgramChildAndSuspend.tag,
  admissions.admitSteering.tag,
  admissions.admitRollback.tag,
  admissions.admitFanOut.tag,
  admissions.fork.tag,
  admissions.submitSessionInput.tag,
  admissions.updateSessionInput.tag,
  admissions.createHostSession.tag,
  operations.recordOperation.tag,
  operations.startOperation.tag,
  operations.reserveProgramOperation.tag,
  operations.startProgramOperation.tag,
  operations.admitProgramAgents.tag,
])

export const make = (options: { readonly maxStateBytes?: number; readonly admissionReserveBytes?: number }) =>
  Effect.gen(function* () {
    const maxStateBytes = options.maxStateBytes ?? defaultMaxStateBytes
    const reserve = options.admissionReserveBytes ?? Math.floor(maxStateBytes / 4)
    if (!Number.isSafeInteger(reserve) || reserve <= 0 || reserve >= maxStateBytes) {
      return yield* DurabilityFailure.make({
        reason: "configuration",
        message: "admissionReserveBytes must be a positive safe integer below maxStateBytes",
      })
    }
    return (command: string) => (admissionCommands.has(command) ? reserve : 0)
  })
