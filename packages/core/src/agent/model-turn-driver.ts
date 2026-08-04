import { Cause, Effect, Schema, Stream } from "effect"
import { LanguageModel, Prompt, Tool } from "effect/unstable/ai"
import { checkpoint, interceptStream, logicalOperationId } from "../durable/driver-run.js"
import { operationKey } from "../durable/driver-interpreter.js"
import { LoopDriverState, modelCallOrdinal } from "../durable/loop-driver-state.js"
import { DriverStateInvalid } from "../durable/durable-driver.js"
import type { DuplicateToolCallId } from "./agent-event.js"
import type { RunError } from "./agent.js"

type AttemptEvent = {
  readonly part: import("effect/unstable/ai").Response.StreamPart<Record<string, Tool.Any>>
  readonly messages: ReadonlyArray<Prompt.Message>
  readonly accept: Effect.Effect<void, DuplicateToolCallId>
}

type AttemptBody = (
  activePrompt: Prompt.Prompt,
  retryOverflow: boolean,
  compactOverflow?: boolean,
  overflowCause?: Cause.Cause<RunError>,
) => Stream.Stream<AttemptEvent, RunError, LanguageModel.LanguageModel>

export const wrapDriverAttempt =
  (turn: number, attemptBody: AttemptBody): AttemptBody =>
  (activePrompt, retryOverflow, compactOverflow = false, overflowCause) =>
    Stream.unwrap(
      Effect.gen(function* () {
        const logicalId = yield* logicalOperationId
        const current = yield* checkpoint
        const driverState = yield* Schema.decodeUnknownEffect(LoopDriverState)(current.state).pipe(
          Effect.mapError((error) => DriverStateInvalid.make({ message: String(error) })),
        )
        const ordinal = modelCallOrdinal(driverState)
        return interceptStream(
          {
            kind: "model",
            key: operationKey(logicalId, "model", turn, ordinal, "conversation"),
            input: { turn, modelCallOrdinal: ordinal, purpose: "conversation" },
            replayPolicy: "provider-idempotent",
          },
          attemptBody(activePrompt, retryOverflow, compactOverflow, overflowCause),
        )
      }),
    ) as Stream.Stream<AttemptEvent, RunError, LanguageModel.LanguageModel>
