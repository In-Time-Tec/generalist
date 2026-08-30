import { Function } from "effect"
import type { Tool } from "effect/unstable/ai"
import type { ContextProjection } from "./handoff-projection.js"

export interface HandoffToolMeta {
  readonly specialist: string
  readonly projection?: ContextProjection
  readonly maxRepeatedEdge?: number
}

const metadata = new WeakMap<Tool.Any, HandoffToolMeta>()

export const attachHandoffToolMeta: {
  (meta: HandoffToolMeta): (tool: Tool.Any) => void
  (tool: Tool.Any, meta: HandoffToolMeta): void
} = Function.dual(2, (tool: Tool.Any, meta: HandoffToolMeta): void => {
  metadata.set(tool, meta)
})

export const lookupHandoffToolMeta = (tool: Tool.Any): HandoffToolMeta | undefined => metadata.get(tool)
