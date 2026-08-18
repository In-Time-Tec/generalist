import { Equal, Option } from "effect"
import { Prompt } from "effect/unstable/ai"
import { equivalentMessages } from "../context/session-sync.js"

const sessionTranscriptCursor = (
  projection: ReadonlyArray<Prompt.Message>,
  transcript: ReadonlyArray<Prompt.Message>,
): Option.Option<number> => {
  if (projection.length === 0) return Option.some(0)
  const matches: Array<number> = []
  for (let start = 0; start <= transcript.length - projection.length; start += 1) {
    if (
      transcript.slice(0, start).every((message) => message.role === "system") &&
      projection.every((message, index) => equivalentMessages(message, transcript[start + index] as Prompt.Message))
    ) {
      matches.push(start + projection.length)
    }
  }
  return matches.length === 1 ? Option.some(matches[0] as number) : Option.none()
}

const isAppendOnlyDescendant = (ancestor: Prompt.Prompt, descendant: Prompt.Prompt): boolean =>
  ancestor.content.length <= descendant.content.length &&
  ancestor.content.every((message, index) => Equal.equals(message, descendant.content[index]))

/** @internal Session/Prompt reconciliation shared by the compaction runtime. */
export const SessionSyncInternals = { sessionTranscriptCursor, isAppendOnlyDescendant }
