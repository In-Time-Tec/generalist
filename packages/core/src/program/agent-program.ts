import { Effect, Schema, Scope } from "effect"
import type { NamedCapability } from "../durable/agent-manifest.js"
import {
  make as makeManifest,
  type PinnedProgram,
  type ProgramAgentCapability,
  type ProgramBudget,
} from "../durable/program-manifest.js"
import type { CapabilityPin } from "../durable/pin.js"
import { ProgramSchemaFailure } from "./program-capabilities.js"
import { ProgramHost, type ExecutionFailure } from "./program-host.js"

/** @experimental An exact Agent Program paired with its input and output codecs. */
export interface Program<I, IE, O, OE> {
  readonly pinned: PinnedProgram
  readonly input: Schema.Codec<I, IE>
  readonly output: Schema.Codec<O, OE>
}

/** @experimental Construct and pin an Agent Program without evaluating its source. */
export const make = <I, IE, O, OE>(input: {
  readonly name: string
  readonly source: string
  readonly sandbox: CapabilityPin
  readonly input: Schema.Codec<I, IE>
  readonly inputPin: CapabilityPin
  readonly output: Schema.Codec<O, OE>
  readonly outputPin: CapabilityPin
  readonly tools: ReadonlyArray<NamedCapability>
  readonly agents: ReadonlyArray<ProgramAgentCapability>
  readonly steps: ReadonlyArray<NamedCapability>
  readonly budget: ProgramBudget
}): Program<I, IE, O, OE> => ({
  pinned: makeManifest({
    name: input.name,
    source: { language: "javascript", text: input.source },
    sandbox: input.sandbox,
    input: input.inputPin,
    output: input.outputPin,
    capabilities: { tools: input.tools, agents: input.agents, steps: input.steps },
    budget: input.budget,
  }),
  input: input.input,
  output: input.output,
})

/** @experimental Execute a trusted, caller-supplied Agent Program through the configured sandbox boundary. */
export const run = <I, IE, O, OE>(
  program: Program<I, IE, O, OE>,
  input: I,
): Effect.Effect<O, ProgramSchemaFailure | ExecutionFailure, ProgramHost | Scope.Scope> =>
  Effect.gen(function* () {
    const encoded = yield* Schema.encodeEffect(program.input)(input).pipe(
      Effect.mapError((error) => ProgramSchemaFailure.make({ boundary: "program-input", message: String(error) })),
    )
    const host = yield* ProgramHost
    const output = yield* host.execute({ program: program.pinned, input: encoded })
    return yield* Schema.decodeUnknownEffect(program.output)(output).pipe(
      Effect.mapError((error) => ProgramSchemaFailure.make({ boundary: "program-output", message: String(error) })),
    )
  })
