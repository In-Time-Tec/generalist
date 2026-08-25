import { Effect, Ref, Schema } from "effect"
import type { Chat } from "effect/unstable/ai"
import { LoopDriverState } from "../durable/loop-driver-state.js"
import type { RunOptions } from "./agent.js"
import { AgentError } from "./agent-event.js"
import { pendingToolCheckpoint, type ToolCheckpoint } from "./agent-suspension.js"

export const recoverToolCheckpoint = (input: {
  readonly options: RunOptions
  readonly chat: Chat.Service
}): Effect.Effect<ToolCheckpoint | undefined, AgentError> =>
  Effect.gen(function* () {
    const { options, chat } = input
    if (options.resume !== undefined || options.driverCheckpoint === undefined) return undefined
    const state = yield* Schema.decodeUnknownEffect(LoopDriverState)(options.driverCheckpoint.state).pipe(
      Effect.mapError((error) => AgentError.make({ message: `Invalid tool checkpoint: ${error}`, turn: 0 })),
    )
    if (state.pending?.kind !== "tool") return undefined
    const history = yield* Ref.get(chat.history)
    return pendingToolCheckpoint(history.content, state.pending.input)
  })
