import type { ContextProjection } from "./handoff-projection.js"

export interface HandoffToolMeta {
  readonly specialist: string
  readonly projection?: ContextProjection
  readonly maxRepeatedEdge?: number
}

const registry = new Map<string, HandoffToolMeta>()

export const registerHandoffToolMeta = (toolName: string, meta: HandoffToolMeta): void => {
  registry.set(toolName, meta)
}

export const lookupHandoffToolMeta = (toolName: string): HandoffToolMeta | undefined => registry.get(toolName)

export const clearHandoffToolMeta = (): void => {
  registry.clear()
}
