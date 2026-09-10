import { Effect, Option, Ref, Schema, Stream } from "effect"
import { Chat, Prompt } from "effect/unstable/ai"
import type { Event } from "../event.js"
import type { AttemptCompleted, CompletedModelOperation } from "../../model/operation.js"
import type { AgentRunState } from "../run-state.js"
import type { Service as ActiveModelResponse } from "../../model/result/active-model-response.js"
import { DriverInterpreter } from "../../durable/driver/interpreter.js"
import { LoopDriverState } from "../../durable/loop-driver-state.js"
import { coalesceAdjacentText } from "../../context/session-sync.js"
import { text as modelResponseText } from "../../model/response/builder.js"
import type { RunError } from "../service.js"
import { clearCommittedResponse, type ResponseAuthority } from "./response.js"
import { promptFromResponseParts } from "../../../media/prompt.js"

/** @internal Public semantic event derived from the canonical model operation result. */
export const committedEvent = (input: {
  readonly operation: CompletedModelOperation
  readonly attempt: AttemptCompleted
}): Event => {
  const { operation, attempt } = input
  return {
    _tag: "ModelResponseCommitted",
    turn: operation.turn,
    operationKey: operation.operationId,
    modelCallId: operation.modelCallId,
    modelAttemptId: operation.modelAttemptId,
    attempt: operation.attempt,
    response: attempt.response,
    budgetCharge: operation.budgetCharge,
    digest: operation.digest,
  }
}

export const projectCommittedResponse = (input: {
  readonly operation: CompletedModelOperation
  readonly attempt: AttemptCompleted
  readonly responseAuthority: ResponseAuthority | undefined
  readonly activeModelResponse: Option.Option<ActiveModelResponse>
  readonly state: AgentRunState
  readonly chat: Chat.Service
}): Effect.Effect<Stream.Stream<Event, RunError>, never, DriverInterpreter> =>
  Effect.gen(function* () {
    input.state.text = `${input.state.text}${modelResponseText(input.attempt.response)}`
    yield* Ref.set(
      input.chat.history,
      Prompt.concat(
        Prompt.fromMessages(input.attempt.messages),
        Prompt.fromMessages(promptFromResponseParts(input.attempt.response.content).content.map(coalesceAdjacentText)),
      ),
    )
    clearCommittedResponse({ service: input.activeModelResponse, authority: input.responseAuthority })
    const interpreter = yield* DriverInterpreter
    const driverState = yield* Schema.decodeUnknownEffect(LoopDriverState)((yield* interpreter.checkpoint).state).pipe(
      Effect.orDie,
    )
    const event = committedEvent(input)
    return driverState.postCommitFailure === undefined
      ? Stream.make(event)
      : Stream.make(event).pipe(Stream.concat(Stream.fail(driverState.postCommitFailure)))
  })
