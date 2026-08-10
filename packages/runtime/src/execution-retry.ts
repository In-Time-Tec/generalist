import { Effect, Ref } from "effect"
import { AgentEvent, DurableDriver, ModelTelemetry } from "@batonfx/core"
import type { Prompt } from "effect/unstable/ai"
import type { ExecutionContinuation } from "./steering.js"
import type { ExecutionClaim, Interface as RunStore } from "./run-store.js"

const maxExecutionAttempts = 3

type EscapedFailure = {
  readonly modelCallId: string
  readonly turn: number
}

export type Retry = {
  readonly attempt: number
  readonly checkpoint: DurableDriver.DriverCheckpoint
  readonly transcript: Prompt.Prompt
  readonly continuation?: ExecutionContinuation
  readonly turn: number
}

const isRecoverable = (event: ModelTelemetry.ModelAttemptFailed): boolean =>
  event.classification === "transient" ||
  event.category === "rate-limit" ||
  event.category === "transport" ||
  event.category === "truncated-stream" ||
  event.category === "timeout"

export const make = (initialAttempt: number) =>
  Effect.gen(function* () {
    const attempt = yield* Ref.make(initialAttempt)
    const escaped = yield* Ref.make<EscapedFailure | undefined>(undefined)
    const observe = (event: AgentEvent.Event): Effect.Effect<void> => {
      if (event._tag === "ModelAttemptFailed") {
        return Ref.set(escaped, isRecoverable(event) ? { modelCallId: event.modelCallId, turn: event.turn } : undefined)
      }
      return event._tag === "ModelCallCompleted" ? Ref.set(escaped, undefined) : Effect.void
    }
    const retry = (store: RunStore, claim: ExecutionClaim): Effect.Effect<Retry | undefined> =>
      Effect.gen(function* () {
        const failure = yield* Ref.get(escaped)
        if (failure === undefined || failure.turn <= 0) return undefined
        const latest = yield* store.loadExecution(claim.runId)
        const checkpoint =
          latest.checkpoint !== undefined && "driverVersion" in latest.checkpoint ? latest.checkpoint : undefined
        if (latest.attempt >= maxExecutionAttempts || checkpoint === undefined || latest.transcript === undefined) {
          return undefined
        }
        const retried = yield* store.retryExecution(claim)
        yield* Ref.set(attempt, retried.attempt)
        return {
          attempt: retried.attempt,
          checkpoint,
          transcript: retried.transcript ?? latest.transcript,
          ...(retried.continuation === undefined ? {} : { continuation: retried.continuation }),
          turn: failure.turn,
        }
      }).pipe(Effect.orDie)
    return { attempt: Ref.get(attempt), observe, retry }
  })
