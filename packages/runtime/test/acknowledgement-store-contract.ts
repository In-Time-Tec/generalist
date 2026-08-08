import { expect } from "vitest"
import { Effect, Schema } from "effect"
import { Errors, Runtime, RunStore } from "../src/index.js"
import { assistantAddress, emptyTranscript } from "./helpers.js"

export const acknowledgementBoundaryContract = (suffix: string) =>
  Effect.gen(function* () {
    const runtime = yield* Runtime.Runtime
    const store = yield* RunStore.RunStore
    const receipt = yield* runtime.send({
      to: assistantAddress,
      sessionId: `session:ack-boundary:${suffix}`,
      idempotencyKey: `run:ack-boundary:${suffix}`,
      prompt: "start",
    })
    expect(yield* runtime.acknowledged(receipt.runId)).toEqual({ runId: receipt.runId, sequence: -1 })
    const claim = yield* store.claimExecution({ runId: receipt.runId, ownerId: `ack-boundary:${suffix}` })
    yield* store.emitAgentEvent({
      ...claim,
      event: { _tag: "TurnCompleted", turn: 1, transcript: emptyTranscript },
    })
    yield* store.emitAgentEvent({
      ...claim,
      event: { _tag: "SteeringDrained", turn: 2, queue: "steering", count: 1 },
    })
    yield* store.emitAgentEvent({
      ...claim,
      event: { _tag: "TurnCompleted", turn: 2, transcript: emptyTranscript },
    })
    const history = yield* runtime.history({ runId: receipt.runId, cursor: -1, limit: 100 })
    const boundaries = history.filter((event) => event._tag === "TurnCompleted")
    expect(boundaries).toHaveLength(2)
    const cycle1 = boundaries[0]!.sequence
    const cycle2 = boundaries[1]!.sequence
    const existingNonBoundary = history.find((event) => event._tag === "RunAccepted")!.sequence
    const betweenBoundaries = history.find(
      (event) => event.sequence > cycle1 && event.sequence < cycle2 && event._tag !== "TurnCompleted",
    )!.sequence

    yield* runtime.acknowledge({ runId: receipt.runId, sequence: -1 })
    for (const sequence of [
      existingNonBoundary,
      betweenBoundaries,
      -2,
      0.5,
      Number.NaN,
      Infinity,
      -Infinity,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      const failure = yield* runtime.acknowledge({ runId: receipt.runId, sequence }).pipe(Effect.flip)
      expect(failure).toBeInstanceOf(Errors.AckInvalid)
      if (Schema.is(Errors.AckInvalid)(failure)) yield* Schema.encodeEffect(Errors.AckInvalid)(failure)
    }
    expect((yield* runtime.acknowledged(receipt.runId)).sequence).toBe(-1)

    yield* runtime.acknowledge({ runId: receipt.runId, sequence: cycle1 })
    yield* runtime.acknowledge({ runId: receipt.runId, sequence: cycle1 })
    const olderInvalid = yield* runtime
      .acknowledge({ runId: receipt.runId, sequence: existingNonBoundary })
      .pipe(Effect.flip)
    expect(olderInvalid).toBeInstanceOf(Errors.AckInvalid)
    expect((yield* runtime.acknowledged(receipt.runId)).sequence).toBe(cycle1)

    yield* Effect.all(
      [
        runtime.acknowledge({ runId: receipt.runId, sequence: cycle1 }),
        runtime.acknowledge({ runId: receipt.runId, sequence: cycle2 }),
      ],
      { concurrency: "unbounded" },
    )
    yield* runtime.acknowledge({ runId: receipt.runId, sequence: cycle1 })
    expect((yield* runtime.acknowledged(receipt.runId)).sequence).toBe(cycle2)

    const future = yield* runtime.acknowledge({ runId: receipt.runId, sequence: cycle2 + 1 }).pipe(Effect.flip)
    expect(future).toBeInstanceOf(Errors.AckBeyondCommitted)
    if (Schema.is(Errors.AckBeyondCommitted)(future)) expect(future.lastCommittedSequence).toBe(cycle2)
    expect((yield* runtime.acknowledged(receipt.runId)).sequence).toBe(cycle2)
    return { runId: receipt.runId, sequence: cycle2 }
  })
