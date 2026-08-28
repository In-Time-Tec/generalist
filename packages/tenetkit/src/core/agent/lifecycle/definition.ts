import { type Layer, Schema } from "effect"
import { dual } from "effect/Function"
import { Tool, Toolkit } from "effect/unstable/ai"
import type { Agent, Closed, ClosedServices, ToolDeclaration } from "../service.js"

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

/** @experimental Close one Agent over the exact environment it requires. */
export const close: {
  <Tools extends Record<string, Tool.Any>, R>(
    environment: Layer.Layer<NoInfer<ClosedServices<Tools, R>>>,
  ): (agent: Agent<Tools, R>) => Closed
  <Tools extends Record<string, Tool.Any>, R>(
    agent: Agent<Tools, R>,
    environment: Layer.Layer<NoInfer<ClosedServices<Tools, R>>>,
  ): Closed
} = dual(
  2,
  <Tools extends Record<string, Tool.Any>, R>(
    agent: Agent<Tools, R>,
    environment: Layer.Layer<ClosedServices<Tools, R>>,
  ): Closed => ({ ...agent, open: (f) => f(agent, environment) }),
)

/** @experimental Add host-owned tools while preserving an Agent's requirements. */
export const withTools: {
  <Tools extends Record<string, Tool.Any>, R>(
    declared: ReadonlyArray<Tool.Any>,
  ): (agent: Agent<Tools, R>) => Agent<Tools, R>
  <Tools extends Record<string, Tool.Any>, R>(
    agent: Agent<Tools, R>,
    declared: ReadonlyArray<Tool.Any>,
  ): Agent<Tools, R>
} = dual(
  2,
  <Tools extends Record<string, Tool.Any>, R>(
    agent: Agent<Tools, R>,
    declared: ReadonlyArray<Tool.Any>,
  ): Agent<Tools, R> => {
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
