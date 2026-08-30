import { Effect, Schema } from "effect"
import type { Prompt } from "effect/unstable/ai"
import type { AgentPin, CapabilityPin } from "../durable/pin.js"
import {
  ProgramCancelled,
  ProgramInvocationFailure,
  ProgramSuspended,
  type AgentRunResult,
  type ProgramAuthorizationFailure,
  type ProgramCapabilityDenied,
  type ProgramOperationName,
} from "./capabilities.js"

/** @experimental Replay behavior selected by the host, never by program source. */
export const ProgramReplayPolicy = Schema.Literals(["recorded", "idempotent", "non-idempotent"])
/** @experimental */
export type ProgramReplayPolicy = typeof ProgramReplayPolicy.Type

/** @experimental Host-owned authorization callback for one decoded invocation. */
export type Authorize<I> = (request: {
  readonly operation: ProgramOperationName
  readonly input: I
}) => Effect.Effect<boolean, ProgramAuthorizationFailure | ProgramCapabilityDenied | ProgramSuspended>

/** @experimental One live typed tool implementation and its exact identity. */
export interface ToolHandler<I, IE, O, OE, E = never> {
  readonly name: string
  readonly pin: CapabilityPin
  readonly input: Schema.Codec<I, IE>
  readonly output: Schema.Codec<O, OE>
  readonly replay: ProgramReplayPolicy
  readonly authorize: Authorize<I>
  readonly execute: (input: I) => Effect.Effect<O, E>
}

/** @experimental One live typed named step implementation and its exact identity. */
export interface StepHandler<I, IE, O, OE, E = never> extends Omit<ToolHandler<I, IE, O, OE, E>, "name"> {
  readonly name: string
}

/** @experimental One exact Agent implementation callable by a program host. */
export interface AgentHandler<I extends Prompt.RawInput, IE, E = never> {
  readonly selection: string
  readonly agent: AgentPin
  readonly inputPin: CapabilityPin
  readonly input: Schema.Codec<I, IE>
  readonly replay: ProgramReplayPolicy
  readonly authorize: Authorize<I>
  readonly execute: (input: I) => Effect.Effect<AgentRunResult, ProgramSuspended | E>
}

/**
 * @experimental One decoded invocation of a tool or step. The decoded input stays inside the handler, so
 * authorization and execution keep the exact type the handler declared.
 */
export interface Invocation<O = unknown, E = ProgramInvocationFailure | ProgramSuspended | ProgramCancelled> {
  readonly authorize: (
    operation: ProgramOperationName,
  ) => Effect.Effect<boolean, ProgramAuthorizationFailure | ProgramCapabilityDenied | ProgramSuspended>
  readonly execute: Effect.Effect<O, E>
}

/** @experimental One decoded Agent invocation, exposing only the prompt every Agent input must produce. */
export interface AgentInvocation {
  readonly prompt: Prompt.RawInput
  readonly authorize: (
    operation: ProgramOperationName,
  ) => Effect.Effect<boolean, ProgramAuthorizationFailure | ProgramCapabilityDenied | ProgramSuspended>
  readonly execute: Effect.Effect<AgentRunResult, ProgramInvocationFailure | ProgramSuspended | ProgramCancelled>
}

/**
 * @experimental Host-facing view of one tool in a heterogeneous handler set. Its identity, replay policy, and
 * boundary codecs stay observable; its decoded input type is reachable only through {@link Invocation}.
 */
export interface AnyTool {
  readonly name: string
  readonly pin: CapabilityPin
  readonly input: Schema.Codec<unknown, unknown>
  readonly output: Schema.Codec<unknown, unknown>
  readonly replay: ProgramReplayPolicy
  readonly decode: (encoded: typeof Schema.Unknown.Type) => Effect.Effect<Invocation, Schema.SchemaError>
}

/** @experimental Host-facing view of one named step, with the same hidden input as {@link AnyTool}. */
export type AnyStep = AnyTool

/** @experimental A tool handler retaining its exact decoded invocation types. */
export type TypedTool = AnyTool & {
  readonly decode: (encoded: typeof Schema.Unknown.Type) => Effect.Effect<Invocation, Schema.SchemaError>
}

/** @experimental A step handler retaining its exact decoded invocation types. */
export type TypedStep = TypedTool

/** @experimental Host-facing view of one Agent handler, with its decoded input hidden behind {@link AgentInvocation}. */
export interface AnyAgent {
  readonly selection: string
  readonly agent: AgentPin
  readonly inputPin: CapabilityPin
  readonly input: Schema.Codec<unknown, unknown>
  readonly replay: ProgramReplayPolicy
  readonly decode: (encoded: typeof Schema.Unknown.Type) => Effect.Effect<AgentInvocation, Schema.SchemaError>
}

const checkUnique = (kind: string, values: ReadonlyArray<readonly [string, string]>): void => {
  const names = new Set<string>()
  const pins = new Set<string>()
  for (const [name, pin] of values) {
    if (names.has(name)) throw new TypeError(`Duplicate ${kind} name: ${name}`)
    if (pins.has(pin)) throw new TypeError(`Duplicate ${kind} pin: ${pin}`)
    names.add(name)
    pins.add(pin)
  }
}

/** @experimental Complete live authority available to a ProgramRunner. */
export interface Handlers {
  readonly tools: ReadonlyArray<TypedTool>
  readonly steps: ReadonlyArray<TypedStep>
  readonly agents: ReadonlyArray<AnyAgent>
}

const decodeInput = <I, IE>(
  codec: Schema.Codec<I, IE>,
  encoded: typeof Schema.Unknown.Type,
): Effect.Effect<I, Schema.SchemaError> => Schema.decodeUnknownEffect(codec, { onExcessProperty: "error" })(encoded)

/** @experimental Construct a typed tool handler. */
export const tool = <I, IE, O, OE, E>(
  handler: ToolHandler<I, IE, O, OE, E>,
): TypedTool & {
  readonly decode: (encoded: typeof Schema.Unknown.Type) => Effect.Effect<Invocation<O>, Schema.SchemaError>
} => ({
  name: handler.name,
  pin: handler.pin,
  input: handler.input,
  output: handler.output,
  replay: handler.replay,
  decode: (encoded) =>
    Effect.map(
      decodeInput(handler.input, encoded),
      (input): Invocation<O> => ({
        authorize: (operation) => handler.authorize({ operation, input }),
        execute: Effect.suspend(() => handler.execute(input)).pipe(
          Effect.catch(
            (cause): Effect.Effect<O, ProgramInvocationFailure | ProgramSuspended | ProgramCancelled> =>
              Schema.is(ProgramSuspended)(cause) || Schema.is(ProgramCancelled)(cause)
                ? Effect.fail(cause)
                : Effect.fail(ProgramInvocationFailure.make({ cause })),
          ),
        ),
      }),
    ),
})

/** @experimental Construct a typed named step handler. */
export const step = <I, IE, O, OE, E>(
  handler: StepHandler<I, IE, O, OE, E>,
): TypedStep & {
  readonly decode: (encoded: typeof Schema.Unknown.Type) => Effect.Effect<Invocation<O>, Schema.SchemaError>
} => tool(handler)

/** @experimental Construct an exact typed Agent handler. */
export const agent = <I extends Prompt.RawInput, IE, E>(handler: AgentHandler<I, IE, E>): AnyAgent => ({
  selection: handler.selection,
  agent: handler.agent,
  inputPin: handler.inputPin,
  input: handler.input,
  replay: handler.replay,
  decode: (encoded) =>
    Effect.map(
      decodeInput(handler.input, encoded),
      (input): AgentInvocation => ({
        prompt: input,
        authorize: (operation) => handler.authorize({ operation, input }),
        execute: Effect.suspend(() => handler.execute(input)).pipe(
          Effect.catch(
            (cause): Effect.Effect<AgentRunResult, ProgramInvocationFailure | ProgramSuspended | ProgramCancelled> =>
              Schema.is(ProgramSuspended)(cause) || Schema.is(ProgramCancelled)(cause)
                ? Effect.fail(cause)
                : Effect.fail(ProgramInvocationFailure.make({ cause })),
          ),
        ),
      }),
    ),
})

/** @experimental Construct the runner's complete live Program handler set. */
export const make = (handlers: Handlers): Handlers => {
  checkUnique(
    "tool",
    handlers.tools.map((handler) => [handler.name, handler.pin]),
  )
  checkUnique(
    "step",
    handlers.steps.map((handler) => [handler.name, handler.pin]),
  )
  checkUnique(
    "Agent",
    handlers.agents.map((handler) => [handler.selection, `${handler.agent}\0${handler.inputPin}`]),
  )
  return handlers
}
