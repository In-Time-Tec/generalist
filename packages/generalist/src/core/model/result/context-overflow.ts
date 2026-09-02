import { Option, Schema } from "effect"
import { AiError } from "effect/unstable/ai"
import type { FailureClassification } from "../registry.js"

const overflowEvidence =
  /context_length_exceeded|context_window_exceeded|context_window_overflow|input_too_long|maximum context length|context (?:window|length) (?:was |has been )?exceeded|exceeds? (?:the )?(?:context window|maximum number of tokens|model'?s? maximum context)|input (?:is )?too (?:long|large)|prompt is too long|too many (?:input )?tokens/i

const overflowEligibleReasons = new Set(["InvalidRequestError", "UnknownError", "InvalidOutputError"])

const textFields = ["message", "description", "code", "errorCode", "errorType", "error_code", "error_type"] as const
const nestedFields = ["error", "reason", "cause"] as const

const EvidenceRecord = Schema.Record(Schema.String, Schema.Unknown)

const evidence = (cause: unknown, depth: number): string => {
  if (depth > 4 || cause === null || cause === undefined) return ""
  if (AiError.isAiError(cause)) {
    return overflowEligibleReasons.has(cause.reason._tag) ? `${cause.message} ${evidence(cause.reason, depth + 1)}` : ""
  }
  const decodedString = Schema.decodeUnknownOption(Schema.String)(cause)
  if (Option.isSome(decodedString)) return decodedString.value
  const decodedRecord = Schema.decodeUnknownOption(EvidenceRecord)(cause)
  if (Option.isNone(decodedRecord)) return ""
  const record = decodedRecord.value
  const parts: Array<string> = []
  for (const field of textFields) {
    const candidate = Schema.decodeUnknownOption(Schema.String)(record[field])
    if (Option.isSome(candidate)) parts.push(candidate.value)
  }
  for (const field of nestedFields) {
    if (field in record) parts.push(evidence(record[field], depth + 1))
  }
  const metadata = Schema.decodeUnknownOption(EvidenceRecord)(record.metadata)
  if (Option.isSome(metadata)) {
    for (const entry of Object.values(metadata.value)) parts.push(evidence(entry, depth + 1))
  }
  return parts.join(" ")
}

/** Classify every model failure as a context-window overflow by its semantic evidence, independent of provider, error shape, or decode success. */
export const classify = (cause: unknown): FailureClassification =>
  overflowEvidence.test(evidence(cause, 0)) ? "context-overflow" : "other"
