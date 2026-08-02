import { AiError } from "effect/unstable/ai"
import type { FailureClassification } from "./model-registry.js"

const overflowEvidence =
  /context_length_exceeded|context_window_exceeded|context_window_overflow|input_too_long|maximum context length|context (?:window|length) (?:was |has been )?exceeded|exceeds? (?:the )?(?:context window|maximum number of tokens|model'?s? maximum context)|input (?:is )?too (?:long|large)|prompt is too long|too many (?:input )?tokens/i

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const overflowEligibleReasons = new Set(["InvalidRequestError", "UnknownError", "InvalidOutputError"])

const textFields = ["message", "description", "code", "errorCode", "errorType", "error_code", "error_type"] as const
const nestedFields = ["error", "reason", "cause"] as const

const evidence = (value: unknown, depth: number): string => {
  if (depth > 4 || value === null || value === undefined) return ""
  if (typeof value === "string") return value
  if (AiError.isAiError(value)) {
    return overflowEligibleReasons.has(value.reason._tag) ? `${value.message} ${evidence(value.reason, depth + 1)}` : ""
  }
  if (!isRecord(value)) return ""
  const parts: Array<string> = []
  for (const field of textFields) {
    const candidate = value[field]
    if (typeof candidate === "string") parts.push(candidate)
  }
  for (const field of nestedFields) {
    if (field in value) parts.push(evidence(value[field], depth + 1))
  }
  if (isRecord(value.metadata)) {
    for (const entry of Object.values(value.metadata)) parts.push(evidence(entry, depth + 1))
  }
  return parts.join(" ")
}

/** @experimental Classify any model failure as a context-window overflow by its semantic evidence, independent of provider, error shape, or decode success. */
export const classify = (error: unknown): FailureClassification =>
  overflowEvidence.test(evidence(error, 0)) ? "context-overflow" : "other"
