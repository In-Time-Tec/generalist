import type { Response, Prompt } from "effect/unstable/ai"
import type { PendingToolResult } from "./tools/result.js"

/** @internal Mutable state owned by one Agent.stream invocation. */
export interface AgentRunState {
  turn: number
  text: string
  readonly pending: Map<number, PendingToolResult>
  finish: { readonly usage: Response.Usage; readonly reason: Response.FinishReason } | undefined
  usage: Response.Usage | undefined
  currentContext: Prompt.Prompt | undefined
  currentContextTokens: number | undefined
  reportedContextUsage:
    | {
        readonly prompt: Prompt.Prompt
        readonly estimatedTokens: number
        readonly reportedTokens: number
      }
    | undefined
  providerOutput: {
    textCharacters: number
    reasoningCharacters: number
    finishReason: Response.FinishReason | undefined
  }
}

/** @internal A checkpoint of the state consumed by a model-turn continuation. */
export interface AgentRunCheckpoint {
  readonly turn: number
  readonly prompt: Prompt.Prompt
  readonly pending: ReadonlyArray<PendingToolResult>
  readonly completed: boolean
}
