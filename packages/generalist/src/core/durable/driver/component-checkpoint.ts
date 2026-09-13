import { Effect, Option, Ref, Schema, type Semaphore } from "effect"
import type { CommandCapability, Registration } from "../component.js"
import { bounded, namespace } from "../component/definition.js"
import { type Checkpoint, validate } from "../component/state.js"
import type { SessionState } from "../component/services.js"
import { digest } from "../canonical-json.js"
import { LoopDriverState, encode as encodeLoopState } from "../loop-driver-state.js"
import type { DriverCheckpoint } from "./contract.js"
import type { DriverError } from "../service.js"
import {
  ComponentAccessDenied,
  ComponentCommandConflict,
  ComponentCommandInvalid,
  type ComponentFailure,
  ComponentStateInvalid,
  ComponentUnavailable,
} from "../component/error.js"

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
}): Effect.Effect<void, ComponentAccessDenied | ComponentStateInvalid | ComponentUnavailable> => {
  if (
    input.state.components?.some((component) => component.descriptor.scope === "session") === true &&
    input.sessionState?.sessionId !== input.state.sessionId
  ) {
    const component = input.state.components.find((entry) => entry.descriptor.scope === "session")!
    return Effect.fail(
      ComponentAccessDenied.make({
        key: component.descriptor.key,
        instance: component.descriptor.instance,
        scope: "session",
        sessionId: input.state.sessionId,
      }),
    )
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

const ComponentNamespace = Schema.Tuple([Schema.String, Schema.String])

const unavailableIdentity = (capability: CommandCapability) => {
  try {
    const decoded: unknown = JSON.parse(capability.namespace)
    const identity = Option.getOrUndefined(Schema.decodeUnknownOption(ComponentNamespace)(decoded))
    return identity === undefined
      ? { key: "unknown", instance: "unknown" }
      : { key: identity[0], instance: identity[1] }
  } catch {
    return { key: "unknown", instance: "unknown" }
  }
}

const registrationFor = (
  registrations: ReadonlyArray<Registration>,
  capability: CommandCapability,
): Effect.Effect<Registration, ComponentAccessDenied | ComponentUnavailable> => {
  const registration = registrations.find((entry) => entry.capability === capability)
  if (registration !== undefined) return Effect.succeed(registration)
  const matchingNamespace = registrations.find((entry) => entry.capability.namespace === capability.namespace)
  if (matchingNamespace !== undefined) {
    return ComponentAccessDenied.make({
      key: matchingNamespace.descriptor.key,
      instance: matchingNamespace.descriptor.instance,
      scope: matchingNamespace.descriptor.scope,
    })
  }
  return ComponentUnavailable.make({ ...unavailableIdentity(capability), reason: "not-registered" })
}

export interface ComponentCheckpointService {
  readonly componentRead: (
    capability: CommandCapability,
  ) => Effect.Effect<Schema.Json, ComponentAccessDenied | ComponentStateInvalid | ComponentUnavailable>
  readonly componentCommand: (input: {
    readonly capability: CommandCapability
    readonly id: string
    readonly command: Schema.Json
  }) => Effect.Effect<Schema.Json, ComponentFailure>
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
        const registration = yield* registrationFor(input.registrations, capability)
        const identity = { key: registration.descriptor.key, instance: registration.descriptor.instance }
        const checkpoint = yield* Ref.get(input.checkpointRef)
        const state = yield* Schema.decodeUnknownEffect(LoopDriverState)(checkpoint.state).pipe(
          Effect.mapError(() => ComponentStateInvalid.make({ ...identity, reason: "decode" })),
        )
        yield* validateState({ state, registrations: input.registrations, sessionState: input.sessionState })
        if (registration.descriptor.scope === "session" && input.sessionState?.sessionId !== state.sessionId) {
          return yield* ComponentAccessDenied.make({
            ...identity,
            scope: "session",
            sessionId: state.sessionId,
          })
        }
        const existing = state.components?.find((entry) => namespace(entry.descriptor) === capability.namespace)
        if (existing !== undefined && existing.pin !== capability.pin) {
          return yield* ComponentUnavailable.make({ ...identity, reason: "wrong-version" })
        }
        return existing === undefined ? yield* registration.initial : existing.state
      }),
    ),
  componentCommand: (command) =>
    input.commitSemaphore.withPermit(
      Effect.gen(function* () {
        const registration = yield* registrationFor(input.registrations, command.capability)
        const identity = { key: registration.descriptor.key, instance: registration.descriptor.instance }
        if (command.id.length === 0 || command.id.length > 1024) {
          return yield* ComponentCommandInvalid.make({ ...identity, reason: "identity" })
        }
        const encoded = yield* bounded({ value: command.command, limit: registration.descriptor.maxCommandBytes }).pipe(
          Effect.mapError(() => ComponentCommandInvalid.make({ ...identity, reason: "bounds" })),
        )
        const commandDigest = digest(encoded)
        const current = yield* Ref.get(input.checkpointRef)
        const state = yield* Schema.decodeUnknownEffect(LoopDriverState)(current.state).pipe(
          Effect.mapError(() => ComponentStateInvalid.make({ ...identity, reason: "decode" })),
        )
        yield* validateState({ state, registrations: input.registrations, sessionState: input.sessionState })
        if (registration.descriptor.scope === "session" && input.sessionState?.sessionId !== state.sessionId) {
          return yield* ComponentAccessDenied.make({
            ...identity,
            scope: "session",
            sessionId: state.sessionId,
          })
        }
        const existing = state.components?.find((entry) => namespace(entry.descriptor) === command.capability.namespace)
        if (existing !== undefined && existing.pin !== command.capability.pin) {
          return yield* ComponentUnavailable.make({ ...identity, reason: "wrong-version" })
        }
        const previous = existing === undefined ? yield* initialize(registration) : existing
        const receipt = previous.receipts.find((entry) => entry.id === command.id)
        if (receipt !== undefined) {
          if (receipt.digest !== commandDigest) {
            return yield* ComponentCommandConflict.make({ ...identity, commandId: command.id })
          }
          return receipt.result
        }
        const result = yield* registration.transition(previous.state, encoded)
        const receipts = [...previous.receipts, { id: command.id, digest: commandDigest, result }]
        yield* bounded({ value: receipts, limit: registration.descriptor.maxReceiptBytes }).pipe(
          Effect.mapError(() => ComponentStateInvalid.make({ ...identity, reason: "bounds" })),
        )
        const updated: Checkpoint = {
          ...previous,
          state: result,
          receipts,
        }
        const components = [
          ...(state.components ?? []).filter((entry) => namespace(entry.descriptor) !== command.capability.namespace),
          updated,
        ]
        const next = {
          ...current,
          state: yield* encodeLoopState({ ...state, components }).pipe(
            Effect.mapError(() => ComponentStateInvalid.make({ ...identity, reason: "encode" })),
          ),
        }
        const commandId = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Array(Schema.String)))([
          "component",
          command.capability.namespace,
          command.id,
        ]).pipe(Effect.mapError(() => ComponentCommandInvalid.make({ ...identity, reason: "identity" })))
        yield* input
          .onCheckpoint(next, commandId)
          .pipe(Effect.mapError(() => ComponentUnavailable.make({ ...identity, reason: "persistence" })))
        yield* Ref.set(input.checkpointRef, next)
        return result
      }),
    ),
})
