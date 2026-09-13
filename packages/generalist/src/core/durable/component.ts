import { Context, Effect, Function, Layer, Option, Schema } from "effect"
import { Tool, Toolkit } from "effect/unstable/ai"
import { type CapabilityPin, makeCapability } from "./pin.js"
import { DriverInterpreter } from "./driver/interpreter/service.js"
import { ToolContext } from "../tools/tool-context.js"
import { Registry } from "./component/services.js"
import { Descriptor, bounded, namespace } from "./component/definition.js"
import { bindManagedTool, type ManagedTool } from "../tools/managed-tool.js"
export { Descriptor } from "./component/definition.js"
export {
  ComponentAccessDenied,
  ComponentCommandConflict,
  ComponentCommandInvalid,
  ComponentDeclarationInvalid,
  ComponentFailure,
  ComponentStateInvalid,
  ComponentUnavailable,
} from "./component/error.js"
import {
  ComponentAccessDenied,
  ComponentDeclarationInvalid,
  ComponentCommandInvalid,
  ComponentFailure,
  ComponentStateInvalid,
  ComponentUnavailable,
} from "./component/error.js"

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
  readonly initial: Effect.Effect<Schema.Json, ComponentStateInvalid>
  readonly validate: (state: Schema.Json) => Effect.Effect<void, ComponentStateInvalid>
  readonly transition: (
    state: Schema.Json,
    command: Schema.Json,
  ) => Effect.Effect<Schema.Json, ComponentStateInvalid | ComponentCommandInvalid>
}

/** One typed, schema-pinned component declaration. @experimental */
export interface Declaration<State, Command> {
  readonly registration: Registration
  readonly state: Schema.Codec<State, Schema.Json>
  readonly command: Schema.Codec<Command, Schema.Json>
}

/** Ownership scope of one component value. @experimental */
export type Scope = "run" | "session"

/** Declarative component options; fixed wire policy is derived by Generalist. @experimental */
export interface Options<State, Command> {
  readonly key: string
  readonly instance: string
  readonly schemaVersion: string
  readonly handler: string
  readonly handlerVersion: string
  readonly scope: Scope
  readonly maxStateBytes: number
  readonly maxCommandBytes: number
  readonly maxReceiptBytes: number
  readonly state: Schema.Codec<State, Schema.Json>
  readonly command: Schema.Codec<Command, Schema.Json>
  readonly initial: State
  readonly transition: (state: State, command: Command) => State
}

const identityPattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/
const identityFields = ["key", "instance", "schemaVersion", "handler", "handlerVersion"] as const
const declarationFailure = (
  input: Pick<Options<unknown, unknown>, "key" | "instance">,
  field:
    | (typeof identityFields)[number]
    | "scope"
    | "maxStateBytes"
    | "maxCommandBytes"
    | "maxReceiptBytes"
    | "initial",
  reason: "malformed-identity" | "invalid-scope" | "not-positive-safe-integer" | "initial-invalid",
) => ComponentDeclarationInvalid.make({ key: input.key, instance: input.instance, field, reason })

const deepFreezeJson = (value: Schema.Json): Schema.Json => {
  if (Schema.is(Schema.Array(Schema.Json))(value)) {
    for (const child of value) deepFreezeJson(child)
    Object.freeze(value)
  } else if (Schema.is(Schema.JsonObject)(value)) {
    for (const child of Object.values(value)) deepFreezeJson(child)
    Object.freeze(value)
  }
  return value
}

/** Declare a bounded deterministic component without allocating state or running a transition. @experimental */
export const make = <State, Command>(input: Options<State, Command>): Declaration<State, Command> => {
  for (const field of identityFields) {
    if (!identityPattern.test(input[field])) throw declarationFailure(input, field, "malformed-identity")
  }
  if (input.scope !== "run" && input.scope !== "session") {
    throw declarationFailure(input, "scope", "invalid-scope")
  }
  for (const field of ["maxStateBytes", "maxCommandBytes", "maxReceiptBytes"] as const) {
    if (!Number.isSafeInteger(input[field]) || input[field] <= 0) {
      throw declarationFailure(input, field, "not-positive-safe-integer")
    }
  }
  const descriptor = Schema.decodeSync(Descriptor, { onExcessProperty: "error" })({
    version: "1",
    key: input.key,
    instance: input.instance,
    schemaVersion: input.schemaVersion,
    handler: input.handler,
    handlerVersion: input.handlerVersion,
    scope: input.scope,
    ...(input.scope === "session" ? { access: "session-owner", inheritance: "none" } : undefined),
    branch: "restore",
    redaction: "visible",
    maxStateBytes: input.maxStateBytes,
    maxCommandBytes: input.maxCommandBytes,
    maxReceiptBytes: input.maxReceiptBytes,
  })
  const pin = makeCapability(descriptor)
  const stateSchema = input.state
  const commandSchema = input.command
  const transition = input.transition
  let initial: Schema.Json
  try {
    initial = Effect.runSync(
      Schema.encodeEffect(stateSchema)(input.initial).pipe(
        Effect.flatMap((value) => bounded({ value, limit: descriptor.maxStateBytes })),
      ),
    )
  } catch {
    throw declarationFailure(input, "initial", "initial-invalid")
  }
  deepFreezeJson(initial)
  const encode = (state: State) =>
    Schema.encodeEffect(stateSchema)(state).pipe(
      Effect.mapError(() =>
        ComponentStateInvalid.make({ key: descriptor.key, instance: descriptor.instance, reason: "encode" }),
      ),
      Effect.flatMap((value) =>
        bounded({ value, limit: descriptor.maxStateBytes }).pipe(
          Effect.mapError(() =>
            ComponentStateInvalid.make({ key: descriptor.key, instance: descriptor.instance, reason: "bounds" }),
          ),
        ),
      ),
    )
  const decode = (state: Schema.Json) =>
    bounded({ value: state, limit: descriptor.maxStateBytes }).pipe(
      Effect.mapError(() =>
        ComponentStateInvalid.make({ key: descriptor.key, instance: descriptor.instance, reason: "bounds" }),
      ),
      Effect.flatMap((value) =>
        Schema.decodeEffect(stateSchema)(value).pipe(
          Effect.mapError(() =>
            ComponentStateInvalid.make({ key: descriptor.key, instance: descriptor.instance, reason: "decode" }),
          ),
        ),
      ),
    )
  const registration: Registration = Object.freeze({
    capability: Object.freeze({ namespace: namespace(descriptor), pin }),
    descriptor: Object.freeze(descriptor),
    pin,
    initial: Effect.succeed(initial),
    validate: (state: Schema.Json) => decode(state).pipe(Effect.asVoid),
    transition: (state: Schema.Json, command: Schema.Json) =>
      Effect.gen(function* () {
        const before = yield* decode(state)
        const encoded = yield* bounded({ value: command, limit: descriptor.maxCommandBytes }).pipe(
          Effect.mapError(() =>
            ComponentCommandInvalid.make({ key: descriptor.key, instance: descriptor.instance, reason: "bounds" }),
          ),
        )
        const decoded = yield* Schema.decodeEffect(commandSchema, { onExcessProperty: "error" })(encoded).pipe(
          Effect.mapError(() =>
            ComponentCommandInvalid.make({ key: descriptor.key, instance: descriptor.instance, reason: "decode" }),
          ),
        )
        const after = yield* Effect.try({
          try: () => transition(before, decoded),
          catch: () =>
            ComponentStateInvalid.make({ key: descriptor.key, instance: descriptor.instance, reason: "transition" }),
        })
        return yield* encode(after)
      }),
  })
  return Object.freeze({ state: stateSchema, command: commandSchema, registration })
}

/** Annotate an Effect AI command tool so recovery may safely retry its accepted component command. @experimental */
export class CommandTool extends Context.Service<CommandTool, Registration>()(
  "generalist/core/durable/component/CommandTool",
) {}

/** Framework-owned component Tool whose declaration and handler are bound once. @experimental */
export type ManagedComponentTool = ManagedTool

/** Result retained for one exact component command identity. @experimental */
export interface CommandResult<State> {
  readonly state: State
  /** Exact retries return the original receipt, including its original duplicate value. */
  readonly duplicate: false
}

/** Model-facing parameters and synchronous command projection for a managed component Tool. @experimental */
export interface CommandToolOptions<Name extends string, ParametersSchema extends Schema.Top, Command> {
  readonly name: Name
  readonly description?: string
  readonly parameters: ParametersSchema
  readonly toCommand: (parameters: ParametersSchema["Type"]) => Command
}

/** Bind one component declaration, model-facing command schema, and framework-owned handler. @experimental */
const makeCommandTool = <State, Command, const Name extends string, ParametersSchema extends Schema.Top>(
  declaration: Declaration<State, Command>,
  options: CommandToolOptions<Name, ParametersSchema, Command>,
) => {
  const success = Schema.Struct({ state: declaration.state, duplicate: Schema.Literal(false) })
  const tool = Tool.make(options.name, {
    ...(options.description === undefined ? undefined : { description: options.description }),
    parameters: options.parameters,
    success,
    failure: ComponentFailure,
    failureMode: "error",
    dependencies: [DriverInterpreter, ToolContext],
  }).annotate(CommandTool, declaration.registration)
  const toolkit = Toolkit.make(tool)
  const definitions = {
    [tool.name]: (parameters: ParametersSchema["Type"]) =>
      Effect.try({
        try: () => options.toCommand(parameters),
        catch: () =>
          ComponentCommandInvalid.make({
            key: declaration.registration.descriptor.key,
            instance: declaration.registration.descriptor.instance,
            reason: "mapping",
          }),
      }).pipe(Effect.flatMap((mapped) => commandResult(declaration, { command: mapped }))),
  }
  // SAFETY: the computed key is the exact literal name of the sole Tool, and its handler uses that Tool's schemas.
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions, typescript/no-unsafe-type-assertion
  const typedDefinitions = definitions as unknown as Toolkit.HandlersFrom<typeof toolkit.tools>
  const handlers = Effect.runSync(toolkit.toHandlers(typedDefinitions))
  return bindManagedTool({ tool, context: handlers })
}
export const commandTool =
  <Command, const Name extends string, ParametersSchema extends Schema.Top>(
    options: CommandToolOptions<Name, ParametersSchema, Command>,
  ) =>
  <State>(
    declaration: Declaration<State, Command>,
  ): ReturnType<typeof makeCommandTool<State, Command, Name, ParametersSchema>> =>
    makeCommandTool(declaration, options)

/** Provide the single component registry for Agent registration and execution. @experimental */
export const layer = (registrations: ReadonlyArray<Registration>): Layer.Layer<Registry, ComponentDeclarationInvalid> =>
  Layer.effect(
    Registry,
    Effect.gen(function* () {
      const namespaces = registrations.map((registration) => namespace(registration.descriptor))
      if (new Set(namespaces).size !== namespaces.length) {
        const duplicate = registrations.find((registration, index) => namespaces.indexOf(namespaces[index]!) !== index)!
        return yield* ComponentDeclarationInvalid.make({
          key: duplicate.descriptor.key,
          instance: duplicate.descriptor.instance,
          field: "key",
          reason: "duplicate-namespace",
        })
      }
      return registrations
    }),
  )

/** Provide component registrations in a test environment. @experimental */
export const layerTest = layer

/** Read the current component value without accepting a command or changing its receipts. @experimental */
export const read = <State, Command>(
  declaration: Declaration<State, Command>,
): Effect.Effect<State, ComponentStateInvalid | ComponentAccessDenied | ComponentUnavailable> =>
  Effect.gen(function* () {
    const driver = yield* Effect.serviceOption(DriverInterpreter)
    if (Option.isNone(driver))
      return yield* ComponentUnavailable.make({
        key: declaration.registration.descriptor.key,
        instance: declaration.registration.descriptor.instance,
        reason: "outside-run",
      })
    const state = yield* driver.value.componentRead(declaration.registration.capability)
    return yield* bounded({ value: state, limit: declaration.registration.descriptor.maxStateBytes }).pipe(
      Effect.mapError(() =>
        ComponentStateInvalid.make({
          key: declaration.registration.descriptor.key,
          instance: declaration.registration.descriptor.instance,
          reason: "bounds",
        }),
      ),
      Effect.flatMap((value) =>
        Schema.decodeEffect(declaration.state)(value).pipe(
          Effect.mapError(() =>
            ComponentStateInvalid.make({
              key: declaration.registration.descriptor.key,
              instance: declaration.registration.descriptor.instance,
              reason: "decode",
            }),
          ),
        ),
      ),
    )
  })

const commandResult = <State, Command>(
  declaration: Declaration<State, Command>,
  input: { readonly id?: string; readonly command: Command },
): Effect.Effect<CommandResult<State>, ComponentFailure> =>
  Effect.gen(function* () {
    const driver = yield* Effect.serviceOption(DriverInterpreter)
    if (Option.isNone(driver))
      return yield* ComponentUnavailable.make({
        key: declaration.registration.descriptor.key,
        instance: declaration.registration.descriptor.instance,
        reason: "outside-run",
      })
    const context = yield* Effect.serviceOption(ToolContext)
    const id = input.id ?? Option.getOrUndefined(context)?.operationKey
    if (id === undefined)
      return yield* ComponentCommandInvalid.make({
        key: declaration.registration.descriptor.key,
        instance: declaration.registration.descriptor.instance,
        reason: "identity",
      })
    const encoded = yield* Schema.encodeEffect(declaration.command)(input.command).pipe(
      Effect.mapError(() =>
        ComponentCommandInvalid.make({
          key: declaration.registration.descriptor.key,
          instance: declaration.registration.descriptor.instance,
          reason: "encode",
        }),
      ),
      Effect.flatMap((value) =>
        bounded({ value, limit: declaration.registration.descriptor.maxCommandBytes }).pipe(
          Effect.mapError(() =>
            ComponentCommandInvalid.make({
              key: declaration.registration.descriptor.key,
              instance: declaration.registration.descriptor.instance,
              reason: "bounds",
            }),
          ),
        ),
      ),
    )
    const result = yield* driver.value.componentCommand({
      capability: declaration.registration.capability,
      id,
      command: encoded,
    })
    const state = yield* bounded({
      value: result,
      limit: declaration.registration.descriptor.maxStateBytes,
    }).pipe(
      Effect.mapError(() =>
        ComponentStateInvalid.make({
          key: declaration.registration.descriptor.key,
          instance: declaration.registration.descriptor.instance,
          reason: "bounds",
        }),
      ),
      Effect.flatMap((value) =>
        Schema.decodeEffect(declaration.state)(value).pipe(
          Effect.mapError(() =>
            ComponentStateInvalid.make({
              key: declaration.registration.descriptor.key,
              instance: declaration.registration.descriptor.instance,
              reason: "decode",
            }),
          ),
        ),
      ),
    )
    return { state, duplicate: false }
  })

/** Accept one deterministic command. In a tool, omit id to reuse its durable operation identity. @experimental */
export const command: {
  <Command>(input: {
    readonly id?: string
    readonly command: Command
  }): <State>(declaration: Declaration<State, Command>) => Effect.Effect<State, ComponentFailure>
  <State, Command>(
    declaration: Declaration<State, Command>,
    input: { readonly id?: string; readonly command: Command },
  ): Effect.Effect<State, ComponentFailure>
} = Function.dual(
  2,
  <State, Command>(
    declaration: Declaration<State, Command>,
    input: { readonly id?: string; readonly command: Command },
  ) => commandResult(declaration, input).pipe(Effect.map((result) => result.state)),
)
