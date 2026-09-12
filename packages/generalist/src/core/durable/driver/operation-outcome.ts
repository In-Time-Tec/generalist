import { Cause, Exit, Schema } from "effect"
import { HookFailed } from "../../../hooks/index.js"
import { Suspended } from "../../tools/nested-operation.js"
import { Exhausted } from "../run-budget.js"
import type { DriverOperation, OperationOutcome } from "./contract.js"

export class AdmissionExhausted extends Exhausted {}
export const isAdmissionExhausted = Schema.is(Schema.instanceOf(AdmissionExhausted))

const outcomeFromExit = <E>(operation: DriverOperation, exit: Exit.Exit<unknown, E>): OperationOutcome | undefined => {
  if (Exit.isSuccess(exit)) return { _tag: "Succeeded", value: exit.value }
  const reason = exit.cause.reasons[0]
  if (exit.cause.reasons.length === 1 && reason !== undefined && Cause.isFailReason(reason)) {
    if (
      operation.kind === "hook" &&
      operation.replayPolicy !== "never" &&
      Schema.is(HookFailed)(reason.error) &&
      Schema.is(Suspended)(reason.error.cause)
    )
      return undefined
    return { _tag: "Failed", error: reason.error }
  }
  return operation.replayPolicy === "never" ? { _tag: "Unknown", operationId: operation.key } : undefined
}

export const OperationOutcomeResolution = { outcomeFromExit }
