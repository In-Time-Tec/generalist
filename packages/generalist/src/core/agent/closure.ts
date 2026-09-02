import { Effect, Function, Layer } from "effect"
import { Tool, Toolkit } from "effect/unstable/ai"
import { AgentTypeId, type Agent, type ToolDeclaration, type ToolSchedulingPolicy } from "./service.js"
import type { BudgetLimits } from "../durable/run-budget.js"
import type { Key } from "../context/memory.js"
import type { ModelSelection } from "../model/registry.js"
import type { ToolContext } from "../tools/tool-context.js"
import type { Policy } from "../turn/policy.js"
import { ClosedTypeId, isClosed as hasClosedIdentity } from "./lifecycle/closure-identity.js"

export { ClosedTypeId } from "./lifecycle/closure-identity.js"

/** One Agent observed where its tool and requirement types are not available. */
export interface Any<PolicyServices = unknown> {
  readonly [AgentTypeId]: unknown
  readonly name: string
  readonly instructions?: string
  readonly toolkit: Toolkit.Any
  readonly policy: Policy<PolicyServices>
  readonly model?: ModelSelection
  readonly memory?: Key
  readonly toolScheduling: ToolSchedulingPolicy
  readonly metadata?: Agent<never, never>["metadata"]
  readonly budget?: BudgetLimits
  readonly toolDeclarations?: ReadonlyArray<ToolDeclaration>
}

/**
 * Every service one Agent needs to run: its declared requirements, its tool handlers, and the handler
 * services other than the per-call `ToolContext` that tool execution supplies.
 */
export type ClosedServices<Tools extends Record<string, Tool.Any>, R> =
  | R
  | Tool.HandlersFor<Tools>
  | Exclude<Tool.HandlerServices<Tools[keyof Tools]>, ToolContext>

/** Consumer of one hidden Agent identity together with the exact environment that satisfies it. */
export interface Opened<A> {
  <Tools extends Record<string, Tool.Any>, R>(
    agent: Agent<Tools, R>,
    environment: Layer.Layer<ClosedServices<Tools, R>>,
  ): A
}

/** One Agent closed over the exact environment it requires; both type arguments stay hidden. */
export interface Closed extends Any<never> {
  readonly [ClosedTypeId]: true
  readonly open: <A>(f: Opened<A>) => A
}

/** @internal Whether an erased Agent carries its closed environment. */
export const isClosed = (agent: Any): agent is Closed => hasClosedIdentity(agent)

interface ClosedPolicyAgent extends Omit<Any, "policy"> {
  readonly policy: Policy<never>
}

/** @internal Whether an erased Agent's policy requires no external services. */
export const hasClosedPolicy = (agent: Any): agent is Closed | ClosedPolicyAgent =>
  isClosed(agent) || agent.policy.snapshot !== undefined

/** Close one Agent over the exact environment it requires. */
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
  ): Closed => {
    const closedAgent = {
      ...agent,
      policy: {
        decide: (input: Parameters<typeof agent.policy.decide>[0]) =>
          Effect.scoped(
            Layer.build(environment).pipe(
              Effect.flatMap((context) => agent.policy.decide(input).pipe(Effect.provide(context))),
            ),
          ),
      },
    }
    return { ...closedAgent, [ClosedTypeId]: true, open: (f) => f(agent, environment) }
  },
)
