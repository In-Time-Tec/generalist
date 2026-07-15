import { Effect, Function, Schema } from "effect"
import { AiError, Prompt, Tool, Toolkit } from "effect/unstable/ai"
import { type Agent, type Result, type RunError, type RunOptions, type RunServices, generate, make } from "./agent.js"
import { AgentError } from "./agent-event.js"
import { type AgentToolToolkit, asTool } from "./agent-tool.js"
import { type TurnPolicy } from "./turn-policy.js"

const defaultTransferParameters = Schema.Struct({ prompt: Schema.String })

type DefaultTransferParameters = typeof defaultTransferParameters

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
export interface FanOutChild<
  Tools extends Record<string, Tool.Any>,
  HasModel extends boolean = boolean,
  PolicyServices = never,
> {
  readonly agent: Agent<Tools, HasModel, PolicyServices>
  readonly prompt: Prompt.RawInput
  readonly options?: Omit<RunOptions, "prompt">
}

/** @experimental Options for bounded same-process fan-out. */
export interface FanOutOptions {
  readonly concurrency?: number
}

/** @experimental Built supervisor agent and handled toolkit for its transfer tools. */
export interface Supervisor<
  Tools extends Record<string, Tool.Any>,
  HasModel extends boolean,
  SpecialistPolicyServices = never,
  SupervisorPolicyServices = never,
> {
  readonly agent: Agent<
    Record<
      string,
      Tool.Tool<
        string,
        {
          readonly parameters: DefaultTransferParameters
          readonly success: typeof Schema.String
          readonly failure: typeof Schema.String
          readonly failureMode: "return"
        },
        RunServices<Tools, HasModel, SpecialistPolicyServices>
      >
    >,
    false,
    SupervisorPolicyServices
  >
  readonly toolkit: AgentToolToolkit<
    string,
    DefaultTransferParameters,
    typeof Schema.String,
    RunServices<Tools, HasModel, SpecialistPolicyServices>
  >
}

/** @experimental Options for building a transfer-tool supervisor. */
export interface SupervisorOptions<
  Tools extends Record<string, Tool.Any>,
  HasModel extends boolean,
  SpecialistPolicyServices = never,
  SupervisorPolicyServices = never,
> {
  readonly name: string
  readonly instructions?: string
  readonly specialists: ReadonlyArray<Agent<Tools, HasModel, SpecialistPolicyServices>>
  readonly policy?: TurnPolicy<SupervisorPolicyServices>
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

const mergeHandled = <Tools extends Record<string, Tool.Any>>(
  toolkits: ReadonlyArray<Toolkit.WithHandler<Tools>>,
): Toolkit.WithHandler<Tools> => {
  const entries = new Map<string, { readonly tool: Tool.Any; readonly toolkit: Toolkit.WithHandler<Tools> }>()
  for (const toolkit of toolkits) {
    for (const tool of Object.values(toolkit.tools)) {
      if (!entries.has(tool.name)) entries.set(tool.name, { tool, toolkit })
    }
  }
  const tools = Object.fromEntries([...entries].map(([name, entry]) => [name, entry.tool]))
  return {
    tools: tools as Tools,
    handle: (name, params) => {
      const entry = entries.get(String(name))
      return entry === undefined
        ? Effect.fail(
            AiError.make({
              module: "Handoff",
              method: `${String(name)}.handle`,
              reason: AiError.ToolNotFoundError.make({
                toolName: String(name),
                availableTools: Object.keys(tools),
              }),
            }),
          )
        : entry.toolkit.handle(name, params)
    },
  }
}

const toolkitFromHandled = <Tools extends Record<string, Tool.Any>>(
  toolkit: Toolkit.WithHandler<Tools>,
): Toolkit.Toolkit<Tools> => Toolkit.make(...Object.values(toolkit.tools)) as unknown as Toolkit.Toolkit<Tools>

/** @experimental Build a `transfer_to_<agent.name>` same-process handoff tool. */
export const transferTool: {
  <Parameters extends Schema.Top = DefaultTransferParameters, Success extends Schema.Top = typeof Schema.String>(
    options?: TransferOptions<Parameters, Success>,
  ): <Tools extends Record<string, Tool.Any>, HasModel extends boolean, PolicyServices = never>(
    target: Agent<Tools, HasModel, PolicyServices>,
  ) => AgentToolToolkit<string, Parameters, Success, RunServices<Tools, HasModel, PolicyServices>>
  <
    Tools extends Record<string, Tool.Any>,
    HasModel extends boolean,
    Parameters extends Schema.Top = DefaultTransferParameters,
    Success extends Schema.Top = typeof Schema.String,
    PolicyServices = never,
  >(
    target: Agent<Tools, HasModel, PolicyServices>,
    options?: TransferOptions<Parameters, Success>,
  ): AgentToolToolkit<string, Parameters, Success, RunServices<Tools, HasModel, PolicyServices>>
} = Function.dual(
  (args) => args.length !== 1 || "name" in args[0],
  <
    Tools extends Record<string, Tool.Any>,
    HasModel extends boolean,
    Parameters extends Schema.Top = DefaultTransferParameters,
    Success extends Schema.Top = typeof Schema.String,
    PolicyServices = never,
  >(
    target: Agent<Tools, HasModel, PolicyServices>,
    options: TransferOptions<Parameters, Success> = {},
  ): AgentToolToolkit<string, Parameters, Success, RunServices<Tools, HasModel, PolicyServices>> =>
    asTool(target, {
      name: options.nameOverride ?? transferName(target.name),
      description: options.description ?? `Transfer to ${target.name}`,
      ...(options.parameters === undefined ? {} : { parameters: options.parameters }),
      ...(options.success === undefined ? {} : { success: options.success }),
      ...(options.toPrompt === undefined ? {} : { toPrompt: options.toPrompt }),
      ...(options.fromResult === undefined ? {} : { fromResult: options.fromResult }),
    }),
)

/** @experimental Run isolated child agents concurrently and preserve input order. */
export const fanOut: {
  <Tools extends Record<string, Tool.Any>, HasModel extends boolean, PolicyServices = never>(
    options?: FanOutOptions,
  ): (
    children: ReadonlyArray<FanOutChild<Tools, HasModel, PolicyServices>>,
  ) => Effect.Effect<ReadonlyArray<Result>, RunError, RunServices<Tools, HasModel, PolicyServices>>
  <Tools extends Record<string, Tool.Any>, HasModel extends boolean, PolicyServices = never>(
    children: ReadonlyArray<FanOutChild<Tools, HasModel, PolicyServices>>,
    options?: FanOutOptions,
  ): Effect.Effect<ReadonlyArray<Result>, RunError, RunServices<Tools, HasModel, PolicyServices>>
} = Function.dual(
  (args) => args.length !== 1 || Array.isArray(args[0]),
  <Tools extends Record<string, Tool.Any>, HasModel extends boolean, PolicyServices>(
    children: ReadonlyArray<FanOutChild<Tools, HasModel, PolicyServices>>,
    options: FanOutOptions = {},
  ): Effect.Effect<ReadonlyArray<Result>, RunError, RunServices<Tools, HasModel, PolicyServices>> =>
    positiveConcurrency(options.concurrency).pipe(
      Effect.flatMap((concurrency) =>
        Effect.forEach(children, (child) => generate(child.agent, { ...child.options, prompt: child.prompt }), {
          concurrency,
        }),
      ),
    ),
)

/** @experimental Build a supervisor agent plus handled transfer-tool toolkit. */
export const supervisor = <
  Tools extends Record<string, Tool.Any>,
  HasModel extends boolean,
  SpecialistPolicyServices = never,
  SupervisorPolicyServices = never,
>(
  options: SupervisorOptions<Tools, HasModel, SpecialistPolicyServices, SupervisorPolicyServices>,
): Supervisor<Tools, HasModel, SpecialistPolicyServices, SupervisorPolicyServices> => {
  const transferTools = options.specialists.map((specialist) => transferTool(specialist))
  const toolkit = mergeHandled(transferTools)
  const agent = make({
    name: options.name,
    ...(options.instructions === undefined ? {} : { instructions: options.instructions }),
    toolkit: toolkitFromHandled(toolkit),
    ...(options.policy === undefined ? {} : { policy: options.policy }),
  })
  return {
    agent: {
      ...agent,
      toolDeclarations: transferTools.flatMap((transfer, index) =>
        Object.values(transfer.tools).map((tool) => ({
          tool,
          origin: { _tag: "Handoff" as const, specialist: options.specialists[index]!.name },
        })),
      ),
    },
    toolkit,
  }
}
