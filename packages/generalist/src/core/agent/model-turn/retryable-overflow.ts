import { Option, Schema, type Cause } from "effect"
import { AgentError } from "../event.js"
import { singleFailure } from "./parts.js"

export const make =
  (input: {
    readonly retryOverflow: boolean
    readonly canCompact: boolean
    readonly classify: <E>(error: E) => string
  }) =>
  (cause: Cause.Cause<unknown>, hasEmitted: boolean): boolean => {
    const failure = singleFailure(cause)
    if (Option.isNone(failure)) return false
    const error =
      Schema.is(AgentError)(failure.value) && failure.value.cause !== undefined ? failure.value.cause : failure.value
    return input.retryOverflow && !hasEmitted && input.canCompact && input.classify(error) === "context-overflow"
  }
