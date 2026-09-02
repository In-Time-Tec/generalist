import { Function } from "effect"
import { Prompt } from "effect/unstable/ai"
import { estimateMessageTokens } from "./prompt-token-estimate.js"

const isToolMessage = (message: Prompt.Message | undefined): boolean => message?.role === "tool"

const isAssistantToolCall = (message: Prompt.Message | undefined): boolean =>
  message?.role === "assistant" && message.content.some((part) => part.type === "tool-call")

/** @experimental Finds a recent-context cut without separating a tool call from its result. */
export const safeCutIndex: {
  (keepRecentTokens: number): (messages: ReadonlyArray<Prompt.Message>) => number
  (messages: ReadonlyArray<Prompt.Message>, keepRecentTokens: number): number
} = Function.dual(2, (messages: ReadonlyArray<Prompt.Message>, keepRecentTokens: number): number => {
  let total = 0
  let index = messages.length
  while (index > 0 && total < keepRecentTokens) {
    index -= 1
    const message = messages[index]
    if (message !== undefined) total += estimateMessageTokens(message)
  }
  while (index > 0 && (isToolMessage(messages[index]) || isAssistantToolCall(messages[index - 1]))) {
    index -= 1
  }
  return index
})
