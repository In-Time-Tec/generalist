import { Context, Effect, Exit, Schema } from "effect"
import { Prompt, Tool, Toolkit } from "effect/unstable/ai"
import type { BudgetLimits } from "../../durable/run-budget.js"
import { AgentError } from "../event.js"
import { encode as encodeAgentInput } from "../lifecycle/input.js"
import type { Any as AnyAgent, ExecutionServices, Input, Output } from "../lifecycle/definition.js"
import { RunError } from "../run/error.js"

export const FanOutTypeId = "generalist/core/agent-tool/FanOut"

type Selection<Agents extends Record<string, AnyAgent>> = Extract<keyof Agents, string>

/** One model-authored child request. Array order is the result order. */
export type Member<Agents extends Record<string, AnyAgent>> = {
  readonly [Name in Selection<Agents>]: {
    readonly agent: Name
    readonly input: Input<Agents[Name]>
    readonly budget?: BudgetLimits
  }
}[Selection<Agents>]

/** Model-facing parameters of a fan-out tool. */
export interface Parameters<Agents extends Record<string, AnyAgent>> {
  readonly children: ReadonlyArray<Member<Agents>>
  readonly concurrency?: number
  readonly onFailure?: "collect" | "failFast"
}

type AgentOutput<Agents extends Record<string, AnyAgent>> = Output<Agents[Selection<Agents>]>
type Requirements<Agents extends Record<string, AnyAgent>> = ExecutionServices<Agents[Selection<Agents>]>
type InputCodec<Agents extends Record<string, AnyAgent>> = Agents[Selection<Agents>]["input"]
type OutputCodec<Agents extends Record<string, AnyAgent>> = Agents[Selection<Agents>]["output"]
type ParametersSchema<Agents extends Record<string, AnyAgent>> = Schema.Codec<
  Parameters<Agents>,
  unknown,
  InputCodec<Agents>["DecodingServices"],
  InputCodec<Agents>["EncodingServices"]
>
type SuccessSchema<Agents extends Record<string, AnyAgent>> = Schema.Codec<
  ReadonlyArray<Exit.Exit<AgentOutput<Agents>, RunError>>,
  unknown,
  OutputCodec<Agents>["DecodingServices"],
  OutputCodec<Agents>["EncodingServices"]
>

/** A Runtime-owned fan-out declaration; callers do not provide a separate handler. */
export interface FanOutTool<Name extends string, Agents extends Record<string, AnyAgent>>
  extends Tool.Tool<
    Name,
    {
      readonly parameters: ParametersSchema<Agents>
      readonly success: SuccessSchema<Agents>
      readonly failure: typeof RunError
      readonly failureMode: "error"
    },
    Requirements<Agents>
  > {
  readonly [FanOutTypeId]: true
}

export type WithoutFanOut<Tools extends Record<string, Tool.Any>> = {
  [Name in keyof Tools as Tools[Name] extends { readonly [FanOutTypeId]: true } ? never : Name]: Tools[Name]
}

/** Static handlers still required after Runtime-owned fan-out tools are removed. */
export type HandlersFor<Tools extends Record<string, Tool.Any>> = Tool.HandlersFor<WithoutFanOut<Tools>>

export interface Options<Name extends string, Agents extends Record<string, AnyAgent>> {
  readonly name: Name
  readonly description: string
  readonly agents: Agents
  readonly maxChildren: number
}

/** Process-local and durable routing data attached to one exact Tool value. */
type BoundaryValue = typeof Schema.Unknown.Type
interface DecodedParameters {
  readonly children: ReadonlyArray<{
    readonly agent: string
    readonly input: BoundaryValue
    readonly budget?: BudgetLimits
  }>
  readonly concurrency?: number
  readonly onFailure?: "collect" | "failFast"
}

export interface Definition {
  readonly agents: Readonly<Record<string, AnyAgent>>
  readonly maxChildren: number
  readonly parameters: Schema.Top
  readonly success: Schema.Top
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- this is the model-call boundary; the declaration-owned schema parses it before use.
  readonly decode: (
    input: BoundaryValue,
    context: Context.Context<BoundaryValue>,
  ) => Effect.Effect<DecodedParameters, Schema.SchemaError>
  readonly encode: (
    exits: ReadonlyArray<Exit.Exit<BoundaryValue, RunError>>,
    context: Context.Context<BoundaryValue>,
  ) => Effect.Effect<unknown, Schema.SchemaError>
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the input was parsed by decode; this erased declaration method restores the selected Agent schema.
  readonly encodeInput: (
    selection: string,
    input: BoundaryValue,
    context: Context.Context<BoundaryValue>,
  ) => Effect.Effect<Prompt.RawInput, AgentError>
}

const definitions = new WeakMap<Tool.Any, Definition>()

const union = ([first, second, ...rest]: ReadonlyArray<Schema.Top>): Schema.Top => {
  if (first === undefined) throw new TypeError("A schema union requires at least one member")
  return second === undefined ? first : Schema.Union([first, second, ...rest])
}

/** Construct one model-callable typed fan-out declaration. */
export const make = <const Name extends string, const Agents extends Record<string, AnyAgent>>(
  options: Options<Name, Agents>,
): FanOutTool<Name, Agents> => {
  if (!Number.isSafeInteger(options.maxChildren) || options.maxChildren < 1 || options.maxChildren > 64) {
    throw new TypeError("AgentTool.fanOut maxChildren must be a positive safe integer no greater than 64")
  }
  const entries = Object.entries(options.agents)
  if (entries.length === 0) throw new TypeError("AgentTool.fanOut requires at least one Agent")
  const memberSchema = union(
    entries.map(([selection, agent]) =>
      Schema.Struct({
        agent: Schema.Literal(selection),
        input: agent.input,
        budget: Schema.optionalKey(
          Schema.Struct({
            tokens: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
            usd: Schema.optionalKey(Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))),
            duration: Schema.optionalKey(Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))),
            toolCalls: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
            children: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
          }),
        ),
      }),
    ),
  )
  const parameters = Schema.Struct({
    children: Schema.Array(memberSchema).check(Schema.isMinLength(1), Schema.isMaxLength(options.maxChildren)),
    concurrency: Schema.optionalKey(
      Schema.Int.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(options.maxChildren)),
    ),
    onFailure: Schema.optionalKey(Schema.Literals(["collect", "failFast"])),
  })
  const output = union(entries.map(([, agent]) => agent.output))
  const success = Schema.Array(Schema.toCodecIso(Schema.Exit(output, RunError, Schema.Defect())))
  const hiddenParameters: unknown = parameters
  // oxlint-disable-next-line anti-slop/no-widen-then-assert, typescript/no-unsafe-type-assertion -- SAFETY: every union branch pairs one literal selection with that selected Agent's input schema.
  const typedParameters = hiddenParameters as ParametersSchema<Agents>
  const hiddenSuccess: unknown = success
  // oxlint-disable-next-line anti-slop/no-widen-then-assert, typescript/no-unsafe-type-assertion -- SAFETY: the success union contains exactly the declared Agents' output schemas and RunError.
  const typedSuccess = hiddenSuccess as SuccessSchema<Agents>
  const tool: FanOutTool<Name, Agents> = Object.assign(
    Tool.make(options.name, {
      description: options.description,
      parameters: typedParameters,
      success: typedSuccess,
      failure: RunError,
    }),
    { [FanOutTypeId]: true as const },
  )
  Object.defineProperty(tool, FanOutTypeId, { enumerable: false, value: true })
  definitions.set(tool, {
    agents: options.agents,
    maxChildren: options.maxChildren,
    parameters,
    success,
    decode: (input, context) =>
      Schema.decodeUnknownEffect(typedParameters, { onExcessProperty: "error" })(input).pipe(
        Effect.map(
          (decoded): DecodedParameters => ({
            children: decoded.children.map((member) => ({
              agent: member.agent,
              input: member.input,
              ...Object.assign({}, member.budget === undefined ? undefined : { budget: member.budget }),
            })),
            ...Object.assign({}, decoded.concurrency === undefined ? undefined : { concurrency: decoded.concurrency }),
            ...Object.assign({}, decoded.onFailure === undefined ? undefined : { onFailure: decoded.onFailure }),
          }),
        ),
        Effect.provideContext(context),
      ),
    encode: (exits, context) => Schema.encodeUnknownEffect(success)(exits).pipe(Effect.provideContext(context)),
    encodeInput: (selection, input, context) => {
      const agent = options.agents[selection]
      if (agent === undefined) {
        return AgentError.make({ message: `Unknown fan-out Agent selection: ${selection}`, turn: 0 })
      }
      // oxlint-disable-next-line effecttsgo/any-unknown-in-error-context -- Agent.Any erases its schema services, and the declaration restores them from the captured registration context.
      return encodeAgentInput(agent.input, input).pipe(Effect.provideContext(context))
    },
  })
  return tool
}

/** Read fan-out routing data from the exact declaration that owns it. */
export const definition = (tool: Tool.Any): Definition | undefined => definitions.get(tool)

const hasOnlyStaticTools = <Tools extends Record<string, Tool.Any>>(
  candidate: Toolkit.Any,
  source: Toolkit.Toolkit<Tools>,
): candidate is Toolkit.Toolkit<WithoutFanOut<Tools>> => {
  const expected = Object.entries(source.tools).filter(([, tool]) => definition(tool) === undefined)
  return (
    Object.keys(candidate.tools).length === expected.length &&
    expected.every(([name, tool]) => candidate.tools[name] === tool)
  )
}

/** @internal Remove Runtime-owned declarations before Effect resolves ordinary static handlers. */
export const withoutFanOut = <Tools extends Record<string, Tool.Any>>(
  toolkit: Toolkit.Toolkit<Tools>,
): Toolkit.Toolkit<WithoutFanOut<Tools>> => {
  const candidate: Toolkit.Any = Toolkit.make(
    ...Object.values(toolkit.tools).filter((tool) => definition(tool) === undefined),
  )
  if (!hasOnlyStaticTools(candidate, toolkit)) throw new TypeError("Filtered Toolkit did not preserve its static tools")
  return candidate
}
