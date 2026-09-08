import { Context, Effect, Function, Layer, Option, Schema } from "effect"
import { type CapabilityPin, makeCapability } from "./pin.js"
import { DriverError, DriverStateInvalid } from "./service.js"
import { DriverInterpreter } from "./driver/interpreter/service.js"
import { ToolContext } from "../tools/tool-context.js"
import { Registry } from "./component/services.js"
import { Descriptor, bounded, namespace } from "./component/definition.js"
export { Descriptor } from "./component/definition.js"

/** Identity held by one registered component declaration. @experimental */
export interface CommandCapability {
  readonly namespace: string
  readonly pin: CapabilityPin
}

/** Register the same declaration that its tools use; rebuild it with matching pins on recovery. @experimental */
export interface Registration {
  readonly capability: CommandCapability
  readonly descriptor: Descriptor
  readonly pin: CapabilityPin
  readonly initial: Effect.Effect<Schema.Json, DriverStateInvalid>
  readonly validate: (state: Schema.Json) => Effect.Effect<void, DriverStateInvalid>
  readonly transition: (state: Schema.Json, command: Schema.Json) => Effect.Effect<Schema.Json, DriverStateInvalid>
}

/** One typed, schema-pinned component declaration. @experimental */
export interface Declaration<State, Command> {
  readonly registration: Registration
  readonly state: Schema.Codec<State, unknown>
  readonly command: Schema.Codec<Command, unknown>
}

/** Declare a bounded deterministic component without allocating state or running a transition. @experimental */
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

/** Annotate an Effect AI command tool so recovery may safely retry its accepted component command. @experimental */
export class CommandTool extends Context.Service<CommandTool, Registration>()(
  "generalist/core/durable/component/CommandTool",
) {}

/** Provide the single component registry for Agent registration and execution. @experimental */
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

/** Provide component registrations in a test environment. @experimental */
export const layerTest = layer

/** Read the current component value without accepting a command or changing its receipts. @experimental */
export const read = <State, Command>(
  declaration: Declaration<State, Command>,
): Effect.Effect<State, DriverStateInvalid> =>
  Effect.gen(function* () {
    const driver = yield* Effect.serviceOption(DriverInterpreter)
    if (Option.isNone(driver))
      return yield* DriverStateInvalid.make({ message: "Component read requires an active Agent Run" })
    const state = yield* driver.value.componentRead(declaration.registration.capability)
    return yield* bounded({ value: state, limit: declaration.registration.descriptor.maxStateBytes }).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(declaration.state)),
      Effect.mapError(() => DriverStateInvalid.make({ message: "Invalid component state" })),
    )
  })

/** Accept one deterministic command. In a tool, omit id to reuse its durable operation identity. @experimental */
export const command: {
  <Command>(input: {
    readonly id?: string
    readonly command: Command
  }): <State>(declaration: Declaration<State, Command>) => Effect.Effect<State, DriverStateInvalid | DriverError>
  <State, Command>(
    declaration: Declaration<State, Command>,
    input: { readonly id?: string; readonly command: Command },
  ): Effect.Effect<State, DriverStateInvalid | DriverError>
} = Function.dual(
  2,
  <State, Command>(
    declaration: Declaration<State, Command>,
    input: { readonly id?: string; readonly command: Command },
  ) =>
    Effect.gen(function* () {
      const driver = yield* Effect.serviceOption(DriverInterpreter)
      if (Option.isNone(driver))
        return yield* DriverStateInvalid.make({ message: "Component command requires an active Agent Run" })
      const context = yield* Effect.serviceOption(ToolContext)
      const id = input.id ?? Option.getOrUndefined(context)?.operationKey
      if (id === undefined)
        return yield* DriverStateInvalid.make({ message: "Component command requires a stable command identity" })
      const encoded = yield* Schema.encodeEffect(declaration.command)(input.command).pipe(
        Effect.mapError(() => DriverStateInvalid.make({ message: "Invalid component command" })),
        Effect.flatMap((value) => bounded({ value, limit: declaration.registration.descriptor.maxCommandBytes })),
      )
      const state = yield* driver.value.componentCommand({
        capability: declaration.registration.capability,
        id,
        command: encoded,
      })
      return yield* bounded({ value: state, limit: declaration.registration.descriptor.maxStateBytes }).pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(declaration.state)),
        Effect.mapError(() => DriverStateInvalid.make({ message: "Invalid component state" })),
      )
    }),
)
