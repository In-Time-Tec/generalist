import { Prompt } from "effect/unstable/ai"
import type { Entry } from "./session.js"

const APPROX_CHARS_PER_TOKEN = 4
const IMAGE_TOKEN_ESTIMATE = 1_600

const isImagePart = (value: unknown): value is Prompt.FilePart =>
  typeof value === "object" &&
  value !== null &&
  "type" in value &&
  value.type === "file" &&
  "mediaType" in value &&
  typeof value.mediaType === "string" &&
  value.mediaType.startsWith("image/")

const estimateSerializedTokens = (value: unknown): number => {
  let images = 0
  const json = JSON.stringify(value, function (key, child: unknown) {
    if (key === "data" && isImagePart(this)) {
      images += 1
      return ""
    }
    return child
  })
  const text = json === undefined ? String(value) : json
  return Math.ceil(text.length / APPROX_CHARS_PER_TOKEN) + images * IMAGE_TOKEN_ESTIMATE
}

/** @experimental Provider-realistic fallback estimate for a prompt when no tokenizer is installed. */
export const estimatePromptTokens = (prompt: Prompt.Prompt): number => estimateSerializedTokens(prompt.content)

/** @experimental Provider-realistic fallback estimate for one session entry. */
export const estimateEntryTokens = (entry: Entry): number => estimateSerializedTokens(entry)
