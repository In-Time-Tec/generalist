import { Equal, Option } from "effect"
import { Prompt } from "effect/unstable/ai"
import { equivalentMessages } from "../../context/session-sync.js"

const sessionTranscriptCursor = (
  projection: ReadonlyArray<Prompt.Message>,
  transcript: ReadonlyArray<Prompt.Message>,
): Option.Option<number> => {
  if (projection.length === 0) return Option.some(0)
  // Active-agent instructions may add transient system messages at turn boundaries. Match the
  // durable projection in order while allowing only those messages to be skipped.
  let reachable = new Array<boolean>(transcript.length + 1).fill(false)
  reachable[0] = true
  for (const expected of projection) {
    const next = new Array<boolean>(transcript.length + 1).fill(false)
    let canSkipTo = false
    for (let index = 0; index < transcript.length; index += 1) {
      canSkipTo = reachable[index] === true || (canSkipTo && transcript[index - 1]?.role === "system")
      const compared = transcript[index]
      if (canSkipTo && compared !== undefined && equivalentMessages(expected, compared)) next[index + 1] = true
    }
    reachable = next
  }
  const matches = reachable.flatMap((matched, index) => (matched ? [index] : []))
  const match = matches[0]
  return matches.length === 1 && match !== undefined ? Option.some(match) : Option.none()
}

const isAppendOnlyDescendant = (ancestor: Prompt.Prompt, descendant: Prompt.Prompt): boolean =>
  ancestor.content.length <= descendant.content.length &&
  ancestor.content.every((message, index) => Equal.equals(message, descendant.content[index]))

/** @internal Session/Prompt reconciliation shared by the compaction runtime. */
export const SessionSyncInternals = { sessionTranscriptCursor, isAppendOnlyDescendant }
