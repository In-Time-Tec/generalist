import { Effect, Ref, Schema, type Semaphore } from "effect"
import { type Checkpoint, type CommandCapability, type Registration, bounded, namespace } from "../component.js"
import { digest } from "../canonical-json.js"
import { LoopDriverState, encode as encodeLoopState } from "../loop-driver-state.js"
import { DriverError, DriverStateInvalid } from "../service.js"
import type { DriverCheckpoint } from "./contract.js"

export interface ComponentCheckpointService {
  readonly componentCommand: (input: {
    readonly capability: CommandCapability
    readonly id: string
    readonly command: Schema.Json
  }) => Effect.Effect<Schema.Json, DriverError | DriverStateInvalid>
}

export const componentCheckpointMethods = (input: {
  readonly checkpointRef: Ref.Ref<DriverCheckpoint>
  readonly commitSemaphore: Semaphore.Semaphore
  readonly registrations: ReadonlyArray<Registration>
  readonly onCheckpoint: (checkpoint: DriverCheckpoint, commandId?: string) => Effect.Effect<void, DriverError>
}): ComponentCheckpointService => ({
  componentCommand: (command) =>
    input.commitSemaphore.withPermit(
      Effect.gen(function* () {
        const registration = input.registrations.find((entry) => entry.capability === command.capability)
        if (registration === undefined || command.id.length === 0 || command.id.length > 1024) {
          return yield* DriverStateInvalid.make({ message: "Component command capability is invalid" })
        }
        const encoded = yield* bounded({ value: command.command, limit: registration.descriptor.maxCommandBytes })
        const commandDigest = digest(encoded)
        const current = yield* Ref.get(input.checkpointRef)
        const state = yield* Schema.decodeUnknownEffect(LoopDriverState)(current.state).pipe(
          Effect.mapError(() => DriverStateInvalid.make({ message: "Invalid component checkpoint" })),
        )
        const existing = state.components?.find((entry) => namespace(entry.descriptor) === command.capability.namespace)
        if (existing !== undefined && existing.pin !== command.capability.pin) {
          return yield* DriverStateInvalid.make({ message: "Component version changed" })
        }
        const receipt = existing?.receipts.find((entry) => entry.id === command.id)
        if (receipt !== undefined) {
          if (receipt.digest !== commandDigest) {
            return yield* DriverStateInvalid.make({ message: "Divergent component command retry" })
          }
          return receipt.result
        }
        const before = existing?.state ?? (yield* registration.initial)
        const result = yield* registration.transition(before, encoded)
        const receipts = [...(existing?.receipts ?? []), { id: command.id, digest: commandDigest, result }]
        yield* bounded({ value: receipts, limit: registration.descriptor.maxReceiptBytes })
        const updated: Checkpoint = {
          descriptor: registration.descriptor,
          pin: registration.pin,
          state: result,
          receipts,
        }
        const components = [
          ...(state.components ?? []).filter((entry) => namespace(entry.descriptor) !== command.capability.namespace),
          updated,
        ]
        const next = { ...current, state: yield* encodeLoopState({ ...state, components }) }
        const commandId = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Array(Schema.String)))([
          "component",
          command.capability.namespace,
          command.id,
        ]).pipe(Effect.mapError(() => DriverStateInvalid.make({ message: "Invalid component command identity" })))
        yield* input.onCheckpoint(next, commandId)
        yield* Ref.set(input.checkpointRef, next)
        return result
      }),
    ),
})
