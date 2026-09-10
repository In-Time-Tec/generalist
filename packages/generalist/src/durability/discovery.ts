import { Effect, Schema } from "effect"
import { ObjectStore, ObjectStoreFailure, type Service } from "./object-store.js"
import {
  Scope as MarkerScope,
  Identity,
  maxMarkerBytes,
  transport,
  Marker,
  markerKey,
  tenantPrefix,
} from "./internal/discovery-marker.js"
import { make } from "./internal/journal.js"
import { Page as ProtocolPage, failure, decode, parse, equalBytes, bytes } from "./internal/protocol.js"

/** Authorized tenant scope for read-only partition discovery. @experimental */
export type Scope = typeof MarkerScope.Type
/** An immutable partition location; inspect its journal before activation. @experimental */
export type Location = typeof Identity.Type
const Cursor = Schema.Struct({
  version: Schema.Literal(1),
  environment: Schema.String,
  tenant: Schema.String,
  provider: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(8192)),
})
const maxPageKeys = 1000
const CursorJson = Schema.fromJsonString(Cursor)
const Page = Schema.Struct({ keys: ProtocolPage.fields.keys, cursor: Schema.optionalKey(Cursor.fields.provider) })

const locationAt = (input: { readonly scope: Scope; readonly key: string }) =>
  Effect.gen(function* () {
    const store = yield* ObjectStore
    const object = yield* store.read(input.key, { maxBytes: maxMarkerBytes }).pipe(Effect.mapError(transport))
    if (object === undefined)
      return yield* failure({
        reason: "corruption",
        message: "Retained discovery marker is missing",
        key: input.key,
      })
    if (object.bytes.length > maxMarkerBytes)
      return yield* failure({
        reason: "limit",
        message: "Discovery marker exceeds byte limit",
        key: input.key,
      })
    const record = yield* decode(Marker, yield* parse(object.bytes, input.key), "corruption", input.key)
    if (
      record.environment !== input.scope.environment ||
      record.tenant !== input.scope.tenant ||
      (yield* markerKey(record)) !== input.key ||
      !equalBytes(yield* bytes(record), object.bytes)
    ) {
      return yield* failure({
        reason: "corruption",
        message: "Discovery marker identity or canonical bytes do not match its key",
        key: input.key,
      })
    }
    return { ...input.scope, partition: record.partition }
  })

/** Read one bounded page of retained locations without notifications or writes. @experimental */
export const page = (input: Scope & { readonly cursor?: string }) =>
  Effect.gen(function* () {
    const identity = yield* decode(
      MarkerScope,
      { environment: input.environment, tenant: input.tenant },
      "configuration",
    )
    const cursor = input.cursor
    const store = yield* ObjectStore
    if (!store.capabilities.consistentListing || !store.capabilities.strongReadAfterWrite) {
      return yield* failure({
        reason: "configuration",
        message: "Discovery requires strong reads and consistent listing",
      })
    }
    const prefix = `${yield* tenantPrefix(identity)}discovery/`
    let provider: string | undefined
    if (cursor !== undefined) {
      yield* decode(Schema.String.check(Schema.isMaxLength(65536)), cursor, "configuration")
      const decoded = yield* Effect.try({
        try: () => decodeURIComponent(cursor),
        catch: () => failure({ reason: "configuration", message: "Invalid discovery cursor" }),
      })
      const value = yield* Schema.decodeEffect(CursorJson, { onExcessProperty: "error" })(decoded).pipe(
        Effect.mapError(() => failure({ reason: "configuration", message: "Invalid discovery cursor" })),
      )
      if (value.environment !== identity.environment || value.tenant !== identity.tenant) {
        return yield* failure({
          reason: "configuration",
          message: "Discovery cursor belongs to another scope",
        })
      }
      provider = value.provider
    }
    const result = yield* decode(
      Page,
      yield* store.list(prefix, { cursor: provider }).pipe(Effect.mapError(transport)),
      "corruption",
      prefix,
    )
    if (result.keys.length > maxPageKeys) {
      return yield* failure({
        reason: "limit",
        message: `Discovery page exceeds ${maxPageKeys} markers`,
        key: prefix,
      })
    }
    if (result.cursor !== undefined && result.cursor === provider) {
      return yield* failure({
        reason: "corruption",
        message: "Discovery provider cursor is invalid or did not advance",
        key: prefix,
      })
    }
    const seen = new Set<string>()
    const locations: Array<Location> = []
    for (const key of result.keys) {
      if (!key.startsWith(prefix) || key.length > prefix.length + 12293 || seen.has(key)) {
        return yield* failure({
          reason: "corruption",
          message: "Discovery listing contains a foreign or repeated key",
          key,
        })
      }
      seen.add(key)
      locations.push(yield* locationAt({ scope: identity, key }))
    }
    if (result.cursor === undefined) return { locations }
    const next = yield* Schema.encodeEffect(CursorJson)({ version: 1, ...identity, provider: result.cursor }).pipe(
      Effect.mapError(() => failure({ reason: "corruption", message: "Invalid discovery continuation" })),
    )
    return { locations, cursor: encodeURIComponent(next) }
  })

/** Reconstruct a located journal within fixed validation budgets without activating it. @experimental */
export const inspect = (location: Location) =>
  Effect.gen(function* () {
    const identity = yield* decode(Identity, location, "configuration")
    const store = yield* ObjectStore
    let remaining = 4096
    let remainingBytes = 32 * 1024 * 1024
    const spend = (key: string, amount: number) =>
      Effect.suspend(() => {
        remaining -= amount
        return remaining < 0
          ? Effect.fail(
              ObjectStoreFailure.make({
                operation: "discovery",
                key,
                reason: "limit",
                message: "Discovery validation exceeds 4096 objects and requests",
              }),
            )
          : Effect.void
      })
    const bounded: Service = {
      capabilities: store.capabilities,
      create: (key) =>
        Effect.fail(
          ObjectStoreFailure.make({
            operation: "discovery",
            key,
            reason: "invalid-response",
            message: "Discovery validation is read-only",
          }),
        ),
      read: (key, options) =>
        Effect.gen(function* () {
          yield* spend(key, 1)
          if (remainingBytes <= 0) {
            return yield* ObjectStoreFailure.make({
              operation: "discovery",
              key,
              reason: "limit",
              message: "Discovery validation exceeds 32 MiB",
            })
          }
          const object = yield* store.read(key, { ...options, maxBytes: Math.min(options.maxBytes, remainingBytes) })
          remainingBytes -= object?.bytes.length ?? 0
          if (remainingBytes < 0) {
            return yield* ObjectStoreFailure.make({
              operation: "discovery",
              key,
              reason: "limit",
              message: "Discovery validation exceeds 32 MiB",
            })
          }
          return object
        }),
      list: (prefix, options) =>
        Effect.gen(function* () {
          yield* spend(prefix, 1)
          const result = yield* store.list(prefix, options)
          if (!Array.isArray(result?.keys)) {
            return yield* ObjectStoreFailure.make({
              operation: "discovery",
              key: prefix,
              reason: "invalid-response",
              message: "Invalid discovery validation listing",
            })
          }
          yield* spend(prefix, result.keys.length)
          return result
        }),
    }
    const journal = yield* make(identity).pipe(Effect.provideService(ObjectStore, bounded))
    const head = yield* journal.read
    return head.sequence === "-1"
      ? { status: "uncommitted" as const, location: identity }
      : { status: "committed" as const, location: identity, head }
  })
