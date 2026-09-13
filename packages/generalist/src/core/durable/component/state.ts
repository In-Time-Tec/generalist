import { Effect, Function, Schema } from "effect"
import type { Registration } from "../component.js"
import { Descriptor, bounded, namespace } from "./definition.js"
import { CapabilityPin, makeCapability } from "../pin.js"
import { ComponentStateInvalid, ComponentUnavailable } from "./error.js"

export const Checkpoint = Schema.Struct({
  descriptor: Descriptor,
  pin: CapabilityPin,
  state: Schema.Json,
  initialState: Schema.optionalKey(Schema.Json),
  receipts: Schema.Array(
    Schema.Struct({
      id: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(1024)),
      digest: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/)),
      result: Schema.Json,
    }),
  ),
})
export type Checkpoint = typeof Checkpoint.Type

export const validate: {
  (
    registrations: ReadonlyArray<Registration>,
  ): (checkpoints: ReadonlyArray<Checkpoint>) => Effect.Effect<void, ComponentStateInvalid | ComponentUnavailable>
  (
    checkpoints: ReadonlyArray<Checkpoint>,
    registrations: ReadonlyArray<Registration>,
  ): Effect.Effect<void, ComponentStateInvalid | ComponentUnavailable>
} = Function.dual(2, (checkpoints: ReadonlyArray<Checkpoint>, registrations: ReadonlyArray<Registration>) =>
  Effect.forEach(
    checkpoints,
    (checkpoint) =>
      Effect.gen(function* () {
        const identity = { key: checkpoint.descriptor.key, instance: checkpoint.descriptor.instance }
        const registration = registrations.find(
          (entry) => namespace(entry.descriptor) === namespace(checkpoint.descriptor),
        )
        if (registration === undefined) {
          return yield* ComponentUnavailable.make({ ...identity, reason: "not-registered" })
        }
        if (registration.pin !== checkpoint.pin || makeCapability(checkpoint.descriptor) !== checkpoint.pin) {
          return yield* ComponentUnavailable.make({ ...identity, reason: "wrong-version" })
        }
        if (
          checkpoints.filter((entry) => namespace(entry.descriptor) === namespace(checkpoint.descriptor)).length !==
            1 ||
          new Set(checkpoint.receipts.map((receipt) => receipt.id)).size !== checkpoint.receipts.length
        ) {
          return yield* ComponentStateInvalid.make({ ...identity, reason: "decode" })
        }
        yield* bounded({ value: checkpoint.receipts, limit: registration.descriptor.maxReceiptBytes }).pipe(
          Effect.mapError(() => ComponentStateInvalid.make({ ...identity, reason: "bounds" })),
        )
        if (checkpoint.descriptor.scope === "session") {
          if (checkpoint.initialState === undefined) {
            return yield* ComponentStateInvalid.make({ ...identity, reason: "decode" })
          }
          yield* registration.validate(checkpoint.initialState)
        }
        yield* Effect.forEach(checkpoint.receipts, (receipt) => registration.validate(receipt.result), {
          discard: true,
        })
        return yield* registration.validate(checkpoint.state)
      }),
    { discard: true },
  ),
)
