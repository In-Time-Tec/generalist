import { Function } from "effect"
import type { Json } from "effect/Schema"
import { Prompt } from "effect/unstable/ai"
import type { ModelCallPurpose } from "./model-telemetry.js"

const maximumBreakpoints = 4

const jsonRecord = (value: unknown): Record<string, Json> =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, Json>) : {}

const markSystemOptions = (options: Prompt.ProviderOptions, ttl: "1h" | undefined): Prompt.ProviderOptions => {
  const anthropic = jsonRecord(options.anthropic)
  const amazonBedrock = jsonRecord(options.amazonBedrock)
  const markedAnthropic =
    "cacheControl" in anthropic
      ? anthropic
      : { ...anthropic, cacheControl: { type: "ephemeral", ...(ttl === undefined ? {} : { ttl }) } }
  const markedBedrock = amazonBedrock.cachePoint === true ? amazonBedrock : { ...amazonBedrock, cachePoint: true }
  return markedAnthropic === anthropic && markedBedrock === amazonBedrock
    ? options
    : { ...options, anthropic: markedAnthropic, amazonBedrock: markedBedrock }
}

const markPartOptions = (options: Prompt.ProviderOptions): Prompt.ProviderOptions => {
  const anthropic = jsonRecord(options.anthropic)
  const amazonBedrock = jsonRecord(options.amazonBedrock)
  const markedAnthropic =
    "cacheControl" in anthropic ? anthropic : { ...anthropic, cacheControl: { type: "ephemeral" } }
  const markedBedrock = amazonBedrock.cachePoint === true ? amazonBedrock : { ...amazonBedrock, cachePoint: true }
  return markedAnthropic === anthropic && markedBedrock === amazonBedrock
    ? options
    : { ...options, anthropic: markedAnthropic, amazonBedrock: markedBedrock }
}

const lastIndex = <A>(values: ReadonlyArray<A>, predicate: (value: A) => boolean): number => {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (predicate(values[index] as A)) return index
  }
  return -1
}

const isUserLike = (message: Prompt.Message): boolean => message.role === "user" || message.role === "tool"

const markLastPart = (message: Prompt.Message): Prompt.Message | undefined => {
  if (message.content.length === 0) return undefined
  const last = message.content.length - 1
  const part = message.content[last] as Prompt.Part
  const options = markPartOptions(part.options)
  if (options === part.options) return undefined
  const marked = Prompt.makePart(part.type, { ...(part as unknown as Record<string, unknown>), options } as never)
  return Prompt.makeMessage(message.role, {
    content: [...message.content.slice(0, last), marked],
    options: message.options,
  } as never)
}

/** @experimental Provider cache breakpoints derived for one send; markers are never persisted. */
export const withCacheBreakpoints: {
  (purpose: ModelCallPurpose): (prompt: Prompt.Prompt) => Prompt.Prompt
  (prompt: Prompt.Prompt, purpose: ModelCallPurpose): Prompt.Prompt
} = Function.dual(2, (prompt: Prompt.Prompt, purpose: ModelCallPurpose): Prompt.Prompt => {
  if (purpose !== "conversation") return prompt
  const lastUserLikeIndex = lastIndex(prompt.content, isUserLike)
  let budget = maximumBreakpoints
  let changed = false
  const content = prompt.content.map((message, index) => {
    if (message.role === "system" && budget > 0) {
      const options = markSystemOptions(message.options, index === 0 ? "1h" : undefined)
      if (options === message.options) return message
      budget -= 1
      changed = true
      return Prompt.makeMessage("system", { content: message.content, options })
    }
    if (isUserLike(message) && index === lastUserLikeIndex && budget > 0) {
      const marked = markLastPart(message)
      if (marked === undefined) return message
      budget -= 1
      changed = true
      return marked
    }
    return message
  })
  return changed ? Prompt.fromMessages(content) : prompt
})
