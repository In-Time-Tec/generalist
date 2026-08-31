import { DateTime, Equal, Function, Schema } from "effect"
import { EntryPayload } from "../../../core/context/session.js"

const decodeEntry = Schema.decodeUnknownSync(EntryPayload)
const encodeEntry = Schema.encodeSync(EntryPayload)
const CODEC_MARKER = "generalist/runtime/session-codec"
const UNDEFINED_MARKER = { [CODEC_MARKER]: "undefined" }
const EncodedRecordSchema = Schema.Record(Schema.String, Schema.Unknown)
const EncodedArraySchema = Schema.Array(Schema.Unknown)
type EncodedValue = typeof Schema.Unknown.Type
type EncodedRecord = typeof EncodedRecordSchema.Type
const decodeEncodedRecord = Schema.decodeUnknownSync(EncodedRecordSchema)

const encodeObject = (value: EncodedRecord): EncodedRecord =>
  Object.fromEntries(Object.entries(value).map(([key, item]) => [key, withUndefinedMarkers(item)]))

const withUndefinedMarkers = (value: EncodedValue): EncodedValue => {
  if (value === undefined) return UNDEFINED_MARKER
  if (Schema.is(EncodedArraySchema)(value)) return value.map(withUndefinedMarkers)
  if (!Schema.is(EncodedRecordSchema)(value)) return value
  const encoded = encodeObject(value)
  return CODEC_MARKER in encoded ? { [CODEC_MARKER]: "escaped", value: encoded } : encoded
}

const decodeObject = (value: EncodedRecord): EncodedRecord =>
  Object.fromEntries(Object.entries(value).map(([key, item]) => [key, withoutUndefinedMarkers(item)]))

const withoutUndefinedMarkers = (value: EncodedValue): EncodedValue => {
  if (Schema.is(EncodedArraySchema)(value)) return value.map(withoutUndefinedMarkers)
  if (!Schema.is(EncodedRecordSchema)(value)) return value
  const encoded = decodeEncodedRecord(value)
  if (encoded[CODEC_MARKER] === "undefined" && Object.keys(encoded).length === 1) return undefined
  if (encoded[CODEC_MARKER] === "escaped" && Object.keys(encoded).length === 2 && "value" in encoded) {
    const escaped = encoded.value
    if (!Schema.is(EncodedRecordSchema)(escaped)) {
      throw new Error("Session payload escape marker is corrupt")
    }
    return decodeObject(decodeEncodedRecord(escaped))
  }
  return decodeObject(encoded)
}

const isRecord = Schema.is(EncodedRecordSchema)

const restoreHeaders = (details: EncodedValue): EncodedValue => {
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

const restoreRedactedHeaders = (value: EncodedValue): EncodedValue => {
  if (!isRecord(value) || value._tag !== "ModelResponse" || !Schema.is(EncodedArraySchema)(value.content)) return value
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

type PayloadIdentity = ReadonlyArray<EncodedValue>

const collectionIdentity = (value: EncodedValue, seen: Set<EncodedValue>): PayloadIdentity | undefined => {
  if (DateTime.isDateTime(value)) return ["String", DateTime.formatIso(value)]
  if (value instanceof Date) return ["String", value.toISOString()]
  if (value instanceof Map) {
    const entries = [...value.entries()]
      .map(([key, item]) => [payloadIdentity(key, seen), payloadIdentity(item, seen)] as const)
      .toSorted((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
    return ["Map", entries]
  }
  if (value instanceof Set) {
    const entries = [...value]
      .map((item) => payloadIdentity(item, seen))
      .toSorted((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
    return ["Set", entries]
  }
  return undefined
}

const payloadIdentity = (value: EncodedValue, seen: Set<EncodedValue>): PayloadIdentity => {
  if (value === null) return ["Null"]
  if (Schema.is(Schema.Boolean)(value)) return ["Boolean", value]
  if (Schema.is(Schema.String)(value)) return ["String", value]
  if (Schema.is(Schema.Finite)(value)) return ["Number", Object.is(value, -0) ? "-0" : String(value)]
  if (Schema.is(Schema.BigInt)(value)) return ["BigInt", value.toString()]
  if (value === undefined) return ["Undefined"]
  if (Schema.is(Schema.Symbol)(value)) return ["Symbol", value.description ?? ""]
  if (seen.has(value)) return ["Cycle"]
  seen.add(value)
  if (Schema.is(EncodedArraySchema)(value)) {
    const items = value.map((item) => payloadIdentity(item, seen))
    seen.delete(value)
    return ["Array", items]
  }
  const collection = collectionIdentity(value, seen)
  if (collection !== undefined) {
    seen.delete(value)
    return collection
  }
  if (!isRecord(value)) return ["Function"]
  const entries = Object.entries(value)
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => [key, payloadIdentity(item, seen)] as const)
  seen.delete(value)
  return ["Object", entries]
}

const payloadOnly = (value: EntryPayload): EncodedRecord =>
  Object.fromEntries(
    Object.entries(decodeEncodedRecord(encodeEntry(value))).filter(([key]) => key !== "id" && key !== "parentId"),
  )

const sessionPayloadEquivalenceImpl = (self: EntryPayload, that: EntryPayload): boolean =>
  Equal.equals(payloadIdentity(payloadOnly(self), new Set()), payloadIdentity(payloadOnly(that), new Set()))

export const sessionPayloadEquivalence: {
  (that: EntryPayload): (self: EntryPayload) => boolean
  (self: EntryPayload, that: EntryPayload): boolean
} = Function.dual(2, sessionPayloadEquivalenceImpl)

export const decodeSessionPayload = (text: string): EntryPayload =>
  decodeEntry(
    restoreRedactedHeaders(withoutUndefinedMarkers(Schema.decodeUnknownSync(Schema.Unknown)(JSON.parse(text)))),
  )

export const encodeSessionPayload = (payload: EntryPayload): string =>
  JSON.stringify(withUndefinedMarkers(encodeEntry(payload))) ?? "null"
