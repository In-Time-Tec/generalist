import { type Layer, Schema, Types } from "effect"
import { dual } from "effect/Function"
import { LanguageModel, Tool, Toolkit } from "effect/unstable/ai"
import type { Key } from "../../context/memory.js"
import type { BudgetLimits } from "../../durable/run-budget.js"
import type { ModelSelection } from "../../model/registry.js"
import type { Authorizer } from "../../tools/tool-authorization.js"
import type { ToolContext } from "../../tools/tool-context.js"
import type { Policy } from "../../turn/policy.js"
import type { ToolOrigin } from "../event.js"
import type { Any as AnyGate, FailureMode as GateFailureMode } from "../gates/definition.js"
import type { SandboxService } from "../../../sandbox/service.js"

export const AgentTypeId = "generalist/core/Agent"

/** Agent-owned metadata values. */
export type AgentMetadata = Readonly<Record<string, Schema.Json>>

/** An agent definition: a plain value, not a service. */
export interface HandoffAgent<R> {
  readonly name: string
  readonly description?: string
  readonly requirements: (value: R) => R
}

/** An Agent definition carrying its tools, requirements, input, and output contract. */
export interface Agent<
  Tools extends Record<string, Tool.Any> = Record<never, never>,
  R = LanguageModel.LanguageModel,
  PolicyServices = R,
  AuthorizationServices = R,
  InputSchema extends Schema.Top = typeof Schema.String,
  OutputSchema extends Schema.Top = typeof Schema.String,
> {
  readonly handoff: <A>(f: (agent: HandoffAgent<R>) => A) => A
  readonly [AgentTypeId]: {
    readonly tools: Types.Invariant<Tools>
    readonly requirements: Types.Invariant<R>
  }
  readonly name: string
  readonly input: InputSchema
  readonly output: OutputSchema
  readonly instructions?: string
  readonly supplemental?: string
  readonly toolkit: Toolkit.Toolkit<Tools>
  readonly policy: Policy<PolicyServices>
  readonly model?: ModelSelection
  readonly memory?: Key
  readonly authorization?: Authorizer<AuthorizationServices>
  readonly toolScheduling: ToolSchedulingPolicy
  readonly metadata?: AgentMetadata
  readonly budget?: BudgetLimits
  readonly toolDeclarations?: ReadonlyArray<ToolDeclaration>
  readonly gates: ReadonlyArray<AnyGate>
  readonly onGateFailure: GateFailureMode
  readonly sandbox?: SandboxService
}

/**
 * Safe scheduling policy for framework-executed calls emitted by one model turn. Tools not explicitly
 * listed as parallel-safe execute as authored-order exclusive barriers.
 */
export interface ToolSchedulingPolicy {
  readonly maxConcurrency: number
  readonly parallelSafe: ReadonlyArray<string>
}

/** One origin-preserving static or Handoff tool declaration. */
export interface ToolDeclaration {
  readonly tool: Tool.Any
  readonly origin: Extract<ToolOrigin, { readonly _tag: "Static" | "Handoff" }>
}

/** One Agent observed where its tool and requirement types are hidden. */
export interface Any {
  readonly [AgentTypeId]: unknown
  readonly name: string
  readonly input: Schema.Top
  readonly output: Schema.Top
  readonly instructions?: string
  readonly toolkit: Toolkit.Any
  readonly policy: Policy<unknown>
  readonly model?: ModelSelection
  readonly memory?: Key
  readonly toolScheduling: ToolSchedulingPolicy
  readonly metadata?: AgentMetadata
  readonly budget?: BudgetLimits
  readonly toolDeclarations?: ReadonlyArray<ToolDeclaration>
  readonly gates: ReadonlyArray<AnyGate>
  readonly onGateFailure: GateFailureMode
  readonly sandbox?: SandboxService
}

/** Services closed over with an Agent. */
export type ClosedServices<
  Tools extends Record<string, Tool.Any>,
  R,
  InputCodec extends Schema.Top = typeof Schema.String,
  OutputCodec extends Schema.Top = typeof Schema.String,
> =
  | R
  | Tool.HandlersFor<Tools>
  | Exclude<Tool.HandlerServices<Tools[keyof Tools]>, ToolContext>
  | InputCodec["EncodingServices"]
  | OutputCodec["DecodingServices"]
  | OutputCodec["EncodingServices"]

/** Consumer of a hidden Agent identity and its environment. */
export interface Opened<A> {
  <Tools extends Record<string, Tool.Any>, R, InputSchema extends Schema.Top, OutputSchema extends Schema.Top>(
    agent: Agent<Tools, R, R, R, InputSchema, OutputSchema>,
    environment: Layer.Layer<ClosedServices<Tools, R, InputSchema, OutputSchema>>,
  ): A
}

/** An Agent closed over its exact environment. */
export interface Closed extends Any {
  readonly open: <A>(f: Opened<A>) => A
}

/** Extract an agent's runtime requirements. */
export type Requirements<A> = A extends Agent<infer _Tools, infer R> ? R : never

/** Extract an Agent's decoded input type. */
export type Input<A> = A extends { readonly input: infer InputCodec extends Schema.Top } ? InputCodec["Type"] : never

/** Extract an Agent's encoded input type. */
export type EncodedInput<A> = A extends { readonly input: infer InputCodec extends Schema.Top }
  ? InputCodec["Encoded"]
  : never

/** Extract an Agent's decoded output type. */
export type Output<A> = A extends { readonly output: infer OutputCodec extends Schema.Top }
  ? OutputCodec["Type"]
  : never

/** Extract an Agent's encoded output type. */
export type EncodedOutput<A> = A extends { readonly output: infer OutputCodec extends Schema.Top }
  ? OutputCodec["Encoded"]
  : never

const hasSameTools = <Tools extends Record<string, Tool.Any>>(
  candidate: Toolkit.Any,
  source: Toolkit.Toolkit<Tools>,
): candidate is Toolkit.Toolkit<Tools> => {
  const entries = Object.entries(source.tools)
  return (
    Object.keys(candidate.tools).length === entries.length &&
    entries.every(([name, tool]) => candidate.tools[name] === tool)
  )
}

const cloneToolkit = <Tools extends Record<string, Tool.Any>>(
  source: Toolkit.Toolkit<Tools>,
): Toolkit.Toolkit<Tools> => {
  const candidate: Toolkit.Any = Toolkit.merge(source)
  if (!hasSameTools(candidate, source)) throw new TypeError("Toolkit clone does not preserve its declared tools")
  return candidate
}

/** Close one Agent over the exact environment it requires. */
export const close: {
  <Tools extends Record<string, Tool.Any>, R>(
    environment: Layer.Layer<NoInfer<ClosedServices<Tools, R>>>,
  ): <PolicyServices extends R, AuthorizationServices extends R>(
    agent: Agent<Tools, R, PolicyServices, AuthorizationServices>,
  ) => Closed
  <
    Tools extends Record<string, Tool.Any>,
    R,
    PolicyServices extends R,
    AuthorizationServices extends R,
    InputSchema extends Schema.Top,
    OutputSchema extends Schema.Top,
  >(
    agent: Agent<Tools, R, PolicyServices, AuthorizationServices, InputSchema, OutputSchema>,
    environment: Layer.Layer<NoInfer<ClosedServices<Tools, R, InputSchema, OutputSchema>>>,
  ): Closed
} = dual(
  2,
  <
    Tools extends Record<string, Tool.Any>,
    R,
    PolicyServices extends R,
    AuthorizationServices extends R,
    InputSchema extends Schema.Top,
    OutputSchema extends Schema.Top,
  >(
    agent: Agent<Tools, R, PolicyServices, AuthorizationServices, InputSchema, OutputSchema>,
    environment: Layer.Layer<ClosedServices<Tools, R, InputSchema, OutputSchema>>,
  ): Closed => ({ ...agent, open: (f) => f(agent, environment) }),
)

/** Add host-owned tools while preserving an Agent's requirements. */
export const withTools: {
  <Tools extends Record<string, Tool.Any>, R>(
    declared: ReadonlyArray<Tool.Any>,
  ): <PolicyServices, AuthorizationServices, InputSchema extends Schema.Top, OutputSchema extends Schema.Top>(
    agent: Agent<Tools, R, PolicyServices, AuthorizationServices, InputSchema, OutputSchema>,
  ) => Agent<Tools, R, PolicyServices, AuthorizationServices, InputSchema, OutputSchema>
  <
    Tools extends Record<string, Tool.Any>,
    R,
    PolicyServices,
    AuthorizationServices,
    InputSchema extends Schema.Top,
    OutputSchema extends Schema.Top,
  >(
    agent: Agent<Tools, R, PolicyServices, AuthorizationServices, InputSchema, OutputSchema>,
    declared: ReadonlyArray<Tool.Any>,
  ): Agent<Tools, R, PolicyServices, AuthorizationServices, InputSchema, OutputSchema>
} = dual(
  2,
  <
    Tools extends Record<string, Tool.Any>,
    R,
    PolicyServices,
    AuthorizationServices,
    InputSchema extends Schema.Top,
    OutputSchema extends Schema.Top,
  >(
    agent: Agent<Tools, R, PolicyServices, AuthorizationServices, InputSchema, OutputSchema>,
    declared: ReadonlyArray<Tool.Any>,
  ): Agent<Tools, R, PolicyServices, AuthorizationServices, InputSchema, OutputSchema> => {
    const existing: ReadonlyArray<Tool.Any> = Object.values(agent.toolkit.tools)
    const toolkit = cloneToolkit(agent.toolkit)
    for (const tool of declared) {
      const name = Schema.decodeSync(Schema.Struct({ name: Schema.String }))(tool).name
      Object.defineProperty(toolkit.tools, name, { configurable: true, enumerable: true, value: tool, writable: true })
    }
    const staticOrigin = (tool: Tool.Any): ToolDeclaration => ({ tool, origin: { _tag: "Static", agent: agent.name } })
    return {
      ...agent,
      toolkit,
      toolDeclarations: [...(agent.toolDeclarations ?? existing.map(staticOrigin)), ...declared.map(staticOrigin)],
    }
  },
)
