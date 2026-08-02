import { Array, Effect, Function, Schema } from "effect"
import { LanguageModel, Prompt, Tool } from "effect/unstable/ai"
import {
  type Agent,
  type Requirements,
  type Result,
  type RunError,
  type RunOptions,
  generate,
  make,
} from "../agent/agent.js"
import { AgentError } from "../agent/agent-event.js"
import { type AgentToolToolkit, asTool } from "../agent/agent-tool.js"
import { type Memory } from "../context/memory.js"
import { type ClosedToolSet } from "../tools/tool-executor.js"
import { type TurnPolicy } from "../turn/turn-policy.js"

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
  R,
  Options extends Omit<RunOptions, "prompt"> | undefined = Omit<RunOptions, "prompt"> | undefined,
> {
  readonly agent: Agent<Tools, R>
  readonly prompt: Prompt.RawInput
  readonly options?: Options
}

/** @experimental Options for bounded same-process fan-out. */
export interface FanOutOptions {
  readonly concurrency?: number
}

/** @experimental Built supervisor agent and handled toolkit for its transfer tools. */
export interface Supervisor<R> {
  readonly agent: Agent<Record<string, Tool.Any>, R | LanguageModel.LanguageModel>
  readonly toolkit: ClosedToolSet<R>
}

/** @experimental Options for building a transfer-tool supervisor. */
export interface SupervisorOptions<Specialists extends ReadonlyArray<Agent<any, any>>> {
  readonly name: string
  readonly instructions?: string
  readonly specialists: Specialists
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

type TransferToolkit<Parameters extends Schema.Top, Success extends Schema.Top, R> = AgentToolToolkit<
  string,
  Parameters,
  Success,
  R
>
type TransferInvocation<R> = Effect.Effect<unknown, string, R>

const mergeHandled = <Parameters extends Schema.Top, Success extends Schema.Top, R>(
  toolkits: ReadonlyArray<TransferToolkit<Parameters, Success, R>>,
): ClosedToolSet<R> => {
  const entries = new Map<
    string,
    { readonly tool: Tool.Any; readonly invoke: (params: unknown) => TransferInvocation<R> }
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
  ): <Tools extends Record<string, Tool.Any>, R>(
    target: Agent<Tools, R>,
  ) => AgentToolToolkit<string, Parameters, Success, R>
  <
    Tools extends Record<string, Tool.Any>,
    R,
    Parameters extends Schema.Top = DefaultTransferParameters,
    Success extends Schema.Top = typeof Schema.String,
  >(
    target: Agent<Tools, R>,
    options?: TransferOptions<Parameters, Success>,
  ): AgentToolToolkit<string, Parameters, Success, R>
} = Function.dual(
  (args) => args.length !== 1 || "name" in args[0],
  <
    Tools extends Record<string, Tool.Any>,
    R,
    Parameters extends Schema.Top = DefaultTransferParameters,
    Success extends Schema.Top = typeof Schema.String,
  >(
    target: Agent<Tools, R>,
    options: TransferOptions<Parameters, Success> = {},
  ): AgentToolToolkit<string, Parameters, Success, R> =>
    asTool(target, {
      name: options.nameOverride ?? transferName(target.name),
      description: options.description ?? `Transfer to ${target.name}`,
      ...(options.parameters === undefined ? {} : { parameters: options.parameters }),
      ...(options.success === undefined ? {} : { success: options.success }),
      ...(options.toPrompt === undefined ? {} : { toPrompt: options.toPrompt }),
      ...(options.fromResult === undefined ? {} : { fromResult: options.fromResult }),
    }),
)

type FanOutInput = {
  readonly agent: Agent<any, any>
  readonly prompt: Prompt.RawInput
  readonly options?: Omit<RunOptions, "prompt">
}

type FanOutOptionRequirements<Options> =
  Exclude<Options, undefined> extends {
    readonly memory?: infer SelectedMemory
  }
    ? [Extract<SelectedMemory, { readonly key: import("../context/memory.js").Key }>] extends [never]
      ? never
      : Memory
    : never

type FanOutRequirements<Children extends ReadonlyArray<FanOutInput>> = Children[number] extends infer Child
  ? Child extends { readonly agent: infer ChildAgent }
    ?
        | Requirements<ChildAgent>
        | (Child extends { readonly options?: infer Options } ? FanOutOptionRequirements<Options> : never)
    : never
  : never

/** @experimental Run isolated child agents concurrently and preserve input order. */
export const fanOut: {
  (
    options: FanOutOptions,
  ): <Children extends ReadonlyArray<FanOutInput>>(
    children: Children,
  ) => Effect.Effect<ReadonlyArray<Result>, RunError, FanOutRequirements<Children>>
  (): <Children extends ReadonlyArray<FanOutInput>>(
    children: Children,
  ) => Effect.Effect<ReadonlyArray<Result>, RunError, FanOutRequirements<Children>>
  <Children extends ReadonlyArray<FanOutInput>>(
    children: Children,
    options: FanOutOptions,
  ): Effect.Effect<ReadonlyArray<Result>, RunError, FanOutRequirements<Children>>
  <Children extends ReadonlyArray<FanOutInput>>(
    children: Children,
  ): Effect.Effect<ReadonlyArray<Result>, RunError, FanOutRequirements<Children>>
} = Function.dual(
  (args) => args.length !== 1 || globalThis.Array.isArray(args[0]),
  <Children extends ReadonlyArray<FanOutInput>>(
    children: Children,
    options: FanOutOptions = {},
  ): Effect.Effect<ReadonlyArray<Result>, RunError, FanOutRequirements<Children>> =>
    positiveConcurrency(options.concurrency).pipe(
      Effect.flatMap((concurrency) =>
        Effect.forEach(
          children,
          (child) => {
            const runOptions = {
              ...child.options,
              prompt: child.prompt,
            }
            return generate(child.agent, runOptions)
          },
          { concurrency },
        ),
      ),
    ),
)

/** @experimental Build a supervisor agent plus handled transfer-tool toolkit. */
export const supervisor = <const Specialists extends ReadonlyArray<Agent<any, any>>>(
  options: SupervisorOptions<Specialists>,
): Supervisor<Requirements<Specialists[number]>> => {
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
