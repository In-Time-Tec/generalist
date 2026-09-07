import { Effect, Result, Schema } from "effect"
import { DurabilityFailure } from "../errors.js"
import { ObjectStore, type ObjectStoreFailure } from "../object-store.js"
import { failure, decode, bytes as bytesProtocol, parse, equalBytes } from "./protocol.js"

const Component = Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(1024))
export const Scope = Schema.Struct({ environment: Component, tenant: Component })
export const Identity = Schema.Struct({ environment: Component, tenant: Component, partition: Component })
export const Marker = Schema.Struct({
  version: Schema.Literal(1),
  kind: Schema.Literal("partition-discovery"),
  environment: Component,
  tenant: Component,
  partition: Component,
})
export const maxMarkerBytes = 32 * 1024
export const transport = (cause: ObjectStoreFailure) =>
  DurabilityFailure.make({
    reason: cause.reason === "limit" ? "limit" : "transport",
    message: cause.message,
    key: cause.key,
    cause,
  })
const encode = (value: string) => encodeURIComponent(value).replaceAll(".", "%2E")
export const tenantPrefix = (scope: typeof Scope.Type) =>
  Effect.try({
    try: () => `environments/${encode(scope.environment)}/v1/tenants/${encode(scope.tenant)}/`,
    catch: (cause) => failure({ reason: "configuration", message: String(cause) }),
  })
export const markerKey = (identity: typeof Identity.Type) =>
  Effect.gen(function* () {
    const prefix = yield* tenantPrefix(identity)
    return yield* Effect.try({
      try: () => `${prefix}discovery/${encode(identity.partition)}.json`,
      catch: (cause) => failure({ reason: "configuration", message: String(cause) }),
    })
  })
export const ensure = (identity: typeof Identity.Type) =>
  Effect.gen(function* () {
    const store = yield* ObjectStore
    const record = yield* decode(Marker, { version: 1, kind: "partition-discovery", ...identity }, "configuration")
    const key = yield* markerKey(record)
    const bytes = yield* bytesProtocol(record)
    const outcome = yield* Effect.result(store.create(key, bytes))
    if (Result.isSuccess(outcome) && outcome.success === "created") return
    const read = yield* Effect.result(store.read(key, { maxBytes: maxMarkerBytes }))
    if (Result.isFailure(read) || read.success === undefined) {
      return yield* failure({
        reason: "indeterminate",
        message: "Discovery marker creation could not be reconciled",
        key,
      })
    }
    yield* decode(Marker, yield* parse(read.success.bytes, key), "corruption", key)
    if (!equalBytes(read.success.bytes, bytes)) {
      return yield* failure({
        reason: "corruption",
        message: "Immutable discovery marker conflicts with partition identity",
        key,
      })
    }
  })
