import { AgentExecutionFailure } from "./errors.js"

export const failureMessage = (message: string): string => {
  const trimmed = message.trim()
  return trimmed.length === 0 ? "Agent execution failed" : trimmed
}

export const compactionOptionsMismatch = AgentExecutionFailure.make({
  message: "Resolved compaction options do not match Agent manifest",
})

export const undecodableSuspension = AgentExecutionFailure.make({
  message: "Persisted suspension could not be decoded",
})
