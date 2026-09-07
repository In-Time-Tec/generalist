import { Option, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"

export const ConversationEntry = Schema.Struct({
  id: Schema.String,
  parentId: Schema.NullOr(Schema.String),
  messages: Schema.Array(
    Prompt.Message.pipe(
      Schema.refine(
        (message): message is Exclude<Prompt.Message, { readonly role: "system" }> => message.role !== "system",
      ),
    ),
  ),
})
export type ConversationEntry = typeof ConversationEntry.Type

export const Conversation = Schema.Struct({
  leafId: Schema.NullOr(Schema.String),
  entries: Schema.Array(ConversationEntry),
})
export type Conversation = typeof Conversation.Type

export const ConversationUpdate = Schema.Struct({
  previousLeafId: Schema.NullOr(Schema.String),
  leafId: Schema.NullOr(Schema.String),
  afterEntryId: Schema.NullOr(Schema.String),
  entries: Schema.Array(ConversationEntry),
})
export type ConversationUpdate = typeof ConversationUpdate.Type

export const applyConversationUpdate = (input: {
  readonly conversation: Conversation
  readonly update: ConversationUpdate
}): Option.Option<Conversation> => {
  const { conversation, update } = input
  if (conversation.leafId !== update.previousLeafId) return Option.none()
  const index =
    update.afterEntryId === null ? -1 : conversation.entries.findIndex((entry) => entry.id === update.afterEntryId)
  if (update.afterEntryId !== null && index < 0) return Option.none()
  const entries = [...conversation.entries.slice(0, index + 1), ...update.entries]
  if (new Set(entries.map((entry) => entry.id)).size !== entries.length) return Option.none()
  return Option.some({ leafId: update.leafId, entries })
}
