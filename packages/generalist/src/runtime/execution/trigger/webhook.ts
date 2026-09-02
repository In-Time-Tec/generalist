import { Clock, Crypto, Effect, Function, PlatformError, Redacted, Schema } from "effect"
import type { WakeEvent } from "../../../core/agent/tools/wake-event.js"
import { ActionableTaggedError, errorHint } from "../../../core/error-hint.js"

type Secret = Redacted.Redacted<string>

export type Signature =
  | { readonly _tag: "GitHub"; readonly secret: Secret }
  | { readonly _tag: "Slack"; readonly secret: Secret; readonly toleranceSeconds?: number }
  | {
      readonly _tag: "HmacSha256"
      readonly secret: Secret
      readonly header: string
      readonly prefix?: string
    }
  | { readonly _tag: "Unsigned" }

export interface WebhookSource<Payload extends Schema.Top> {
  readonly source: string
  readonly payload: Payload
  readonly signature: Signature
}

export interface Ingestion<Payload> {
  readonly payload: Payload
  readonly event: Extract<WakeEvent, { readonly _tag: "Webhook" }>
}

/** A webhook payload or signature failed its configured source boundary. */
export class WebhookRejected extends ActionableTaggedError<WebhookRejected>()("generalist/runtime/WebhookRejected", {
  source: Schema.String,
  reason: Schema.Literals(["invalid-payload", "invalid-signature", "missing-dedupe-key", "stale-request"]),
  hint: errorHint("Verify the raw request body, source Schema, delivery identity, and signature headers."),
}) {}

export const source = <Payload extends Schema.Top>(definition: WebhookSource<Payload>): WebhookSource<Payload> =>
  definition
export const github = (secret: Secret): Signature => ({ _tag: "GitHub", secret })
export const slack: {
  (toleranceSeconds: number): (secret: Secret) => Signature
  (secret: Secret, toleranceSeconds: number): Signature
} = Function.dual(
  2,
  (secret: Secret, toleranceSeconds: number): Signature => ({
    _tag: "Slack",
    secret,
    toleranceSeconds,
  }),
)
export interface HmacSha256Options {
  readonly header: string
  readonly prefix?: string
}
export const hmacSha256: {
  (options: HmacSha256Options): (secret: Secret) => Signature
  (secret: Secret, options: HmacSha256Options): Signature
} = Function.dual(
  2,
  (secret: Secret, options: HmacSha256Options): Signature => ({
    _tag: "HmacSha256",
    secret,
    header: options.header,
    ...(options.prefix === undefined ? undefined : { prefix: options.prefix }),
  }),
)
export const unsigned: Signature = { _tag: "Unsigned" }

const encoder = new TextEncoder()
const bytes = (value: string): Uint8Array => encoder.encode(value)

const digest = (value: Uint8Array) => Effect.flatMap(Crypto.Crypto, (crypto) => crypto.digest("SHA-256", value))

const hmac = (secret: Secret, value: string): Effect.Effect<Uint8Array, PlatformError.PlatformError, Crypto.Crypto> =>
  Effect.gen(function* () {
    let key = bytes(Redacted.value(secret))
    if (key.length > 64) key = yield* digest(key)
    const block = new Uint8Array(64)
    block.set(key)
    const innerPad = block.map((byte) => byte ^ 0x36)
    const outerPad = block.map((byte) => byte ^ 0x5c)
    const body = bytes(value)
    const inner = new Uint8Array(innerPad.length + body.length)
    inner.set(innerPad)
    inner.set(body, innerPad.length)
    const innerDigest = yield* digest(inner)
    const outer = new Uint8Array(outerPad.length + innerDigest.length)
    outer.set(outerPad)
    outer.set(innerDigest, outerPad.length)
    return yield* digest(outer)
  })

const hex = (value: Uint8Array): string => [...value].map((byte) => byte.toString(16).padStart(2, "0")).join("")

const equal = (left: string, right: string): boolean => {
  if (left.length !== right.length) return false
  let different = 0
  for (let index = 0; index < left.length; index++) different |= left.charCodeAt(index) ^ right.charCodeAt(index)
  return different === 0
}

const normalizeHeaders = (headers: Readonly<Record<string, string>>): Readonly<Record<string, string>> =>
  Object.fromEntries(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]))

const rejected = (sourceName: string, reason: WebhookRejected["reason"]): WebhookRejected =>
  WebhookRejected.make({ source: sourceName, reason })

const verify = (sourceName: string, signature: Signature, body: string, headers: Readonly<Record<string, string>>) =>
  Effect.gen(function* () {
    if (signature._tag === "Unsigned") return
    if (signature._tag === "Slack") {
      const timestamp = headers["x-slack-request-timestamp"]
      const provided = headers["x-slack-signature"]
      const seconds = Number(timestamp)
      const tolerance = signature.toleranceSeconds ?? 300
      const now = yield* Clock.currentTimeMillis
      if (
        !Number.isSafeInteger(seconds) ||
        !Number.isSafeInteger(tolerance) ||
        tolerance < 0 ||
        Math.abs(Math.floor(now / 1_000) - seconds) > tolerance
      ) {
        return yield* rejected(sourceName, "stale-request")
      }
      const expected = `v0=${hex(yield* hmac(signature.secret, `v0:${timestamp}:${body}`))}`
      if (provided === undefined || !equal(expected, provided.toLowerCase())) {
        return yield* rejected(sourceName, "invalid-signature")
      }
      return
    }
    const header = signature._tag === "GitHub" ? "x-hub-signature-256" : signature.header.toLowerCase()
    const prefix = signature._tag === "GitHub" ? "sha256=" : (signature.prefix ?? "")
    const provided = headers[header]
    const expected = `${prefix}${hex(yield* hmac(signature.secret, body))}`
    if (provided === undefined || !equal(expected, provided.toLowerCase())) {
      return yield* rejected(sourceName, "invalid-signature")
    }
  })

const parseBody = (sourceName: string, body: string): Effect.Effect<Schema.Json, WebhookRejected> =>
  Schema.decodeEffect(Schema.fromJsonString(Schema.Json))(body).pipe(
    Effect.mapError(() => rejected(sourceName, "invalid-payload")),
  )

const signatureDedupeKey = (signature: Signature, headers: Readonly<Record<string, string>>): string | undefined => {
  switch (signature._tag) {
    case "GitHub":
      return headers["x-github-delivery"]
    case "Slack":
      return headers["x-slack-signature"]
    case "HmacSha256":
      return headers[signature.header.toLowerCase()]
    case "Unsigned":
      return undefined
  }
}

/** Verify a raw request, validate its source-specific payload, and produce a wake event. */
export const ingestWebhook = <Payload extends Schema.Top>(input: {
  readonly source: WebhookSource<Payload>
  readonly body: string
  readonly headers: Readonly<Record<string, string>>
  readonly dedupeKey?: string
}): Effect.Effect<
  Ingestion<Payload["Type"]>,
  WebhookRejected | PlatformError.PlatformError,
  Crypto.Crypto | Payload["DecodingServices"]
> =>
  Effect.gen(function* () {
    const headers = normalizeHeaders(input.headers)
    yield* verify(input.source.source, input.source.signature, input.body, headers)
    const raw = yield* parseBody(input.source.source, input.body)
    const payload = yield* Schema.decodeEffect(input.source.payload, { onExcessProperty: "error" })(raw).pipe(
      Effect.mapError(() => rejected(input.source.source, "invalid-payload")),
    )
    const dedupeKey = input.dedupeKey ?? signatureDedupeKey(input.source.signature, headers)
    if (dedupeKey === undefined || dedupeKey.length === 0) {
      return yield* rejected(input.source.source, "missing-dedupe-key")
    }
    return {
      payload,
      event: {
        _tag: "Webhook",
        dedupeKey,
        source: input.source.source,
        payload: raw,
        headers,
      },
    }
  })
