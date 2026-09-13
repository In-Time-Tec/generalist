import { Context } from "effect"
import type { Tool } from "effect/unstable/ai"

const ManagedToolTypeId: unique symbol = Symbol("generalist/core/tools/ManagedTool")

/** @internal Nominal marker for a framework-created tool whose handler is bound to its exact identity. */
export interface ManagedTool {
  readonly [ManagedToolTypeId]: true
}

const handlers = new WeakMap<Tool.Any, Context.Context<never>>()

/** @internal Bind handlers to one exact framework-created tool without widening its public shape. */
export const bindManagedTool = <T extends Tool.Any>(input: {
  readonly tool: T
  readonly context: Context.Context<never>
}): T & ManagedTool => {
  const { tool, context } = input
  const managed = Object.assign(tool, { [ManagedToolTypeId]: true as const })
  Object.defineProperty(managed, ManagedToolTypeId, { enumerable: false })
  handlers.set(managed, context)
  return managed
}

/** @internal Resolve handler Context only for the original framework-created tool identity. */
export const managedToolHandlers = (tool: Tool.Any): Context.Context<never> | undefined => handlers.get(tool)
