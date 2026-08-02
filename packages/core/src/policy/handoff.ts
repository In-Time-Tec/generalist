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

const defaultTransferParameters = Schema.Struct({ prompt: Schema.String })

type DefaultTransferParameters = typeof defaultTransferParameters

/** @experimental A failure while constructing the services for a registered agent. */
export class RegistrationError extends Schema.TaggedErrorClass<RegistrationError>()("@batonfx/core/RegistrationError", {
  agent: Schema.String,
  message: Schema.String,
  cause: Schema.Unknown,
}) {}

/** @experimental A service-free, closed agent registration. */
export interface Registration {
  readonly name: string
  readonly run: <O extends RunOptions>(
    options: O,
  ) => Effect.Effect<RunResult<O>, RunError | RegistrationError, RunRequirements<never, O>>
  readonly requirements: (value: never) => never
}

/** @experimental Register an agent with the complete service layer required by its runs. */
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

/** @experimental Options for a conventionally named transfer tool. */
export interface TransferOptions<
  Parameters extends Schema.Top = DefaultTransferParameters,
  Success extends Schema.Top = typeof Schema.String,
> {
  readonly nameOverride?: string
  readonly description?: string
  readonly parameters?: Parameters
  readonly success?: Success
  readonly toPrompt?: (params: Parameters["Type"]) => Prompt.RawInput
  readonly fromResult?: (result: Result) => Success["Type"]
}

/** @experimental One child run in a bounded fan-out. */
export interface FanOutChild {
  readonly registration: Registration
  readonly prompt: Prompt.RawInput
  readonly options?: Omit<RunOptions, "prompt" | "output" | "memory" | "persistence">
}

/** @experimental Options for bounded same-process fan-out. */
export interface FanOutOptions {
  readonly concurrency?: number
}

/** @experimental Built supervisor agent and handled toolkit for its transfer tools. */
export interface Supervisor<R> {
  readonly agent: Agent<Record<string, Tool.Any>, R | LanguageModel.LanguageModel>
  readonly toolkit: ClosedToolSet<never>
}

/** @experimental Options for building a transfer-tool supervisor. */
export interface SupervisorOptions {
  readonly name: string
  readonly instructions?: string
  readonly specialists: ReadonlyArray<Registration>
  readonly policy?: TurnPolicy
}

const transferName = (agentName: string): string => `transfer_to_${agentName}`

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

type TransferToolkit<Parameters extends Schema.Top, Success extends Schema.Top> = AgentToolToolkit<
  string,
  Parameters,
  Success,
  never
>
type TransferInvocation = Effect.Effect<unknown, string>

const mergeHandled = <Parameters extends Schema.Top, Success extends Schema.Top>(
  toolkits: ReadonlyArray<TransferToolkit<Parameters, Success>>,
): ClosedToolSet<never> => {
  const entries = new Map<
    string,
    { readonly tool: Tool.Any; readonly invoke: (params: unknown) => TransferInvocation }
  >()
  for (const toolkit of toolkits) {
    for (const name of Object.keys(toolkit.tools)) {
      const tool = toolkit.tools[name]
      if (tool !== undefined && !entries.has(name)) {
        entries.set(name, { tool, invoke: (params) => toolkit.invoke(params) })
      }
    }
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

/** @experimental Build a `transfer_to_<agent.name>` same-process handoff tool. */
export const transferTool: {
  <Parameters extends Schema.Top = DefaultTransferParameters, Success extends Schema.Top = typeof Schema.String>(
    options?: TransferOptions<Parameters, Success>,
  ): (target: Registration) => AgentToolToolkit<string, Parameters, Success, never>
  <Parameters extends Schema.Top = DefaultTransferParameters, Success extends Schema.Top = typeof Schema.String>(
    target: Registration,
    options?: TransferOptions<Parameters, Success>,
  ): AgentToolToolkit<string, Parameters, Success, never>
} = Function.dual(
  (args) => args.length !== 1 || "run" in args[0],
  <Parameters extends Schema.Top = DefaultTransferParameters, Success extends Schema.Top = typeof Schema.String>(
    target: Registration,
    options: TransferOptions<Parameters, Success> = {},
  ): AgentToolToolkit<string, Parameters, Success, never> =>
    asTool(target, {
      name: options.nameOverride ?? transferName(target.name),
      description: options.description ?? `Transfer to ${target.name}`,
      ...(options.parameters === undefined ? {} : { parameters: options.parameters }),
      ...(options.success === undefined ? {} : { success: options.success }),
      ...(options.toPrompt === undefined ? {} : { toPrompt: options.toPrompt }),
      ...(options.fromResult === undefined ? {} : { fromResult: options.fromResult }),
    }),
)

/** @experimental Run isolated registered agents concurrently and preserve input order. */
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

/** @experimental Build a supervisor agent plus handled transfer-tool toolkit. */
export const supervisor = (options: SupervisorOptions): Supervisor<never> => {
  const specialists = options.specialists
  const transferTools = specialists.map((specialist) => transferTool(specialist))
  const toolkit = mergeHandled(transferTools)
  const agent = make({
    name: options.name,
    ...(options.instructions === undefined ? {} : { instructions: options.instructions }),
    tools: Object.values(toolkit.tools),
    ...(options.policy === undefined ? {} : { policy: options.policy }),
  })
  return {
    agent: {
      ...agent,
      toolDeclarations: Array.zip(specialists, transferTools).flatMap(([specialist, transfer]) =>
        Object.values(transfer.tools).map((tool) => ({
          tool,
          origin: { _tag: "Handoff" as const, specialist: specialist.name },
        })),
      ),
    },
    toolkit,
  }
}
