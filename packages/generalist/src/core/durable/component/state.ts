import { Effect, Function, Schema } from "effect"
import type { Registration } from "../component.js"
import { Descriptor, bounded, namespace } from "./definition.js"
import { CapabilityPin, makeCapability } from "../pin.js"
import { DriverStateInvalid } from "../service.js"

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
  ): (checkpoints: ReadonlyArray<Checkpoint>) => Effect.Effect<void, DriverStateInvalid>
  (
    checkpoints: ReadonlyArray<Checkpoint>,
    registrations: ReadonlyArray<Registration>,
  ): Effect.Effect<void, DriverStateInvalid>
} = Function.dual(2, (checkpoints: ReadonlyArray<Checkpoint>, registrations: ReadonlyArray<Registration>) =>
  Effect.forEach(
    checkpoints,
    (checkpoint) =>
      Effect.gen(function* () {
        const registration = registrations.find(
          (entry) => namespace(entry.descriptor) === namespace(checkpoint.descriptor) && entry.pin === checkpoint.pin,
        )
        if (registration === undefined || makeCapability(checkpoint.descriptor) !== checkpoint.pin) {
          return yield* DriverStateInvalid.make({
            message: `Component registration is missing: ${namespace(checkpoint.descriptor)}`,
          })
        }
        if (
          checkpoints.filter((entry) => namespace(entry.descriptor) === namespace(checkpoint.descriptor)).length !==
            1 ||
          new Set(checkpoint.receipts.map((receipt) => receipt.id)).size !== checkpoint.receipts.length
        ) {
          return yield* DriverStateInvalid.make({ message: "Duplicate component namespace or command receipt" })
        }
        yield* bounded({ value: checkpoint.receipts, limit: registration.descriptor.maxReceiptBytes })
        if (checkpoint.descriptor.scope === "session") {
          if (checkpoint.initialState === undefined)
            return yield* DriverStateInvalid.make({ message: "Session component initial state is missing" })
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
