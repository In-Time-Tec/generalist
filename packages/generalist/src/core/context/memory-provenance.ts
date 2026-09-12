import { Option, Schema } from "effect"
import { dual } from "effect/Function"
import { Prompt } from "effect/unstable/ai"
import type { ItemPart } from "./memory.js"

const provenanceOption = "generalist/memory"
const recallLineage = new WeakMap<Prompt.Message, Prompt.Message>()
const RecallProvenance = Schema.Struct({ origin: Schema.Literal("memoryRecall") })

export const itemFromPromptPart = Option.liftPredicate(
  (part: Prompt.Part): part is ItemPart => part.type === "text" || part.type === "file",
)

export const isMessageFromRecall = (message: Prompt.Message): boolean => {
  const provenance = message.options[provenanceOption]
  return Schema.is(RecallProvenance)(provenance)
}

export const messageFromRecall = (content: ReadonlyArray<ItemPart>): Prompt.UserMessage => {
  const message = Prompt.makeMessage("user", {
    content,
    options: { [provenanceOption]: { origin: "memoryRecall" } },
  })
  recallLineage.set(message, message)
  return message
}

export const replaceRecalledMessage: {
  (content: ReadonlyArray<Prompt.UserMessagePart>): (message: Prompt.UserMessage) => Prompt.UserMessage
  (message: Prompt.UserMessage, content: ReadonlyArray<Prompt.UserMessagePart>): Prompt.UserMessage
} = dual(2, (message: Prompt.UserMessage, content: ReadonlyArray<Prompt.UserMessagePart>): Prompt.UserMessage => {
  const options = isMessageFromRecall(message)
    ? { ...message.options, [provenanceOption]: { origin: "memoryRecall" } }
    : { ...message.options }
  const replacement = Prompt.makeMessage("user", { content, options })
  if (isMessageFromRecall(message)) recallLineage.set(replacement, recallLineage.get(message) ?? message)
  return replacement
})

export const recalledMessageIdentity = (message: Prompt.Message): Prompt.Message =>
  recallLineage.get(message) ?? message

export const projectTranscript = (transcript: Prompt.Prompt): Prompt.Prompt => {
  const content = transcript.content.filter((message) => !isMessageFromRecall(message))
  return content.length === transcript.content.length ? transcript : Prompt.fromMessages(content)
}
