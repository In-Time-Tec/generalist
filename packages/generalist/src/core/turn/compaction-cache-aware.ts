import { Option } from "effect"
import { Prompt } from "effect/unstable/ai"
import { safeCutIndex } from "./compaction-cut.js"
import type { Strategy } from "./compaction.js"

/** @experimental Options for cache-aware semantic compaction. */
export interface Options {
  readonly stablePrefixTurns: number
  readonly keepRecentTokens?: number
  readonly summarize: Strategy["summarize"]
}

const defaultKeepRecentTokens = 20_000

const safeNonNegativeInteger = (name: string, value: number): number => {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${name} must be a non-negative safe integer`)
  return value
}

const stablePrefixEnd = (messages: ReadonlyArray<Prompt.Message>, stablePrefixTurns: number): number => {
  let turns = 0
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index]
    if (message?.role === "user") {
      if (turns === stablePrefixTurns) return index
      turns += 1
    }
  }
  return messages.length
}

/**
 * @experimental Keep instructions and the oldest configured user turns byte-stable,
 * summarize only the middle, and retain the recent token-denominated tail verbatim.
 */
export const cacheAware = (options: Options): Strategy => {
  const stablePrefixTurns = safeNonNegativeInteger("CacheAwareOptions.stablePrefixTurns", options.stablePrefixTurns)
  const keepRecentTokens =
    options.keepRecentTokens === undefined
      ? defaultKeepRecentTokens
      : safeNonNegativeInteger("CacheAwareOptions.keepRecentTokens", options.keepRecentTokens)
  return {
    shouldCompact: ({ tokens, contextWindow }) => Number.isFinite(contextWindow) && tokens > contextWindow,
    keepRecentTokens,
    cut: (prompt, recentTokens) => {
      const entries = prompt.content.map((message, index) => ({
        _tag: "Message" as const,
        id: String(index),
        parentId: index === 0 ? null : String(index - 1),
        message,
      }))
      const recentStart = safeCutIndex(entries, recentTokens)
      const prefixEnd = stablePrefixEnd(prompt.content, stablePrefixTurns)
      if (prefixEnd >= recentStart) return Option.none()
      return Option.some({
        keep: Prompt.fromMessages(prompt.content.slice(0, prefixEnd)),
        compact: Prompt.fromMessages(prompt.content.slice(prefixEnd, recentStart)),
        recent: Prompt.fromMessages(prompt.content.slice(recentStart)),
      })
    },
    summarize: options.summarize,
  }
}
