import { Function } from "effect"
import { Prompt } from "effect/unstable/ai"
import { estimateEntryTokens } from "./prompt-token-estimate.js"
import type { Entry } from "./session.js"

const messageHasToolCall = (message: Prompt.Message): boolean =>
  typeof message.content !== "string" && message.content.some((part) => part.type === "tool-call")

const isToolMessage = (entry: Entry | undefined): boolean => entry?._tag === "Message" && entry.message.role === "tool"

const isAssistantToolCallEntry = (entry: Entry | undefined): boolean =>
  entry?._tag === "Message" && entry.message.role === "assistant" && messageHasToolCall(entry.message)

/** @experimental Finds a recent-context cut without separating a tool call from its result. */
export const safeCutIndex: {
  (keepRecentTokens: number): (entries: ReadonlyArray<Entry>) => number
  (entries: ReadonlyArray<Entry>, keepRecentTokens: number): number
} = Function.dual(2, (entries: ReadonlyArray<Entry>, keepRecentTokens: number): number => {
  let total = 0
  let index = entries.length
  while (index > 0 && total < keepRecentTokens) {
    index -= 1
    total += estimateEntryTokens(entries[index] as Entry)
  }
  while (index > 0 && (isToolMessage(entries[index]) || isAssistantToolCallEntry(entries[index - 1]))) {
    index -= 1
  }
  return index
})
