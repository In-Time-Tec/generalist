import { Effect, Ref, Schema } from "effect"
import type { Chat } from "effect/unstable/ai"
import { LoopDriverState } from "../../durable/loop-driver-state.js"
import type { RunOptions } from "../service.js"
import { AgentError } from "../event.js"
import { checkpointFromHistory, type ToolCheckpoint } from "../suspension.js"

export const recoverToolCheckpoint = (input: {
  readonly options: RunOptions
  readonly chat: Chat.Service
}): Effect.Effect<ToolCheckpoint | undefined, AgentError> =>
  Effect.gen(function* () {
    const { options, chat } = input
    if (options.resume !== undefined || options.driverCheckpoint === undefined) return undefined
    const state = yield* Schema.decodeUnknownEffect(LoopDriverState)(options.driverCheckpoint.state).pipe(
      Effect.mapError((error) => AgentError.make({ message: `Invalid tool checkpoint: ${String(error)}`, turn: 0 })),
    )
    if (state.toolBatch === undefined) return undefined
    const history = yield* Ref.get(chat.history)
    return checkpointFromHistory(history.content, state.toolBatch)
  })
