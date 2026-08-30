import { Clock, Effect, Function, Option, Schema } from "effect"
import type { Json } from "effect/Schema"
import { Prompt } from "effect/unstable/ai"
import type { CallPurpose } from "./telemetry/events.js"
import type { SendClock } from "./send-clock.js"

const maximumBreakpoints = 4

const JsonRecord = Schema.Record(Schema.String, Schema.Json)

const jsonRecord = (value: Json | null | undefined): Record<string, Json> =>
  Schema.decodeUnknownOption(JsonRecord)(value).pipe(Option.getOrElse(() => ({})))

const cacheControl = (ttl: "1h" | undefined) => (ttl === undefined ? { type: "ephemeral" } : { type: "ephemeral", ttl })

const markSystemOptions = (options: Prompt.ProviderOptions, ttl: "1h" | undefined): Prompt.ProviderOptions => {
  const anthropic = jsonRecord(options.anthropic)
  const amazonBedrock = jsonRecord(options.amazonBedrock)
  const markedAnthropic = "cacheControl" in anthropic ? anthropic : { ...anthropic, cacheControl: cacheControl(ttl) }
  const markedBedrock = amazonBedrock.cachePoint === true ? amazonBedrock : { ...amazonBedrock, cachePoint: true }
  return markedAnthropic === anthropic && markedBedrock === amazonBedrock
    ? options
    : { ...options, anthropic: markedAnthropic, amazonBedrock: markedBedrock }
}

const markPartOptions = (options: Prompt.ProviderOptions, ttl: "1h" | undefined): Prompt.ProviderOptions => {
  const anthropic = jsonRecord(options.anthropic)
  const amazonBedrock = jsonRecord(options.amazonBedrock)
  const markedAnthropic = "cacheControl" in anthropic ? anthropic : { ...anthropic, cacheControl: cacheControl(ttl) }
  const markedBedrock = amazonBedrock.cachePoint === true ? amazonBedrock : { ...amazonBedrock, cachePoint: true }
  return markedAnthropic === anthropic && markedBedrock === amazonBedrock
    ? options
    : { ...options, anthropic: markedAnthropic, amazonBedrock: markedBedrock }
}

const lastIndex = <A>(values: ReadonlyArray<A>, predicate: (value: A) => boolean): number =>
  values.findLastIndex(predicate)

const isUserLike = (message: Prompt.Message): message is Prompt.UserMessage | Prompt.ToolMessage =>
  message.role === "user" || message.role === "tool"

const markLastPart = (
  message: Prompt.UserMessage | Prompt.ToolMessage,
  ttl: "1h" | undefined,
): Prompt.UserMessage | Prompt.ToolMessage | undefined => {
  const last = message.content.length - 1
  if (message.role === "user") {
    const part = message.content.at(-1)
    if (part === undefined) return undefined
    const options = markPartOptions(part.options, ttl)
    if (options === part.options) return undefined
    const marked =
      part.type === "text"
        ? Prompt.makePart("text", { text: part.text, options })
        : Prompt.makePart("file", { data: part.data, mediaType: part.mediaType, fileName: part.fileName, options })
    const content = message.content.map((current, index) => (index === last ? marked : current))
    return Prompt.makeMessage("user", { content, options: message.options })
  }
  const part = message.content.at(-1)
  if (part === undefined) return undefined
  const options = markPartOptions(part.options, ttl)
  if (options === part.options) return undefined
  const marked =
    part.type === "tool-result"
      ? Prompt.makePart("tool-result", {
          id: part.id,
          name: part.name,
          isFailure: part.isFailure,
          result: part.result,
          providerExecuted: part.providerExecuted,
          options,
        })
      : Prompt.makePart("tool-approval-response", {
          approvalId: part.approvalId,
          approved: part.approved,
          reason: part.reason,
          options,
        })
  const content = message.content.map((current, index) => (index === last ? marked : current))
  return Prompt.makeMessage("tool", { content, options: message.options })
}

/** @experimental The last-send gap above which the conversation boundary escalates to the one-hour cache. */
export const conversationEscalationMillis = 5 * 60 * 1_000

/** @experimental Mark one wire send with provider cache breakpoints derived from the run's send clock. */
export const withWireCache: {
  (prompt: Prompt.Prompt, purpose: CallPurpose, sendClock: SendClock): Effect.Effect<Prompt.Prompt, never, Clock.Clock>
  (
    purpose: CallPurpose,
    sendClock: SendClock,
  ): (prompt: Prompt.Prompt) => Effect.Effect<Prompt.Prompt, never, Clock.Clock>
} = Function.dual(
  3,
  (
    prompt: Prompt.Prompt,
    purpose: CallPurpose,
    sendClock: SendClock,
  ): Effect.Effect<Prompt.Prompt, never, Clock.Clock> =>
    Effect.gen(function* () {
      return withCacheBreakpoints(prompt, purpose, sendClock.idleSince(yield* Clock.currentTimeMillis))
    }),
)

interface WithCacheBreakpoints {
  (prompt: Prompt.Prompt, purpose: CallPurpose, idleMillis: number | undefined): Prompt.Prompt
  (purpose: CallPurpose, idleMillis: number | undefined): (prompt: Prompt.Prompt) => Prompt.Prompt
}

/** @experimental Provider cache breakpoints derived for one send; markers are never persisted. */
export const withCacheBreakpoints: WithCacheBreakpoints = Function.dual(
  3,
  (prompt: Prompt.Prompt, purpose: CallPurpose, idleMillis: number | undefined): Prompt.Prompt =>
    applyCacheBreakpoints(prompt, purpose, idleMillis),
)

const applyCacheBreakpoints = (prompt: Prompt.Prompt, purpose: CallPurpose, idleMillis?: number): Prompt.Prompt => {
  if (purpose !== "conversation") return prompt
  const conversationTtl = idleMillis !== undefined && idleMillis > conversationEscalationMillis ? "1h" : undefined
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
      const marked = markLastPart(message, conversationTtl)
      if (marked === undefined) return message
      budget -= 1
      changed = true
      return marked
    }
    return message
  })
  return changed ? Prompt.fromMessages(content) : prompt
}
