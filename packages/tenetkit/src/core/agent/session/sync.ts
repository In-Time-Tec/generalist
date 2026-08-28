import { Equal, Option } from "effect"
import { Prompt } from "effect/unstable/ai"
import { equivalentMessages } from "../../context/session-sync.js"

const sessionTranscriptCursor = (
  projection: ReadonlyArray<Prompt.Message>,
  transcript: ReadonlyArray<Prompt.Message>,
): Option.Option<number> => {
  if (projection.length === 0) return Option.some(0)
  const matches: Array<number> = []
  for (let start = 0; start <= transcript.length - projection.length; start += 1) {
    const candidate = transcript.slice(start, start + projection.length)
    if (
      transcript.slice(0, start).every((message) => message.role === "system") &&
      candidate.length === projection.length &&
      projection.every((message, index) => {
        const compared = candidate[index]
        return compared !== undefined && equivalentMessages(message, compared)
      })
    ) {
      matches.push(start + projection.length)
    }
  }
  const match = matches[0]
  return matches.length === 1 && match !== undefined ? Option.some(match) : Option.none()
}

const isAppendOnlyDescendant = (ancestor: Prompt.Prompt, descendant: Prompt.Prompt): boolean =>
  ancestor.content.length <= descendant.content.length &&
  ancestor.content.every((message, index) => Equal.equals(message, descendant.content[index]))

/** @internal Session/Prompt reconciliation shared by the compaction runtime. */
export const SessionSyncInternals = { sessionTranscriptCursor, isAppendOnlyDescendant }
