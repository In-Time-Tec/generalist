import { Option, Schema } from "effect"
import { dual } from "effect/Function"
import { Prompt } from "effect/unstable/ai"
import { Ref, type Ref as RefValue } from "./ref.js"
import { refFromPart } from "./prompt.js"

export type Strategy = "elide" | "keep" | "describe"

const description = (ref: RefValue, action: "elided" | "describe"): Prompt.TextPart =>
  Prompt.makePart("text", {
    text:
      action === "elided"
        ? `[Media elided: ${ref.filename ?? ref.mediaType}, ${ref.bytes} bytes; ref=${Schema.encodeSync(Schema.fromJsonString(Ref))(ref)}]`
        : `[Describe this media in one line; ref=${Schema.encodeSync(Schema.fromJsonString(Ref))(ref)}]`,
  })

const compactPart = <Part extends Prompt.Part>(
  part: Part,
  next: Part | undefined,
  strategy: Strategy,
): ReadonlyArray<Part | Prompt.TextPart> => {
  if (part.type !== "file") return [part]
  const ref = refFromPart(part)
  if (Option.isNone(ref) || strategy === "keep") return [part]
  if (strategy === "elide") return [description(ref.value, "elided")]
  const request = description(ref.value, "describe")
  return next?.type === "text" && next.text === request.text ? [part] : [part, request]
}

const compactContent = <Part extends Prompt.Part>(content: ReadonlyArray<Part>, strategy: Strategy) =>
  content.flatMap((part, index) => compactPart(part, content[index + 1], strategy))

const sameContent = (left: ReadonlyArray<Prompt.Part>, right: ReadonlyArray<Prompt.Part>): boolean =>
  left.length === right.length && left.every((part, index) => part === right[index])

const compactMessage = (message: Prompt.Message, strategy: Strategy): Prompt.Message => {
  if (message.role !== "user" && message.role !== "assistant") return message
  if (message.role === "user") {
    const content = compactContent(message.content, strategy)
    return sameContent(content, message.content)
      ? message
      : Prompt.makeMessage("user", { content, options: message.options })
  }
  const content = compactContent(message.content, strategy)
  return sameContent(content, message.content)
    ? message
    : Prompt.makeMessage("assistant", { content, options: message.options })
}

/** Apply the selected reference-only media policy during a compaction pass. */
export const compactPrompt: {
  (strategy: Strategy): (prompt: Prompt.Prompt) => readonly [Prompt.Prompt, boolean]
  (prompt: Prompt.Prompt, strategy: Strategy): readonly [Prompt.Prompt, boolean]
} = dual(2, (prompt: Prompt.Prompt, strategy: Strategy) => {
  if (strategy === "keep") return [prompt, false] as const
  const content = prompt.content.map((message) => compactMessage(message, strategy))
  const changed = content.some((message, index) => message !== prompt.content[index])
  return [changed ? Prompt.fromMessages(content) : prompt, changed] as const
})
