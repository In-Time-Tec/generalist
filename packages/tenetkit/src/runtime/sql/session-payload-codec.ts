import { Equal, Function, Schema } from "effect"
import { Session } from "tenetkit"

const decodeEntry = Schema.decodeUnknownSync(Session.EntryPayload)
const encodeEntry = Schema.encodeSync(Session.EntryPayload)
const CODEC_MARKER = "tenetkit/runtime/session-codec"
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

const restoreRedactedHeaders = (value: unknown): unknown => {
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

type PayloadIdentity = ReadonlyArray<unknown>

const payloadIdentity = (value: unknown, seen: Set<object>): PayloadIdentity => {
  if (value === null) return ["Null"]
  if (typeof value === "boolean") return ["Boolean", value]
  if (typeof value === "string") return ["String", value]
  if (typeof value === "number") return ["Number", Object.is(value, -0) ? "-0" : String(value)]
  if (typeof value === "bigint") return ["BigInt", value.toString()]
  if (typeof value === "undefined") return ["Undefined"]
  if (typeof value === "symbol") return ["Symbol", String(value.description ?? "")]
  if (typeof value === "function") return ["Function", value.name]
  if (seen.has(value)) return ["Cycle"]
  seen.add(value)
  if (Array.isArray(value)) {
    const items = value.map((item) => payloadIdentity(item, seen))
    seen.delete(value)
    return ["Array", items]
  }
  if (value instanceof Date) {
    seen.delete(value)
    return ["Date", value.toISOString()]
  }
  if (value instanceof Map) {
    const entries = [...value.entries()]
      .map(([key, item]) => [payloadIdentity(key, seen), payloadIdentity(item, seen)] as const)
      .toSorted((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
    seen.delete(value)
    return ["Map", entries]
  }
  if (value instanceof Set) {
    const entries = [...value]
      .map((item) => payloadIdentity(item, seen))
      .toSorted((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
    seen.delete(value)
    return ["Set", entries]
  }
  const entries = Reflect.ownKeys(value)
    .filter((key) => Object.prototype.propertyIsEnumerable.call(value, key))
    .map(
      (key) =>
        [
          typeof key === "symbol"
            ? (["SymbolKey", String(key.description ?? "")] as const)
            : (["StringKey", key] as const),
          key,
        ] as const,
    )
    .toSorted(([left], [right]) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
    .map(([key, original]) => [key, payloadIdentity(value[original as keyof typeof value], seen)] as const)
  seen.delete(value)
  return ["Object", entries]
}

const payloadOnly = (value: Session.EntryPayload): Session.EntryPayload => {
  const {
    id: _id,
    parentId: _parentId,
    ...payload
  } = value as Session.EntryPayload & {
    readonly id?: string
    readonly parentId?: string | null
  }
  return payload as Session.EntryPayload
}

const sessionPayloadEquivalenceImpl = (self: Session.EntryPayload, that: Session.EntryPayload): boolean =>
  Equal.equals(payloadIdentity(payloadOnly(self), new Set()), payloadIdentity(payloadOnly(that), new Set()))

export const sessionPayloadEquivalence: {
  (that: Session.EntryPayload): (self: Session.EntryPayload) => boolean
  (self: Session.EntryPayload, that: Session.EntryPayload): boolean
} = Function.dual(2, sessionPayloadEquivalenceImpl)

export const decodeSessionPayload = (text: string): Session.EntryPayload =>
  decodeEntry(restoreRedactedHeaders(withoutUndefinedMarkers(JSON.parse(text) as unknown)))

export const encodeSessionPayload = (payload: Session.EntryPayload): string =>
  JSON.stringify(withUndefinedMarkers(encodeEntry(payload))) ?? "null"
