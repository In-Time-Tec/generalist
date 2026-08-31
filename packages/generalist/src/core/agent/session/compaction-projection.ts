import { Effect, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import { AgentError } from "../event.js"
import type { Result } from "../../turn/compaction.js"

const validateCompactionProjection = (turn: number, result: Result): Effect.Effect<void, AgentError> => {
  const pending = new Set<string>()
  const optional = new Set<string>()
  for (const message of Prompt.concat(result.history, result.prompt).content) {
    if (Schema.is(Schema.String)(message.content)) {
      if (pending.size > 0) {
        return Effect.fail(
          AgentError.make({ message: "Compaction projection separates a tool call from its result", turn }),
        )
      }
      optional.clear()
      continue
    }
    const hasResult = message.content.some((part) => part.type === "tool-result")
    if (pending.size > 0 && !hasResult) {
      return Effect.fail(
        AgentError.make({ message: "Compaction projection separates a tool call from its result", turn }),
      )
    }
    if (!hasResult) optional.clear()
    const responseCalls = new Set<string>()
    for (const part of message.content) {
      if (part.type === "tool-call") {
        if (responseCalls.has(part.id)) {
          return Effect.fail(
            AgentError.make({ message: `Compaction projection contains duplicate tool call ${part.id}`, turn }),
          )
        }
        responseCalls.add(part.id)
        if (part.providerExecuted) optional.add(part.id)
        else pending.add(part.id)
      }
      if (part.type === "tool-result" && !pending.delete(part.id) && !optional.delete(part.id)) {
        return Effect.fail(
          AgentError.make({ message: `Compaction projection contains orphan tool result ${part.id}`, turn }),
        )
      }
    }
  }
  return pending.size === 0
    ? Effect.void
    : Effect.fail(AgentError.make({ message: "Compaction projection contains an unresolved tool call", turn }))
}

export const CompactionProjection = { validate: validateCompactionProjection }
