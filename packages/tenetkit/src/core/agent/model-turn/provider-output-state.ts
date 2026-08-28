import type { AgentRunState } from "../run-state.js"
export type { AgentRunState } from "../run-state.js"

export const make = (): AgentRunState["providerOutput"] => ({
  textCharacters: 0,
  reasoningCharacters: 0,
  finishReason: undefined,
})
