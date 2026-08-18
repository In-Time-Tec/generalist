import { Clock, Effect, Function } from "effect"
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

const markPartOptions = (options: Prompt.ProviderOptions, ttl: "1h" | undefined): Prompt.ProviderOptions => {
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

const lastIndex = <A>(values: ReadonlyArray<A>, predicate: (value: A) => boolean): number => {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (predicate(values[index] as A)) return index
  }
  return -1
}

const isUserLike = (message: Prompt.Message): boolean => message.role === "user" || message.role === "tool"

const markLastPart = (message: Prompt.Message, ttl: "1h" | undefined): Prompt.Message | undefined => {
  if (message.content.length === 0) return undefined
  const last = message.content.length - 1
  const part = message.content[last] as Prompt.Part
  const options = markPartOptions(part.options, ttl)
  if (options === part.options) return undefined
  const marked = Prompt.makePart(part.type, { ...(part as unknown as Record<string, unknown>), options } as never)
  return Prompt.makeMessage(message.role, {
    content: [...message.content.slice(0, last), marked],
    options: message.options,
  } as never)
}

/** @experimental The last-send gap above which the conversation boundary escalates to the one-hour cache. */
export const conversationEscalationMillis = 5 * 60 * 1_000

/** @experimental Mutable last-send clock driving conversation cache escalation. */
export interface SendClock {
  readonly idleSince: (now: number) => number | undefined
}

/** @experimental One run's last-send tracker; gaps above the escalation threshold move the conversation boundary to one hour. */
export const makeSendClock = (): SendClock => {
  let lastSendAtMillis: number | undefined
  return {
    idleSince: (now: number): number | undefined => {
      const idle = lastSendAtMillis === undefined ? undefined : now - lastSendAtMillis
      lastSendAtMillis = now
      return idle
    },
  }
}

/** @experimental Mark one wire send with provider cache breakpoints derived from the run's send clock. */
export const withWireCache: {
  (
    prompt: Prompt.Prompt,
    purpose: ModelCallPurpose,
    sendClock: SendClock,
  ): Effect.Effect<Prompt.Prompt, never, Clock.Clock>
  (
    purpose: ModelCallPurpose,
    sendClock: SendClock,
  ): (prompt: Prompt.Prompt) => Effect.Effect<Prompt.Prompt, never, Clock.Clock>
} = Function.dual(
  3,
  (
    prompt: Prompt.Prompt,
    purpose: ModelCallPurpose,
    sendClock: SendClock,
  ): Effect.Effect<Prompt.Prompt, never, Clock.Clock> =>
    Effect.gen(function* () {
      return withCacheBreakpoints(prompt, purpose, sendClock.idleSince(yield* Clock.currentTimeMillis))
    }),
)

interface WithCacheBreakpoints {
  (prompt: Prompt.Prompt, purpose: ModelCallPurpose, idleMillis: number | undefined): Prompt.Prompt
  (purpose: ModelCallPurpose, idleMillis: number | undefined): (prompt: Prompt.Prompt) => Prompt.Prompt
}

/** @experimental Provider cache breakpoints derived for one send; markers are never persisted. */
export const withCacheBreakpoints: WithCacheBreakpoints = Function.dual(
  3,
  (prompt: Prompt.Prompt, purpose: ModelCallPurpose, idleMillis: number | undefined): Prompt.Prompt =>
    applyCacheBreakpoints(prompt, purpose, idleMillis),
)

const applyCacheBreakpoints = (
  prompt: Prompt.Prompt,
  purpose: ModelCallPurpose,
  idleMillis?: number,
): Prompt.Prompt => {
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
