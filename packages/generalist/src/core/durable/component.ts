import { Context, Effect, Function, Layer, Option, Schema } from "effect"
import type { Tool } from "effect/unstable/ai"
import type { ReplayPolicy } from "./driver/contract.js"
import { CapabilityPin, makeCapability } from "./pin.js"
import { DriverStateInvalid } from "./service.js"

const Identity = Schema.String.check(Schema.isPattern(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/))

export const Descriptor = Schema.Struct({
  version: Schema.Literal("1"),
  key: Identity,
  instance: Identity,
  schemaVersion: Identity,
  handler: Identity,
  handlerVersion: Identity,
  scope: Schema.Literal("run"),
  branch: Schema.Literal("restore"),
  redaction: Schema.Literal("visible"),
  maxStateBytes: Schema.Int.check(Schema.isGreaterThan(0)),
  maxCommandBytes: Schema.Int.check(Schema.isGreaterThan(0)),
  maxReceiptBytes: Schema.Int.check(Schema.isGreaterThan(0)),
})
export type Descriptor = typeof Descriptor.Type

export const Checkpoint = Schema.Struct({
  descriptor: Descriptor,
  pin: CapabilityPin,
  state: Schema.Json,
  receipts: Schema.Array(
    Schema.Struct({
      id: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(1024)),
      digest: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/)),
      result: Schema.Json,
    }),
  ),
})
export type Checkpoint = typeof Checkpoint.Type

export interface CommandCapability {
  readonly namespace: string
  readonly pin: CapabilityPin
}

export interface Registration {
  readonly capability: CommandCapability
  readonly descriptor: Descriptor
  readonly pin: CapabilityPin
  readonly initial: Effect.Effect<Schema.Json, DriverStateInvalid>
  readonly validate: (state: Schema.Json) => Effect.Effect<void, DriverStateInvalid>
  readonly transition: (state: Schema.Json, command: Schema.Json) => Effect.Effect<Schema.Json, DriverStateInvalid>
}

export interface Declaration<State, Command> {
  readonly registration: Registration
  readonly state: Schema.Codec<State, unknown>
  readonly command: Schema.Codec<Command, unknown>
}

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

export const make = <State, Command>(input: {
  readonly descriptor: Descriptor
  readonly state: Schema.Codec<State, unknown>
  readonly command: Schema.Codec<Command, unknown>
  readonly initial: State
  readonly transition: (state: State, command: Command) => State
}): Declaration<State, Command> => {
  const descriptor = Schema.decodeSync(Descriptor, { onExcessProperty: "error" })(input.descriptor)
  const pin = makeCapability(descriptor)
  const encode = (state: State) =>
    Schema.encodeEffect(input.state)(state).pipe(
      Effect.mapError(() => DriverStateInvalid.make({ message: "Invalid component state" })),
      Effect.flatMap((value) => bounded({ value, limit: descriptor.maxStateBytes })),
    )
  const decode = (state: Schema.Json) =>
    bounded({ value: state, limit: descriptor.maxStateBytes }).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(input.state)),
      Effect.mapError(() => DriverStateInvalid.make({ message: "Invalid component state" })),
    )
  return {
    state: input.state,
    command: input.command,
    registration: {
      capability: Object.freeze({ namespace: namespace(descriptor), pin }),
      descriptor,
      pin,
      initial: encode(input.initial),
      validate: (state) => decode(state).pipe(Effect.asVoid),
      transition: (state, command) =>
        Effect.gen(function* () {
          const before = yield* decode(state)
          const encoded = yield* bounded({ value: command, limit: descriptor.maxCommandBytes })
          const decoded = yield* Schema.decodeEffect(input.command, { onExcessProperty: "error" })(encoded).pipe(
            Effect.mapError(() => DriverStateInvalid.make({ message: "Invalid component command" })),
          )
          const after = yield* Effect.try({
            try: () => input.transition(before, decoded),
            catch: () => DriverStateInvalid.make({ message: "Component transition rejected" }),
          })
          return yield* encode(after)
        }),
    },
  }
}

export const namespace = (descriptor: Descriptor): string => JSON.stringify([descriptor.key, descriptor.instance])

export class Registry extends Context.Service<Registry, ReadonlyArray<Registration>>()(
  "generalist/core/durable/component/Registry",
) {}

export class CommandTool extends Context.Service<CommandTool, Registration>()(
  "generalist/core/durable/component/CommandTool",
) {}

export const toolReplayPolicy = (input: {
  readonly tool: Tool.Any | undefined
  readonly fallback: ReplayPolicy | undefined
}): ReplayPolicy => {
  if (input.tool !== undefined && Option.isSome(Context.getOption(input.tool.annotations, CommandTool)))
    return "provider-idempotent"
  return input.fallback ?? "never"
}

export const layer = (registrations: ReadonlyArray<Registration>): Layer.Layer<Registry, DriverStateInvalid> =>
  Layer.effect(
    Registry,
    Effect.gen(function* () {
      const namespaces = registrations.map((registration) => namespace(registration.descriptor))
      if (new Set(namespaces).size !== namespaces.length) {
        return yield* DriverStateInvalid.make({ message: "Duplicate component namespace" })
      }
      return registrations
    }),
  )

export const layerTest = layer

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
        yield* Effect.forEach(checkpoint.receipts, (receipt) => registration.validate(receipt.result), {
          discard: true,
        })
        return yield* registration.validate(checkpoint.state)
      }),
    { discard: true },
  ),
)
