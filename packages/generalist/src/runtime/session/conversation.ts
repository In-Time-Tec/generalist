import { Option, Schema, type Types } from "effect"
import { Prompt } from "effect/unstable/ai"
import type { Entry } from "../../core/context/session.js"
import { promptFromResponseParts } from "../../media/prompt.js"

export interface ConversationEntry {
  readonly id: string
  readonly parentId: string | null
  readonly messages: ReadonlyArray<Exclude<Prompt.Message, { readonly role: "system" }>>
  readonly contentDeferred?: true
}
export const ConversationEntry: Schema.Codec<ConversationEntry, unknown> = Schema.Struct({
  id: Schema.String,
  parentId: Schema.NullOr(Schema.String),
  messages: Schema.Array(
    Prompt.Message.pipe(
      Schema.refine(
        (message): message is Exclude<Prompt.Message, { readonly role: "system" }> => message.role !== "system",
      ),
    ),
  ),
  contentDeferred: Schema.optionalKey(Schema.Literal(true)),
})

/** Project public conversation content without exposing internal Session entries. @internal */
export const projectEntry = (entry: Entry): ConversationEntry | undefined => {
  let messages: ReadonlyArray<Prompt.Message>
  switch (entry._tag) {
    case "Message":
    case "Steering":
      messages = [entry.message]
      break
    case "ModelResponse":
      messages = promptFromResponseParts(entry.content).content
      break
    case "Handoff":
      messages = entry.projectedHistory.content
      break
    case "ToolCall":
      messages = [Prompt.makeMessage("assistant", { content: [entry.part] })]
      break
    case "ToolResult":
      messages = [Prompt.makeMessage("tool", { content: [entry.part] })]
      break
    default:
      return undefined
  }
  const content = messages.filter(
    (message): message is Exclude<Prompt.Message, { readonly role: "system" }> => message.role !== "system",
  )
  return content.length === 0 ? undefined : { id: entry.id, parentId: entry.parentId, messages: content }
}

export const Conversation = Schema.Struct({
  leafId: Schema.NullOr(Schema.String),
  entries: Schema.Array(ConversationEntry),
  nextLeafId: Schema.optionalKey(Schema.String),
})
export type Conversation = typeof Conversation.Type

export const ConversationUpdate = Schema.Struct({
  previousLeafId: Schema.NullOr(Schema.String),
  leafId: Schema.NullOr(Schema.String),
  afterEntryId: Schema.NullOr(Schema.String),
  entries: Schema.Array(ConversationEntry),
  reset: Schema.optionalKey(Schema.Literal(true)),
  nextLeafId: Schema.optionalKey(Schema.String),
})
export type ConversationUpdate = typeof ConversationUpdate.Type

export const applyConversationUpdate = (input: {
  readonly conversation: Conversation
  readonly update: ConversationUpdate
}): Option.Option<Conversation> => {
  const { conversation, update } = input
  if (conversation.leafId !== update.previousLeafId) return Option.none()
  if (update.entries.length > 64 || new Set(update.entries.map((entry) => entry.id)).size !== update.entries.length)
    return Option.none()
  if (update.reset === true) {
    const next: Types.Mutable<Conversation> = {
      leafId: update.leafId,
      entries: update.entries,
    }
    if (update.nextLeafId !== undefined) next.nextLeafId = update.nextLeafId
    return Option.some(next)
  }
  const index =
    update.afterEntryId === null ? -1 : conversation.entries.findIndex((entry) => entry.id === update.afterEntryId)
  if (update.afterEntryId !== null && index < 0) return Option.none()
  const entries = [...conversation.entries.slice(0, index + 1), ...update.entries]
  if (new Set(entries.map((entry) => entry.id)).size !== entries.length) return Option.none()
  const bounded = entries.slice(-64)
  const nextLeafId = entries.length > 64 ? bounded[0]?.parentId : conversation.nextLeafId
  const next: Types.Mutable<Conversation> = {
    leafId: update.leafId,
    entries: bounded,
  }
  if (nextLeafId !== undefined && nextLeafId !== null) next.nextLeafId = nextLeafId
  return Option.some(next)
}
