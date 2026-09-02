/* oxlint-disable effecttsgo/strict-effect-provide */
import { describe, expect, it } from "@effect/vitest"
import { Effect, Stream } from "effect"
import { Response } from "effect/unstable/ai"
import { Replay, Wire } from "../../../src/unstable/transport/index.js"
import { event, runtimeLayer } from "./fixtures.js"

describe("Replay", () => {
  it.effect("returns a bounded strict page and preserves the load cursor", () =>
    Effect.gen(function* () {
      const result = yield* Replay.page({ runId: "run-1", cursor: 0, limit: 1 })
      expect(result.cursor).toBe(1)
      expect(result.hasMore).toBe(true)
      expect(result.frames.map((frame) => frame.sequence)).toEqual([1])
      expect((yield* Wire.observerCodec.decode(result.frames[0]!.data)).sequence).toBe(1)
    }).pipe(Effect.provide(runtimeLayer())),
  )

  it.effect("hydrates compact model responses before observer encoding", () => {
    const compact = {
      ...event(0),
      _tag: "ModelResponseInterrupted" as const,
      turn: 0,
      operationKey: "run-1:model:0",
      modelCallId: "model-call-1",
      modelAttemptId: "model-attempt-1",
      attempt: 0,
      sessionId: "session-1",
      sessionParentId: "entry:input",
      sessionEntryId: "entry-1",
      reason: "failure" as const,
      digest: "digest-1",
    }
    const response = { content: [Response.makePart("text", { text: "retained" })] }
    return Effect.gen(function* () {
      const result = yield* Replay.page({ runId: "run-1", limit: 1 })
      expect(yield* Wire.observerCodec.decode(result.frames[0]!.data)).toEqual({ ...compact, response })
    }).pipe(
      Effect.provide(
        runtimeLayer({
          events: () => Stream.empty,
          history: () => Effect.succeed([compact]),
          resolveModelResponse: () => Effect.succeed(response),
        }),
      ),
    )
  })

  it.effect("replays a journaled compaction record", () => {
    const compacted = {
      ...event(0),
      _tag: "CompactionApplied" as const,
      deliveryId: "delivery-compaction-1",
      turn: 2,
      compactionId: "compaction-1",
      checkpointId: "checkpoint-1",
      kind: "summarize" as const,
      appliedAt: 12,
      commit: {
        compactionId: "compaction-1",
        checkpointId: "checkpoint-1",
        summaryModelCallId: "summary-call-1",
        contextTokensBefore: 120,
        contextTokensAfter: 40,
        entriesBefore: 8,
        entriesAfter: 4,
      },
    }
    return Effect.gen(function* () {
      const result = yield* Replay.page({ runId: "run-1", limit: 1 })
      expect(yield* Wire.observerCodec.decode(result.frames[0]!.data)).toEqual(compacted)
    }).pipe(
      Effect.provide(
        runtimeLayer({
          events: () => Stream.empty,
          history: () => Effect.succeed([compacted]),
        }),
      ),
    )
  })

  it.effect("uses origin -1 and does not advance an empty page", () =>
    Effect.gen(function* () {
      const result = yield* Replay.page({ runId: "run-1", limit: 2 })
      expect(result).toEqual({ frames: [], cursor: -1, hasMore: false })
    }).pipe(Effect.provide(runtimeLayer({ history: () => Effect.succeed([]) }))),
  )
})
