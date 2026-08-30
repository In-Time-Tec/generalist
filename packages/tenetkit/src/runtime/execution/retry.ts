import { Effect, Ref } from "effect"
import { AgentEvent } from "../../core/index.js"
import { DurableDriver } from "../../core/durable/public/driver.js"
import { ModelTelemetry } from "../../core/model/public/telemetry.js"
import type { ExecutionContinuation } from "../run/steering.js"
import type { ExecutionClaim, Service as RunStore } from "../run/store.js"

const maxExecutionAttempts = 3

type EscapedFailure = {
  readonly modelCallId: string
  readonly turn: number
}

export type Retry = {
  readonly attempt: number
  readonly checkpoint: DurableDriver.DriverCheckpoint
  readonly continuation?: ExecutionContinuation
  readonly turn: number
}

const isRecoverable = (event: ModelTelemetry.AttemptFailed): boolean =>
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
        if (latest.attempt >= maxExecutionAttempts || checkpoint === undefined) return undefined
        const retried = yield* store.retryExecution(claim)
        yield* Ref.set(attempt, retried.attempt)
        const nextRetry: Retry = {
          attempt: retried.attempt,
          checkpoint,
          turn: failure.turn,
        }
        if (retried.continuation !== undefined) Object.assign(nextRetry, { continuation: retried.continuation })
        return nextRetry
      }).pipe(Effect.orDie)
    return { attempt: Ref.get(attempt), observe, retry }
  })
