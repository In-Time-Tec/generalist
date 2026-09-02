import { Option, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"

const APPROX_CHARS_PER_TOKEN = 4
const IMAGE_TOKEN_ESTIMATE = 1_600

type SerializedPromptValue = Prompt.Prompt["content"] | Prompt.Message
type ReplacerValue = Schema.Json | Prompt.FilePart["data"] | undefined

const estimateSerializedTokens = (value: SerializedPromptValue): number => {
  let images = 0
  const json = JSON.stringify(value, function (key, child: ReplacerValue) {
    const file = Schema.decodeUnknownOption(Prompt.FilePart)(this)
    if (key === "data" && Option.isSome(file) && file.value.mediaType.startsWith("image/")) {
      images += 1
      return ""
    }
    return child
  })
  const text = json ?? ""
  return Math.ceil(text.length / APPROX_CHARS_PER_TOKEN) + images * IMAGE_TOKEN_ESTIMATE
}

/** Provider-realistic fallback estimate for a prompt when no tokenizer is installed. */
export const estimatePromptTokens = (prompt: Prompt.Prompt): number => estimateSerializedTokens(prompt.content)

/** Provider-realistic fallback estimate for one prompt message. */
export const estimateMessageTokens = (message: Prompt.Message): number => estimateSerializedTokens(message)
