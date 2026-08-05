import { Effect, Schema } from "effect"
import type { Prompt } from "effect/unstable/ai"
import type { AgentPin, CapabilityPin } from "../durable/pin.js"
import type {
  AgentRunResult,
  ProgramAuthorizationFailure,
  ProgramCapabilityDenied,
  ProgramOperationName,
  ProgramSuspended,
} from "./program-capabilities.js"

/** @experimental Replay behavior selected by the host, never by program source. */
export const ReplayPolicy = Schema.Literals(["recorded", "idempotent", "non-idempotent"])
/** @experimental */
export type ReplayPolicy = typeof ReplayPolicy.Type

/** @experimental Host-owned authorization callback for one decoded invocation. */
export type Authorize<I> = (request: {
  readonly operation: ProgramOperationName
  readonly input: I
}) => Effect.Effect<boolean, ProgramAuthorizationFailure | ProgramCapabilityDenied | ProgramSuspended>

/** @experimental One live typed tool implementation and its exact identity. */
export interface ToolBinding<I, IE, O, OE, E = never> {
  readonly name: string
  readonly pin: CapabilityPin
  readonly input: Schema.Codec<I, IE>
  readonly output: Schema.Codec<O, OE>
  readonly replay: ReplayPolicy
  readonly authorize: Authorize<I>
  readonly execute: (input: I) => Effect.Effect<O, E>
}

/** @experimental One live typed named step implementation and its exact identity. */
export interface StepBinding<I, IE, O, OE, E = never> extends Omit<ToolBinding<I, IE, O, OE, E>, "name"> {
  readonly name: string
}

/** @experimental One exact Agent implementation callable by a program host. */
export interface AgentBinding<I extends Prompt.RawInput, IE, E = never> {
  readonly selection: string
  readonly agent: AgentPin
  readonly inputPin: CapabilityPin
  readonly input: Schema.Codec<I, IE>
  readonly replay: ReplayPolicy
  readonly authorize: Authorize<I>
  readonly execute: (input: I) => Effect.Effect<AgentRunResult, ProgramSuspended | E>
}

/**
 * @experimental One decoded invocation of a bound tool or step. The decoded input stays inside the binding, so
 * authorization and execution keep the exact type the binding declared.
 */
export interface Invocation {
  readonly authorize: (
    operation: ProgramOperationName,
  ) => Effect.Effect<boolean, ProgramAuthorizationFailure | ProgramCapabilityDenied | ProgramSuspended>
  readonly execute: Effect.Effect<unknown, unknown>
}

/** @experimental One decoded Agent invocation, exposing only the prompt every Agent input must produce. */
export interface AgentInvocation {
  readonly prompt: Prompt.RawInput
  readonly authorize: (
    operation: ProgramOperationName,
  ) => Effect.Effect<boolean, ProgramAuthorizationFailure | ProgramCapabilityDenied | ProgramSuspended>
  readonly execute: Effect.Effect<AgentRunResult, unknown>
}

/**
 * @experimental Host-facing view of one bound tool in a heterogeneous binding set. Its identity, replay policy, and
 * boundary codecs stay observable; its decoded input type is reachable only through {@link Invocation}.
 */
export interface AnyTool {
  readonly name: string
  readonly pin: CapabilityPin
  readonly input: Schema.Codec<unknown, unknown>
  readonly output: Schema.Codec<unknown, unknown>
  readonly replay: ReplayPolicy
  readonly decode: (encoded: unknown) => Effect.Effect<Invocation, Schema.SchemaError>
}

/** @experimental Host-facing view of one bound named step, with the same hidden input as {@link AnyTool}. */
export interface AnyStep extends AnyTool {}

/** @experimental Host-facing view of one bound Agent, with its decoded input hidden behind {@link AgentInvocation}. */
export interface AnyAgent {
  readonly selection: string
  readonly agent: AgentPin
  readonly inputPin: CapabilityPin
  readonly input: Schema.Codec<unknown, unknown>
  readonly replay: ReplayPolicy
  readonly decode: (encoded: unknown) => Effect.Effect<AgentInvocation, Schema.SchemaError>
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

/** @experimental Complete live authority available to a ProgramHost. */
export interface Bindings {
  readonly tools: ReadonlyArray<AnyTool>
  readonly steps: ReadonlyArray<AnyStep>
  readonly agents: ReadonlyArray<AnyAgent>
}

const decodeInput = <I, IE>(codec: Schema.Codec<I, IE>, encoded: unknown): Effect.Effect<I, Schema.SchemaError> =>
  Schema.decodeUnknownEffect(codec, { onExcessProperty: "error" })(encoded)

/** @experimental Construct a typed tool binding. */
export const tool = <I, IE, O, OE, E>(binding: ToolBinding<I, IE, O, OE, E>): AnyTool => ({
  name: binding.name,
  pin: binding.pin,
  input: binding.input,
  output: binding.output,
  replay: binding.replay,
  decode: (encoded) =>
    Effect.map(decodeInput(binding.input, encoded), (input) => ({
      authorize: (operation) => binding.authorize({ operation, input }),
      execute: Effect.suspend(() => binding.execute(input)),
    })),
})

/** @experimental Construct a typed named step binding. */
export const step = <I, IE, O, OE, E>(binding: StepBinding<I, IE, O, OE, E>): AnyStep => tool(binding)

/** @experimental Construct an exact typed Agent binding. */
export const agent = <I extends Prompt.RawInput, IE, E>(binding: AgentBinding<I, IE, E>): AnyAgent => ({
  selection: binding.selection,
  agent: binding.agent,
  inputPin: binding.inputPin,
  input: binding.input,
  replay: binding.replay,
  decode: (encoded) =>
    Effect.map(decodeInput(binding.input, encoded), (input) => ({
      prompt: input,
      authorize: (operation) => binding.authorize({ operation, input }),
      execute: Effect.suspend(() => binding.execute(input)),
    })),
})

/** @experimental Construct the host's complete live Program binding set. */
export const make = (bindings: Bindings): Bindings => {
  checkUnique(
    "tool",
    bindings.tools.map((binding) => [binding.name, binding.pin]),
  )
  checkUnique(
    "step",
    bindings.steps.map((binding) => [binding.name, binding.pin]),
  )
  checkUnique(
    "Agent",
    bindings.agents.map((binding) => [binding.selection, `${binding.agent}\0${binding.inputPin}`]),
  )
  return bindings
}
