import { Context, Effect, Exit, Schema } from "effect"
import { Prompt, Tool, Toolkit } from "effect/unstable/ai"
import { AgentError, ChildExceedsParent } from "../event.js"
import { encode as encodeAgentInput } from "../lifecycle/input.js"
import type { Any as AnyAgent, ExecutionServices, Input, Output } from "../lifecycle/definition.js"
import { inheritance, type Inheritance, type InheritanceOptions } from "../lifecycle/fan-out.js"
import { RunError } from "../run/error.js"

export const FanOutTypeId = "generalist/core/agent-tool/FanOut"

export interface Profile<A extends AnyAgent = AnyAgent> {
  readonly agent: A
  readonly inherit?: InheritanceOptions
}

type Profiles = Record<string, Profile>
type Selection<Entries extends Profiles> = Extract<keyof Entries, string>
type AgentAt<Entries extends Profiles, Name extends Selection<Entries>> = Entries[Name]["agent"]

/** One model-authored child request. Array order is the result order. */
export type Member<Entries extends Profiles> = {
  readonly [Name in Selection<Entries>]: {
    readonly agent: Name
    readonly input: Input<AgentAt<Entries, Name>>
  }
}[Selection<Entries>]

/** Model-facing parameters of a fan-out tool. */
export interface Parameters<Entries extends Profiles> {
  readonly children: ReadonlyArray<Member<Entries>>
  readonly concurrency?: number
  readonly onFailure?: "collect" | "failFast"
}

type SelectedAgent<Entries extends Profiles> = AgentAt<Entries, Selection<Entries>>
type AgentOutput<Entries extends Profiles> = Output<SelectedAgent<Entries>>
type Requirements<Entries extends Profiles> = ExecutionServices<SelectedAgent<Entries>>
type InputCodec<Entries extends Profiles> = SelectedAgent<Entries>["input"]
type OutputCodec<Entries extends Profiles> = SelectedAgent<Entries>["output"]
type ParametersSchema<Entries extends Profiles> = Schema.Codec<
  Parameters<Entries>,
  unknown,
  InputCodec<Entries>["DecodingServices"],
  InputCodec<Entries>["EncodingServices"]
>
type SuccessSchema<Entries extends Profiles> = Schema.Codec<
  ReadonlyArray<Exit.Exit<AgentOutput<Entries>, RunError>>,
  unknown,
  OutputCodec<Entries>["DecodingServices"],
  OutputCodec<Entries>["EncodingServices"]
>

/** A Runtime-owned fan-out declaration; callers do not provide a separate handler. */
export interface FanOutTool<Name extends string, Entries extends Profiles>
  extends Tool.Tool<
    Name,
    {
      readonly parameters: ParametersSchema<Entries>
      readonly success: SuccessSchema<Entries>
      readonly failure: typeof RunError
      readonly failureMode: "error"
    },
    Requirements<Entries>
  > {
  readonly [FanOutTypeId]: true
}

export type WithoutFanOut<Tools extends Record<string, Tool.Any>> = {
  [Name in keyof Tools as Tools[Name] extends { readonly [FanOutTypeId]: true } ? never : Name]: Tools[Name]
}

/** Static handlers still required after Runtime-owned fan-out tools are removed. */
export type HandlersFor<Tools extends Record<string, Tool.Any>> = Tool.HandlersFor<WithoutFanOut<Tools>>

export interface Options<Name extends string, Entries extends Profiles> {
  readonly name: Name
  readonly description: string
  readonly agents: Entries
  readonly maxChildren: number
}

/** Process-local and durable routing data attached to one exact Tool value. */
type BoundaryValue = typeof Schema.Unknown.Type
interface DecodedParameters {
  readonly children: ReadonlyArray<{
    readonly agent: string
    readonly input: BoundaryValue
    readonly inherit: Inheritance
  }>
  readonly concurrency?: number
  readonly onFailure?: "collect" | "failFast"
}

export interface Definition {
  readonly agents: Readonly<Record<string, AnyAgent>>
  readonly inheritance: Readonly<Record<string, Inheritance>>
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
export const make = <const Name extends string, const Entries extends Profiles>(
  options: Options<Name, Entries>,
): FanOutTool<Name, Entries> => {
  if (!Number.isSafeInteger(options.maxChildren) || options.maxChildren < 1 || options.maxChildren > 64) {
    throw new TypeError("AgentTool.fanOut maxChildren must be a positive safe integer no greater than 64")
  }
  const entries = Object.entries(options.agents)
  if (entries.length === 0) throw new TypeError("AgentTool.fanOut requires at least one Agent")
  const memberSchema = union(
    entries.map(([selection, profile]) =>
      Schema.Struct({
        agent: Schema.Literal(selection),
        input: profile.agent.input,
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
  const output = union(entries.map(([, profile]) => profile.agent.output))
  const success = Schema.Array(Schema.toCodecIso(Schema.Exit(output, RunError, Schema.Defect())))
  const hiddenParameters: unknown = parameters
  // oxlint-disable-next-line anti-slop/no-widen-then-assert, typescript/no-unsafe-type-assertion -- SAFETY: every union branch pairs one literal selection with that selected Agent's input schema.
  const typedParameters = hiddenParameters as ParametersSchema<Entries>
  const hiddenSuccess: unknown = success
  // oxlint-disable-next-line anti-slop/no-widen-then-assert, typescript/no-unsafe-type-assertion -- SAFETY: the success union contains exactly the declared Agents' output schemas and RunError.
  const typedSuccess = hiddenSuccess as SuccessSchema<Entries>
  const tool: FanOutTool<Name, Entries> = Object.assign(
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
    agents: Object.fromEntries(entries.map(([selection, profile]) => [selection, profile.agent])),
    inheritance: Object.fromEntries(entries.map(([selection, profile]) => [selection, inheritance(profile.inherit)])),
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
              inherit: inheritance(options.agents[member.agent]?.inherit),
            })),
            ...Object.assign({}, decoded.concurrency === undefined ? undefined : { concurrency: decoded.concurrency }),
            ...Object.assign({}, decoded.onFailure === undefined ? undefined : { onFailure: decoded.onFailure }),
          }),
        ),
        Effect.provideContext(context),
      ),
    encode: (exits, context) => Schema.encodeUnknownEffect(success)(exits).pipe(Effect.provideContext(context)),
    encodeInput: (selection, input, context) => {
      const profile = options.agents[selection]
      if (profile === undefined) {
        return AgentError.make({ message: `Unknown fan-out Agent selection: ${selection}`, turn: 0 })
      }
      // oxlint-disable-next-line effecttsgo/any-unknown-in-error-context -- Agent.Any erases its schema services, and the declaration restores them from the captured registration context.
      return encodeAgentInput(profile.agent.input, input).pipe(Effect.provideContext(context))
    },
  })
  return tool
}

/** Read fan-out routing data from the exact declaration that owns it. */
export const definition = (tool: Tool.Any): Definition | undefined => definitions.get(tool)

/** @internal Reject selected child authority that the parent does not hold. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- internal authority boundary with three required direct-style arguments.
export const validateAuthority = (
  parent: AnyAgent,
  fanOut: Definition,
  selections: ReadonlyArray<string>,
): Effect.Effect<void, ChildExceedsParent> =>
  Effect.gen(function* () {
    const parentTools = Object.keys(parent.toolkit.tools)
    for (const selection of selections) {
      const child = fanOut.agents[selection]
      const policy = fanOut.inheritance[selection]
      if (child === undefined || policy === undefined) continue
      const childTools = Object.keys(child.toolkit.tools)
      if (policy.tools === "attenuate" && !childTools.every((name) => parentTools.includes(name))) {
        return yield* ChildExceedsParent.make({ field: "tools" })
      }
      if (
        policy.permissions === "fresh" &&
        child.authorization !== undefined &&
        (parent.authorization === undefined || child.authorization !== parent.authorization)
      ) {
        return yield* ChildExceedsParent.make({ field: "permissions" })
      }
      if (policy.sandbox === "fresh" && child.sandbox !== undefined && parent.sandbox === undefined) {
        return yield* ChildExceedsParent.make({ field: "sandbox" })
      }
    }
  })

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
