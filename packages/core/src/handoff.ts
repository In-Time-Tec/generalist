import { Effect, Schema } from "effect"
import { AiError, Prompt, Tool, Toolkit } from "effect/unstable/ai"
import { type Agent, type Result, type RunError, type RunOptions, type RunServices, generate, make } from "./agent"
import { AgentError } from "./agent-event"
import { asTool } from "./agent-tool"
import { type TurnPolicy } from "./turn-policy"

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
export interface FanOutChild<Tools extends Record<string, Tool.Any>, HasModel extends boolean = boolean> {
  readonly agent: Agent<Tools, HasModel>
  readonly prompt: Prompt.RawInput
  readonly options?: Omit<RunOptions, "prompt">
}

/** @experimental Options for bounded same-process fan-out. */
export interface FanOutOptions {
  readonly concurrency?: number
}

/** @experimental Built supervisor agent and handled toolkit for its transfer tools. */
export interface Supervisor {
  readonly agent: Agent<Record<string, Tool.Any>, false>
  readonly toolkit: Toolkit.WithHandler<Record<string, Tool.Any>>
}

/** @experimental Options for building a transfer-tool supervisor. */
export interface SupervisorOptions {
  readonly name: string
  readonly instructions?: string
  readonly specialists: ReadonlyArray<Agent<Record<string, Tool.Any>, boolean>>
  readonly policy?: TurnPolicy
}

const transferName = (agentName: string): string => `transfer_to_${agentName}`

const positiveConcurrency = (value: number | undefined): Effect.Effect<number, AgentError> => {
  const concurrency = value ?? 4
  return Number.isInteger(concurrency) && concurrency > 0
    ? Effect.succeed(concurrency)
    : Effect.fail(
        new AgentError({
          message: "Handoff.fanOut concurrency must be a positive integer",
          turn: 0,
        }),
      )
}

const mergeHandled = (
  toolkits: ReadonlyArray<Toolkit.WithHandler<Record<string, Tool.Any>>>,
): Toolkit.WithHandler<Record<string, Tool.Any>> => {
  const tools: Record<string, Tool.Any> = {}
  for (const toolkit of toolkits) {
    Object.assign(tools, toolkit.tools)
  }
  return {
    tools,
    handle: (name, params) => {
      const toolkit = toolkits.find((candidate) => candidate.tools[name] !== undefined)
      return toolkit === undefined
        ? Effect.fail(
            AiError.make({
              module: "Handoff",
              method: `${String(name)}.handle`,
              reason: new AiError.ToolNotFoundError({
                toolName: String(name),
                availableTools: Object.keys(tools),
              }),
            }),
          )
        : toolkit.handle(name, params)
    },
  }
}

const toolkitFromHandled = (
  toolkit: Toolkit.WithHandler<Record<string, Tool.Any>>,
): Toolkit.Toolkit<Record<string, Tool.Any>> =>
  Toolkit.make(...Object.values(toolkit.tools)) as Toolkit.Toolkit<Record<string, Tool.Any>>

/** @experimental Build a `transfer_to_<agent.name>` same-process handoff tool. */
export const transferTool = <
  Tools extends Record<string, Tool.Any>,
  HasModel extends boolean,
  Parameters extends Schema.Top = DefaultTransferParameters,
  Success extends Schema.Top = typeof Schema.String,
>(
  target: Agent<Tools, HasModel>,
  options: TransferOptions<Parameters, Success> = {},
): Toolkit.WithHandler<Record<string, Tool.Any>> =>
  asTool(target, {
    name: options.nameOverride ?? transferName(target.name),
    description: options.description ?? `Transfer to ${target.name}`,
    ...(options.parameters === undefined ? {} : { parameters: options.parameters }),
    ...(options.success === undefined ? {} : { success: options.success }),
    ...(options.toPrompt === undefined ? {} : { toPrompt: options.toPrompt }),
    ...(options.fromResult === undefined ? {} : { fromResult: options.fromResult }),
  }) as Toolkit.WithHandler<Record<string, Tool.Any>>

/** @experimental Run isolated child agents concurrently and preserve input order. */
export const fanOut = <Tools extends Record<string, Tool.Any>, HasModel extends boolean>(
  children: ReadonlyArray<FanOutChild<Tools, HasModel>>,
  options: FanOutOptions = {},
): Effect.Effect<ReadonlyArray<Result>, RunError, RunServices<Tools, HasModel>> =>
  positiveConcurrency(options.concurrency).pipe(
    Effect.flatMap((concurrency) =>
      Effect.forEach(children, (child) => generate(child.agent, { ...child.options, prompt: child.prompt }), {
        concurrency,
      }),
    ),
  )

/** @experimental Build a supervisor agent plus handled transfer-tool toolkit. */
export const supervisor = (options: SupervisorOptions): Supervisor => {
  const transferTools = options.specialists.map((specialist) => transferTool(specialist))
  const toolkit = mergeHandled(transferTools)
  return {
    agent: make({
      name: options.name,
      ...(options.instructions === undefined ? {} : { instructions: options.instructions }),
      toolkit: toolkitFromHandled(toolkit),
      ...(options.policy === undefined ? {} : { policy: options.policy }),
    }),
    toolkit,
  }
}
