import { Cause, Exit } from "effect"
import type { DriverOperation, OperationOutcome } from "./contract.js"

const outcomeFromExit = <E>(operation: DriverOperation, exit: Exit.Exit<unknown, E>): OperationOutcome | undefined => {
  if (Exit.isSuccess(exit)) return { _tag: "Succeeded", value: exit.value }
  const reason = exit.cause.reasons[0]
  if (exit.cause.reasons.length === 1 && reason !== undefined && Cause.isFailReason(reason)) {
    return { _tag: "Failed", error: reason.error }
  }
  return operation.replayPolicy === "never" ? { _tag: "Unknown", operationId: operation.key } : undefined
}

export const OperationOutcomeResolution = { outcomeFromExit }
