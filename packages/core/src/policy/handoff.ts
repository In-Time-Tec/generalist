import { Array, Effect, Function, Layer, Schema } from "effect"
import { LanguageModel, Prompt, Tool } from "effect/unstable/ai"
import {
  type Agent,
  type Result,
  type RunError,
  type RunOptions,
  type RunResult,
  type RunRequirements,
  generate,
  make,
} from "../agent/agent.js"
import { AgentError } from "../agent/agent-event.js"
import { type AgentToolToolkit, asTool } from "../agent/agent-tool.js"
import { type ClosedToolSet } from "../tools/tool-executor.js"
import { type TurnPolicy } from "../turn/turn-policy.js"
import { HandoffCatalog, layerCatalog, type HandoffTarget } from "./handoff-target.js"
import { handoffToolSpec } from "./handoff-runtime.js"
import { registerHandoffToolMeta } from "./handoff-tool-meta.js"
import type { ContextProjection } from "./handoff-projection.js"

const defaultDelegateParameters = Schema.Struct({ prompt: Schema.String })

type DefaultDelegateParameters = typeof defaultDelegateParameters

export class RegistrationError extends Schema.TaggedErrorClass<RegistrationError>()("@batonfx/core/RegistrationError", {
  agent: Schema.String,
  message: Schema.String,
  cause: Schema.Unknown,
}) {}

export interface Registration {
  readonly name: string
  readonly run: <O extends RunOptions>(
    options: O,
  ) => Effect.Effect<RunResult<O>, RunError | RegistrationError, RunRequirements<never, O>>
  readonly requirements: (value: never) => never
}

export const register = <Tools extends Record<string, Tool.Any>, R, E>(
  agent: Agent<Tools, R>,
  layer: Layer.Layer<R, E, never>,
): Registration => {
  const registrationLayer = Layer.effectContext(
    Layer.build(layer).pipe(
      Effect.mapError((cause) =>
        RegistrationError.make({
          agent: agent.name,
          message: `Failed to build services for agent '${agent.name}'`,
          cause,
        }),
      ),
    ),
  )
  return {
    name: agent.name,
    run: (options) => generate(agent, options).pipe(Effect.provide(registrationLayer)),
    requirements: (value) => value,
  }
}

export interface DelegateOptions<
  Parameters extends Schema.Top = DefaultDelegateParameters,
  Success extends Schema.Top = typeof Schema.String,
> {
  readonly nameOverride?: string
  readonly description?: string
  readonly parameters?: Parameters
  readonly success?: Success
  readonly toPrompt?: (params: Parameters["Type"]) => Prompt.RawInput
  readonly fromResult?: (result: Result) => Success["Type"]
}

export interface HandoffToolOptions {
  readonly nameOverride?: string
  readonly description?: string
  readonly projection?: ContextProjection
  readonly maxRepeatedEdge?: number
}

export interface FanOutChild {
  readonly registration: Registration
  readonly prompt: Prompt.RawInput
  readonly options?: Omit<RunOptions, "prompt" | "output" | "memory" | "persistence">
}

export interface FanOutOptions {
  readonly concurrency?: number
}

export interface Supervisor<R> {
  readonly agent: Agent<Record<string, Tool.Any>, R | LanguageModel.LanguageModel>
  readonly toolkit: ClosedToolSet<never, Tool.Any>
  readonly catalog: Layer.Layer<HandoffCatalog>
}

export interface SupervisorOptions {
  readonly name: string
  readonly instructions?: string
  readonly specialists: ReadonlyArray<HandoffTarget>
  readonly policy?: TurnPolicy
  readonly handoffOptions?: HandoffToolOptions
}

const positiveConcurrency = (value: number | undefined): Effect.Effect<number, AgentError> => {
  const concurrency = value ?? 4
  return Number.isInteger(concurrency) && concurrency > 0
    ? Effect.succeed(concurrency)
    : Effect.fail(
        AgentError.make({
          message: "Handoff.fanOut concurrency must be a positive integer",
          turn: 0,
        }),
      )
}

type HandoffToolkit = {
  readonly name: string
  readonly tool: Tool.Any
  readonly tools: Record<string, Tool.Any>
  readonly invoke: (params: unknown) => Effect.Effect<unknown, string>
}

const mergeHandoffTools = (toolkits: ReadonlyArray<HandoffToolkit>): ClosedToolSet<never, Tool.Any> => {
  const entries = new Map<string, HandoffToolkit>()
  for (const toolkit of toolkits) {
    if (!entries.has(toolkit.name)) entries.set(toolkit.name, toolkit)
  }
  const tools: Record<string, Tool.Any> = {}
  for (const [name, entry] of entries) tools[name] = entry.tool
  return {
    tools,
    invoke: (name, params) => {
      const entry = entries.get(name)
      return entry === undefined ? Effect.fail(`Tool ${name} is not registered`) : entry.invoke(params)
    },
  }
}

export const delegateTool: {
  <Parameters extends Schema.Top = DefaultDelegateParameters, Success extends Schema.Top = typeof Schema.String>(
    options?: DelegateOptions<Parameters, Success>,
  ): (target: Registration) => AgentToolToolkit<string, Parameters, Success, never>
  <Parameters extends Schema.Top = DefaultDelegateParameters, Success extends Schema.Top = typeof Schema.String>(
    target: Registration,
    options?: DelegateOptions<Parameters, Success>,
  ): AgentToolToolkit<string, Parameters, Success, never>
} = Function.dual(
  (args) => args.length !== 1 || "run" in args[0],
  <Parameters extends Schema.Top = DefaultDelegateParameters, Success extends Schema.Top = typeof Schema.String>(
    registration: Registration,
    options: DelegateOptions<Parameters, Success> = {},
  ): AgentToolToolkit<string, Parameters, Success, never> =>
    asTool(registration, {
      name: options.nameOverride ?? `delegate_to_${registration.name}`,
      description: options.description ?? `Delegate to ${registration.name} as an inline child run`,
      ...(options.parameters === undefined ? {} : { parameters: options.parameters }),
      ...(options.success === undefined ? {} : { success: options.success }),
      ...(options.toPrompt === undefined ? {} : { toPrompt: options.toPrompt }),
      ...(options.fromResult === undefined ? {} : { fromResult: options.fromResult }),
    }),
)

export const sameRunHandoffTool = (handoffTarget: HandoffTarget, options: HandoffToolOptions = {}): HandoffToolkit => {
  const spec = handoffToolSpec(handoffTarget, options)
  registerHandoffToolMeta(spec.tool.name, {
    specialist: spec.specialist,
    ...(spec.projection === undefined ? {} : { projection: spec.projection }),
    ...(spec.maxRepeatedEdge === undefined ? {} : { maxRepeatedEdge: spec.maxRepeatedEdge }),
  })
  return {
    name: spec.tool.name,
    tool: spec.tool,
    tools: { [spec.tool.name]: spec.tool },
    invoke: () => Effect.fail("Same-run handoff tools execute through the agent loop, not direct invocation"),
  }
}

export const fanOut: {
  (
    options: FanOutOptions,
  ): (children: ReadonlyArray<FanOutChild>) => Effect.Effect<ReadonlyArray<Result>, RunError | RegistrationError>
  (): (children: ReadonlyArray<FanOutChild>) => Effect.Effect<ReadonlyArray<Result>, RunError | RegistrationError>
  (
    children: ReadonlyArray<FanOutChild>,
    options?: FanOutOptions,
  ): Effect.Effect<ReadonlyArray<Result>, RunError | RegistrationError>
} = Function.dual(
  (args) => args.length > 1 || globalThis.Array.isArray(args[0]),
  (
    children: ReadonlyArray<FanOutChild>,
    options: FanOutOptions = {},
  ): Effect.Effect<ReadonlyArray<Result>, RunError | RegistrationError> =>
    positiveConcurrency(options.concurrency).pipe(
      Effect.flatMap((concurrency) =>
        Effect.forEach(children, (child) => child.registration.run({ ...child.options, prompt: child.prompt }), {
          concurrency,
        }),
      ),
    ),
)

export const supervisor = (options: SupervisorOptions): Supervisor<never> => {
  const specialists = options.specialists
  const handoffTools = specialists.map((specialist) => sameRunHandoffTool(specialist, options.handoffOptions ?? {}))
  const toolkit = mergeHandoffTools(handoffTools)
  const agent = make({
    name: options.name,
    ...(options.instructions === undefined ? {} : { instructions: options.instructions }),
    tools: Object.values(toolkit.tools),
    ...(options.policy === undefined ? {} : { policy: options.policy }),
  })
  return {
    agent: {
      ...agent,
      toolDeclarations: Array.zip(specialists, handoffTools).flatMap(([specialist, handoff]) =>
        Object.values(handoff.tools).map((tool) => ({
          tool,
          origin: { _tag: "Handoff" as const, specialist: specialist.name, mode: "same-run" as const },
        })),
      ),
    },
    toolkit,
    catalog: layerCatalog(specialists),
  }
}

export { target, layerCatalog, HandoffCatalog, type HandoffTarget } from "./handoff-target.js"
export {
  HandoffInput,
  HandoffOutput,
  defaultContextProjection,
  filterContextProjection,
  HandoffProjectionInvalid,
} from "./handoff-projection.js"
export { executeSameRunHandoff, HandoffRejected } from "./handoff-runtime.js"
