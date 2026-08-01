import { Effect, Fiber, Ref } from "effect"
import { AgentEvent } from "@batonfx/core"
import { Chat, Prompt } from "effect/unstable/ai"
import type { SessionError } from "./session-registry-errors.js"
import type { SessionStatus } from "./wire.js"
import type { FrameWithoutSeq } from "./frame-journal.js"

export const makeInterruptionFinalizer = (input: {
  readonly lookup: (sessionId: string) => Effect.Effect<{ readonly chat: Ref.Ref<Chat.Persisted> }, SessionError>
  readonly finalize: (
    sessionId: string,
    runId: number,
    status: SessionStatus,
    outcome?: FrameWithoutSeq,
    transcript?: Prompt.Prompt,
  ) => Effect.Effect<void, SessionError>
  readonly drain: (sessionId: string, runId: number) => Effect.Effect<void>
}) => {
  const finalizeInterrupted = (sessionId: string, runId: number): Effect.Effect<void> => {
    const error = AgentEvent.AgentError.make({ message: "Session interrupted", turn: 0 })
    return input.lookup(sessionId).pipe(
      Effect.flatMap((session) => Ref.get(session.chat)),
      Effect.flatMap((chat) => Ref.get(chat.history)),
      Effect.flatMap((transcript) =>
        input.finalize(sessionId, runId, { _tag: "Failed", error }, { _tag: "Failed", error }, transcript),
      ),
      Effect.ignore,
    )
  }
  return (sessionId: string, runId: number, fiber: Fiber.Fiber<void>): Effect.Effect<void> =>
    Fiber.interrupt(fiber).pipe(
      Effect.andThen(finalizeInterrupted(sessionId, runId)),
      Effect.andThen(input.drain(sessionId, runId)),
    )
}
