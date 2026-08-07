import { Function, type Layer } from "effect"
import { Tool, Toolkit } from "effect/unstable/ai"
import { AgentTypeId, type Agent, type ToolDeclaration, type ToolSchedulingPolicy } from "./agent.js"
import type { BudgetLimits } from "../durable/run-budget.js"
import type { Key } from "../context/memory.js"
import type { ModelSelection } from "../model/model-registry.js"
import type { ToolContext } from "../tools/tool-context.js"
import type { TurnPolicy } from "../turn/turn-policy.js"

/** @experimental One Agent observed where its tool and requirement types are not available. */
export interface Any {
  readonly [AgentTypeId]: unknown
  readonly name: string
  readonly instructions?: string
  readonly toolkit: Toolkit.Any
  readonly policy: TurnPolicy<unknown>
  readonly model?: ModelSelection
  readonly memory?: Key
  readonly toolScheduling: ToolSchedulingPolicy
  readonly metadata?: Readonly<Record<string, unknown>>
  readonly budget?: BudgetLimits
  readonly toolDeclarations?: ReadonlyArray<ToolDeclaration>
}

/**
 * @experimental Every service one Agent needs to run: its declared requirements, its tool handlers, and the handler
 * services other than the per-call `ToolContext` that tool execution supplies.
 */
export type ClosedServices<Tools extends Record<string, Tool.Any>, R> =
  | R
  | Tool.HandlersFor<Tools>
  | Exclude<Tool.HandlerServices<Tools[keyof Tools]>, ToolContext>

/** @experimental Consumer of one hidden Agent identity together with the exact environment that satisfies it. */
export interface Opened<A> {
  <Tools extends Record<string, Tool.Any>, R>(
    agent: Agent<Tools, R>,
    environment: Layer.Layer<ClosedServices<Tools, R>>,
  ): A
}

/** @experimental One Agent closed over the exact environment it requires; both type arguments stay hidden. */
export interface Closed extends Any {
  readonly open: <A>(f: Opened<A>) => A
}

/** @experimental Close one Agent over the exact environment it requires. */
export const close: {
  <Tools extends Record<string, Tool.Any>, R>(
    environment: Layer.Layer<NoInfer<ClosedServices<Tools, R>>>,
  ): (agent: Agent<Tools, R>) => Closed
  <Tools extends Record<string, Tool.Any>, R>(
    agent: Agent<Tools, R>,
    environment: Layer.Layer<NoInfer<ClosedServices<Tools, R>>>,
  ): Closed
} = Function.dual(
  2,
  <Tools extends Record<string, Tool.Any>, R>(
    agent: Agent<Tools, R>,
    environment: Layer.Layer<NoInfer<ClosedServices<Tools, R>>>,
  ): Closed => ({ ...agent, open: (f) => f(agent, environment) }),
)

/** @experimental Declare additional host-owned tools on an Agent without changing the services it requires. */
export const withTools: {
  <Tools extends Record<string, Tool.Any>, R>(
    declared: ReadonlyArray<Tool.Any>,
  ): (agent: Agent<Tools, R>) => Agent<Record<string, Tool.Any>, R>
  <Tools extends Record<string, Tool.Any>, R>(
    agent: Agent<Tools, R>,
    declared: ReadonlyArray<Tool.Any>,
  ): Agent<Record<string, Tool.Any>, R>
} = Function.dual(
  2,
  <Tools extends Record<string, Tool.Any>, R>(
    agent: Agent<Tools, R>,
    declared: ReadonlyArray<Tool.Any>,
  ): Agent<Record<string, Tool.Any>, R> => {
    const existing: ReadonlyArray<Tool.Any> = Object.values(agent.toolkit.tools)
    const staticOrigin = (tool: Tool.Any): ToolDeclaration => ({
      tool,
      origin: { _tag: "Static", agent: agent.name },
    })
    const hosted: ReadonlyArray<Tool.Any> = [...existing, ...declared]
    return {
      ...agent,
      [AgentTypeId]: {
        tools: (value: Record<string, Tool.Any>) => value,
        requirements: (value: R) => value,
      },
      toolkit: Toolkit.make(...hosted),
      toolDeclarations: [...(agent.toolDeclarations ?? existing.map(staticOrigin)), ...declared.map(staticOrigin)],
    }
  },
)
