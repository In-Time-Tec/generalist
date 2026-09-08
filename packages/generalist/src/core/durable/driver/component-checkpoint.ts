import { Effect, Option, Ref, Schema, type Semaphore } from "effect"
import type { CommandCapability, Registration } from "../component.js"
import { bounded, namespace } from "../component/definition.js"
import { type Checkpoint, validate } from "../component/state.js"
import type { SessionState } from "../component/services.js"
import { digest } from "../canonical-json.js"
import { LoopDriverState, encode as encodeLoopState } from "../loop-driver-state.js"
import { DriverError, DriverStateInvalid } from "../service.js"
import type { DriverCheckpoint } from "./contract.js"

export const restoreSession = (input: {
  readonly checkpoint: DriverCheckpoint
  readonly sessionState: typeof SessionState.Service | undefined
}): DriverCheckpoint => {
  const decoded = Schema.decodeUnknownOption(LoopDriverState)(input.checkpoint.state)
  if (input.sessionState === undefined || Option.isNone(decoded)) return input.checkpoint
  return {
    ...input.checkpoint,
    state: {
      ...decoded.value,
      components: [
        ...(decoded.value.components ?? []).filter((component) => component.descriptor.scope === "run"),
        ...input.sessionState.components,
      ],
    },
  }
}

export const validateState = (input: {
  readonly state: LoopDriverState
  readonly registrations: ReadonlyArray<Registration>
  readonly sessionState: typeof SessionState.Service | undefined
}) => {
  if (
    input.state.components?.some((component) => component.descriptor.scope === "session") === true &&
    input.sessionState?.sessionId !== input.state.sessionId
  ) {
    return DriverStateInvalid.make({ message: "Session component ownership mismatch" })
  }
  return validate(input.state.components ?? [], input.registrations)
}

const initialize = (registration: Registration) =>
  Effect.gen(function* () {
    const state = yield* registration.initial
    let checkpoint: Checkpoint = { descriptor: registration.descriptor, pin: registration.pin, state, receipts: [] }
    if (registration.descriptor.scope === "session") checkpoint = { ...checkpoint, initialState: state }
    return checkpoint
  })

export interface ComponentCheckpointService {
  readonly componentRead: (capability: CommandCapability) => Effect.Effect<Schema.Json, DriverStateInvalid>
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
  readonly sessionState: typeof SessionState.Service | undefined
  readonly onCheckpoint: (checkpoint: DriverCheckpoint, commandId?: string) => Effect.Effect<void, DriverError>
}): ComponentCheckpointService => ({
  componentRead: (capability) =>
    input.commitSemaphore.withPermit(
      Effect.gen(function* () {
        const registration = input.registrations.find((entry) => entry.capability === capability)
        if (registration === undefined)
          return yield* DriverStateInvalid.make({ message: "Component read capability is invalid" })
        const checkpoint = yield* Ref.get(input.checkpointRef)
        const state = yield* Schema.decodeUnknownEffect(LoopDriverState)(checkpoint.state).pipe(
          Effect.mapError(() => DriverStateInvalid.make({ message: "Invalid component checkpoint" })),
        )
        yield* validateState({ state, registrations: input.registrations, sessionState: input.sessionState })
        if (registration.descriptor.scope === "session" && input.sessionState?.sessionId !== state.sessionId) {
          return yield* DriverStateInvalid.make({ message: "Session component requires its owning Runtime Session" })
        }
        const existing = state.components?.find((entry) => namespace(entry.descriptor) === capability.namespace)
        if (existing !== undefined && existing.pin !== capability.pin) {
          return yield* DriverStateInvalid.make({ message: "Component version changed" })
        }
        return existing === undefined ? yield* registration.initial : existing.state
      }),
    ),
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
        yield* validateState({ state, registrations: input.registrations, sessionState: input.sessionState })
        if (registration.descriptor.scope === "session" && input.sessionState?.sessionId !== state.sessionId) {
          return yield* DriverStateInvalid.make({ message: "Session component requires its owning Runtime Session" })
        }
        const existing = state.components?.find((entry) => namespace(entry.descriptor) === command.capability.namespace)
        if (existing !== undefined && existing.pin !== command.capability.pin) {
          return yield* DriverStateInvalid.make({ message: "Component version changed" })
        }
        const previous = existing === undefined ? yield* initialize(registration) : existing
        const receipt = previous.receipts.find((entry) => entry.id === command.id)
        if (receipt !== undefined) {
          if (receipt.digest !== commandDigest) {
            return yield* DriverStateInvalid.make({ message: "Divergent component command retry" })
          }
          return receipt.result
        }
        const result = yield* registration.transition(previous.state, encoded)
        const receipts = [...previous.receipts, { id: command.id, digest: commandDigest, result }]
        yield* bounded({ value: receipts, limit: registration.descriptor.maxReceiptBytes })
        const updated: Checkpoint = {
          ...previous,
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
