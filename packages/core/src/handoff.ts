import { Effect, Schema } from "effect"
import * as Ai from "effect/unstable/ai"
import * as Agent from "./agent"
import * as AgentEvent from "./agent-event"
import * as AgentTool from "./agent-tool"
import type * as TurnPolicy from "./turn-policy"

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
  readonly toPrompt?: (params: Parameters["Type"]) => Ai.Prompt.RawInput
  readonly fromResult?: (result: Agent.Result) => Success["Type"]
}

/** @experimental One child run in a bounded fan-out. */
export interface FanOutChild<Tools extends Record<string, Ai.Tool.Any>> {
  readonly agent: Agent.Agent<Tools>
  readonly prompt: Ai.Prompt.RawInput
  readonly options?: Omit<Agent.RunOptions, "prompt">
}

/** @experimental Options for bounded same-process fan-out. */
export interface FanOutOptions {
  readonly concurrency?: number
}

/** @experimental Built supervisor agent and handled toolkit for its transfer tools. */
export interface Supervisor {
  readonly agent: Agent.Agent<Record<string, Ai.Tool.Any>>
  readonly toolkit: Ai.Toolkit.WithHandler<Record<string, Ai.Tool.Any>>
}

/** @experimental Options for building a transfer-tool supervisor. */
export interface SupervisorOptions {
  readonly name: string
  readonly instructions?: string
  readonly specialists: ReadonlyArray<Agent.Agent<Record<string, Ai.Tool.Any>>>
  readonly policy?: TurnPolicy.TurnPolicy
}

const transferName = (agentName: string): string => `transfer_to_${agentName}`

const positiveConcurrency = (value: number | undefined): Effect.Effect<number, AgentEvent.AgentError> => {
  const concurrency = value ?? 4
  return Number.isInteger(concurrency) && concurrency > 0
    ? Effect.succeed(concurrency)
    : Effect.fail(
        new AgentEvent.AgentError({
          message: "Handoff.fanOut concurrency must be a positive integer",
          turn: 0,
        }),
      )
}

const mergeHandled = (
  toolkits: ReadonlyArray<Ai.Toolkit.WithHandler<Record<string, Ai.Tool.Any>>>,
): Ai.Toolkit.WithHandler<Record<string, Ai.Tool.Any>> => {
  const tools: Record<string, Ai.Tool.Any> = {}
  for (const toolkit of toolkits) {
    Object.assign(tools, toolkit.tools)
  }
  return {
    tools,
    handle: (name, params) => {
      const toolkit = toolkits.find((candidate) => candidate.tools[name] !== undefined)
      return toolkit === undefined
        ? Effect.fail(
            Ai.AiError.make({
              module: "Handoff",
              method: `${String(name)}.handle`,
              reason: new Ai.AiError.ToolNotFoundError({
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
  toolkit: Ai.Toolkit.WithHandler<Record<string, Ai.Tool.Any>>,
): Ai.Toolkit.Toolkit<Record<string, Ai.Tool.Any>> =>
  Ai.Toolkit.make(...Object.values(toolkit.tools)) as Ai.Toolkit.Toolkit<Record<string, Ai.Tool.Any>>

/** @experimental Build a `transfer_to_<agent.name>` same-process handoff tool. */
export const transferTool = <
  Tools extends Record<string, Ai.Tool.Any>,
  Parameters extends Schema.Top = DefaultTransferParameters,
  Success extends Schema.Top = typeof Schema.String,
>(
  target: Agent.Agent<Tools>,
  options: TransferOptions<Parameters, Success> = {},
): Ai.Toolkit.WithHandler<Record<string, Ai.Tool.Any>> =>
  AgentTool.asTool(target, {
    name: options.nameOverride ?? transferName(target.name),
    description: options.description ?? `Transfer to ${target.name}`,
    ...(options.parameters === undefined ? {} : { parameters: options.parameters }),
    ...(options.success === undefined ? {} : { success: options.success }),
    ...(options.toPrompt === undefined ? {} : { toPrompt: options.toPrompt }),
    ...(options.fromResult === undefined ? {} : { fromResult: options.fromResult }),
  }) as Ai.Toolkit.WithHandler<Record<string, Ai.Tool.Any>>

/** @experimental Run isolated child agents concurrently and preserve input order. */
export const fanOut = <Tools extends Record<string, Ai.Tool.Any>>(
  children: ReadonlyArray<FanOutChild<Tools>>,
  options: FanOutOptions = {},
): Effect.Effect<ReadonlyArray<Agent.Result>, Agent.RunError, Agent.RunServices> =>
  positiveConcurrency(options.concurrency).pipe(
    Effect.flatMap((concurrency) =>
      Effect.forEach(children, (child) => Agent.generate(child.agent, { ...child.options, prompt: child.prompt }), {
        concurrency,
      }),
    ),
  )

/** @experimental Build a supervisor agent plus handled transfer-tool toolkit. */
export const supervisor = (options: SupervisorOptions): Supervisor => {
  const transferTools = options.specialists.map((specialist) => transferTool(specialist))
  const toolkit = mergeHandled(transferTools)
  return {
    agent: Agent.make({
      name: options.name,
      ...(options.instructions === undefined ? {} : { instructions: options.instructions }),
      toolkit: toolkitFromHandled(toolkit),
      ...(options.policy === undefined ? {} : { policy: options.policy }),
    }),
    toolkit,
  }
}
