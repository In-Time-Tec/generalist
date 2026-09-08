import { Effect, Schema } from "effect"
import { DriverStateInvalid } from "../service.js"

const Identity = Schema.String.check(Schema.isPattern(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/))

/** Pin one component's ownership, schema, transition handler, and byte bounds. @experimental */
export const Descriptor = Schema.Struct({
  version: Schema.Literal("1"),
  key: Identity,
  instance: Identity,
  schemaVersion: Identity,
  handler: Identity,
  handlerVersion: Identity,
  scope: Schema.Literals(["run", "session"]),
  access: Schema.optionalKey(Schema.Literal("session-owner")),
  inheritance: Schema.optionalKey(Schema.Literal("none")),
  branch: Schema.Literal("restore"),
  redaction: Schema.Literal("visible"),
  maxStateBytes: Schema.Int.check(Schema.isGreaterThan(0)),
  maxCommandBytes: Schema.Int.check(Schema.isGreaterThan(0)),
  maxReceiptBytes: Schema.Int.check(Schema.isGreaterThan(0)),
}).check(
  Schema.makeFilter(
    (descriptor) =>
      (descriptor.scope === "run" && descriptor.access === undefined && descriptor.inheritance === undefined) ||
      (descriptor.scope === "session" && descriptor.access === "session-owner" && descriptor.inheritance === "none") ||
      "Session components require explicit owner access and no inheritance",
  ),
)
/** Component ownership and codec contract. @experimental */
export type Descriptor = typeof Descriptor.Type

export const bounded = (input: {
  readonly value: unknown
  readonly limit: number
}): Effect.Effect<Schema.Json, DriverStateInvalid> =>
  Schema.decodeUnknownEffect(Schema.Json)(input.value).pipe(
    Effect.mapError(() => DriverStateInvalid.make({ message: "Component data must be JSON" })),
    Effect.flatMap((json) => {
      const codec = Schema.fromJsonString(Schema.Json)
      const text = Schema.encodeSync(codec)(json)
      return new TextEncoder().encode(text).byteLength <= input.limit
        ? Effect.succeed(Schema.decodeSync(codec)(text))
        : DriverStateInvalid.make({ message: "Component byte bound exceeded" })
    }),
  )

export const namespace = (descriptor: Descriptor): string => JSON.stringify([descriptor.key, descriptor.instance])
