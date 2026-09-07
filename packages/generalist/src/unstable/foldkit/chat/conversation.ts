import type { Conversation } from "../../../runtime/session/conversation.js"
import { AssistantEntry, ToolEntry, UserEntry, type ChatEntry } from "./service.js"

export const conversationEntries = (conversation: Conversation): ReadonlyArray<ChatEntry> => {
  const entries: Array<ChatEntry> = []
  const calls = new Map<string, { readonly index: number; readonly entry: typeof ToolEntry.Type }>()
  for (const entry of conversation.entries) {
    for (const message of entry.messages) {
      if (message.role === "user") {
        const text = message.content
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join("")
        if (text.length > 0) entries.push(UserEntry({ text }))
        continue
      }
      if (message.role === "assistant") {
        const text = message.content
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join("")
        const reasoning = message.content
          .filter((part) => part.type === "reasoning")
          .map((part) => part.text)
          .join("")
        if (text.length > 0 || reasoning.length > 0)
          entries.push(AssistantEntry({ text, reasoning: reasoning.length === 0 ? null : reasoning }))
      }
      for (const part of message.content) {
        if (part.type === "tool-call") {
          const tool = ToolEntry({
            callId: JSON.stringify([entry.id, part.id]),
            name: part.name,
            params: part.params,
            phase: "called",
            outcome: { _tag: "Pending" },
            progress: [],
          })
          calls.set(part.id, { index: entries.length, entry: tool })
          entries.push(tool)
        } else if (part.type === "tool-result") {
          const call = calls.get(part.id)
          if (call !== undefined)
            entries[call.index] = ToolEntry({
              ...call.entry,
              phase: "executing",
              outcome: { _tag: "Completed", isFailure: part.isFailure, result: part.result },
            })
        }
      }
    }
  }
  return entries
}

export const conversationToolKey = (input: {
  readonly conversation: Conversation
  readonly callId: string
}): string | undefined => {
  for (const entry of input.conversation.entries.toReversed()) {
    if (
      entry.messages.some(
        (message) =>
          message.role === "assistant" &&
          message.content.some((part) => part.type === "tool-call" && part.id === input.callId),
      )
    )
      return JSON.stringify([entry.id, input.callId])
  }
  return undefined
}
