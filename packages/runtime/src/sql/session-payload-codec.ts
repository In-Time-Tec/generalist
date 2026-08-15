import { Schema } from "effect"
import { Session } from "@batonfx/core"

const decodeEntry = Schema.decodeUnknownSync(Session.EntryPayload)
const encodeEntry = Schema.encodeSync(Session.EntryPayload)
const CODEC_MARKER = "@batonfx/runtime/session-codec"
const UNDEFINED_MARKER = { [CODEC_MARKER]: "undefined" }

const encodeObject = (value: object): Record<string, unknown> =>
  Object.fromEntries(Object.entries(value).map(([key, item]) => [key, withUndefinedMarkers(item)]))

const withUndefinedMarkers = (value: unknown): unknown => {
  if (value === undefined) return UNDEFINED_MARKER
  if (Array.isArray(value)) return value.map(withUndefinedMarkers)
  if (typeof value !== "object" || value === null) return value
  const encoded = encodeObject(value)
  return CODEC_MARKER in encoded ? { [CODEC_MARKER]: "escaped", value: encoded } : encoded
}

const decodeObject = (value: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(value).map(([key, item]) => [key, withoutUndefinedMarkers(item)]))

const withoutUndefinedMarkers = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(withoutUndefinedMarkers)
  if (typeof value !== "object" || value === null) return value
  const encoded = value as Record<string, unknown>
  if (encoded[CODEC_MARKER] === "undefined" && Object.keys(encoded).length === 1) return undefined
  if (encoded[CODEC_MARKER] === "escaped" && Object.keys(encoded).length === 2 && "value" in encoded) {
    const escaped = encoded.value
    if (typeof escaped !== "object" || escaped === null || Array.isArray(escaped)) {
      throw new Error("Session payload escape marker is corrupt")
    }
    return decodeObject(escaped as Record<string, unknown>)
  }
  return decodeObject(encoded)
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const restoreHeaders = (details: unknown): unknown => {
  if (!isRecord(details) || !isRecord(details.headers)) return details
  return {
    ...details,
    headers: Object.fromEntries(
      Object.entries(details.headers).map(([key, value]) => [
        key,
        isRecord(value) && Object.keys(value).length === 0 ? "<redacted>" : value,
      ]),
    ),
  }
}

const restoreV026RedactedHeaders = (value: unknown): unknown => {
  if (!isRecord(value) || value._tag !== "ModelResponse" || !Array.isArray(value.content)) return value
  return {
    ...value,
    content: value.content.map((part) => {
      if (!isRecord(part)) return part
      if (part.type === "response-metadata") return { ...part, request: restoreHeaders(part.request) }
      if (part.type === "finish") return { ...part, response: restoreHeaders(part.response) }
      return part
    }),
  }
}

export const decodeSessionPayload = (text: string): Session.EntryPayload =>
  decodeEntry(restoreV026RedactedHeaders(withoutUndefinedMarkers(JSON.parse(text) as unknown)))

export const encodeSessionPayload = (payload: Session.EntryPayload): string =>
  JSON.stringify(withUndefinedMarkers(encodeEntry(payload))) ?? "null"
