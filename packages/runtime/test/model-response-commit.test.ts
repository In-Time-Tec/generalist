import { Database } from "bun:sqlite"
import { expect, it, layer } from "@effect/vitest"
import { Effect, Fiber, Layer, Ref, Schema, Stream } from "effect"
import { Response } from "effect/unstable/ai"
import { Pins } from "@batonfx/core"
import { Runtime, RunStore } from "../src/index.js"
import { assistantAddress, memoryLayer, textPrompt } from "./helpers.js"
import { sqliteLayer, tempDbPath } from "./sqlite-helpers.js"

const jsonValue = (value: unknown): unknown => JSON.parse(Schema.encodeSync(Schema.UnknownFromJsonString)(value))

const completion = (operationKey: string, text = "semantic answer") => {
  const response = {
    content: [Response.makePart("text", { text })],
    finishReason: "stop" as const,
  }
  const unsigned = {
    operationId: operationKey,
    turn: 0,
    modelCallId: "model-call:1",
    modelAttemptId: "model-attempt:1",
    attempt: 0,
    messages: [],
    content: Schema.encodeSync(Schema.Array(Response.TextPart))(response.content),
    finishReason: "stop" as const,
  }
  const digest = Pins.digest(jsonValue(unsigned))
  return {
    outcome: { _tag: "Succeeded" as const, value: { ...unsigned, digest } },
    event: {
      _tag: "ModelResponseCommitted" as const,
      turn: 0,
      operationKey,
      modelCallId: "model-call:1",
      modelAttemptId: "model-attempt:1",
      attempt: 0,
      response,
      digest,
    },
  }
}

const schedule = (runId: string) =>
  Effect.gen(function* () {
    const store = yield* RunStore.RunStore
    const claim = yield* store.claimExecution({ runId, ownerId: "model-commit-test" })
    const operationKey = `${runId}:model:0`
    const operation = yield* store.recordOperation({
      ...claim,
      operationKey,
      kind: "model",
      inputDigest: Pins.digest({ turn: 0 }),
      input: { turn: 0 },
      replayPolicy: "never",
      attempt: 0,
    })
    yield* store.startOperation({ ...claim, operationId: operation.operationId })
    return { store, claim, operation, operationKey }
  })

layer(memoryLayer)("atomic model response memory commit", (suite) => {
  suite.effect("rejects a divergent outbox and appends one exact event across retries", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const receipt = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:model-commit-memory",
        idempotencyKey: "model-commit-memory",
        prompt: textPrompt("answer"),
      })
      const { store, claim, operation, operationKey } = yield* schedule(receipt.runId)
      const exact = completion(operationKey)
      const divergent = {
        ...exact,
        event: { ...exact.event, response: completion(operationKey, "wrong").event.response },
      }
      const rejected = yield* Effect.exit(
        store.commitModelResponse({ ...claim, operationId: operation.operationId, ...divergent }),
      )
      expect(rejected._tag).toBe("Failure")
      expect((yield* store.getOperation({ runId: receipt.runId, operationId: operation.operationId })).status).toBe(
        "running",
      )
      expect(
        (yield* runtime.history({ runId: receipt.runId, limit: 100 })).some(
          (event) => event._tag === "ModelResponseCommitted",
        ),
      ).toBe(false)

      yield* store.commitModelResponse({ ...claim, operationId: operation.operationId, ...exact })
      yield* store.commitModelResponse({ ...claim, operationId: operation.operationId, ...exact })
      const responses = (yield* runtime.history({ runId: receipt.runId, limit: 100 })).filter(
        (event) => event._tag === "ModelResponseCommitted",
      )
      expect(responses).toHaveLength(1)
      expect(responses[0]).toMatchObject({ digest: exact.event.digest, response: exact.event.response })
    }),
  )
})

const scopedWith =
  <A, E>(layerValue: Layer.Layer<A, E, never>) =>
  <B, E2, R2 extends A>(effect: Effect.Effect<B, E2, R2>): Effect.Effect<B, E | E2> =>
    Effect.scoped(Effect.flatMap(Layer.build(layerValue), (context) => effect.pipe(Effect.provideContext(context))))

it.live("keeps rolled-back SQLite model completion invisible until commit", () => {
  const filename = tempDbPath("model-response-rollback")
  return scopedWith(sqliteLayer(filename))(
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const receipt = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:model-response-rollback",
        idempotencyKey: "model-response-rollback",
        prompt: textPrompt("answer"),
      })
      const { store, claim, operation, operationKey } = yield* schedule(receipt.runId)
      const exact = completion(operationKey)
      const before = yield* runtime.history({ runId: receipt.runId, limit: 100 })
      const seen = yield* Ref.make<ReadonlyArray<string>>([])
      const subscriber = yield* runtime.events({ runId: receipt.runId, cursor: before.at(-1)!.sequence }).pipe(
        Stream.tap((event) => Ref.update(seen, (tags) => [...tags, event._tag])),
        Stream.take(1),
        Stream.runCollect,
        Effect.forkChild({ startImmediately: true }),
      )
      const database = new Database(filename)
      database.exec(`
        CREATE TRIGGER fail_model_completion_after_event
        BEFORE UPDATE ON baton_tree_roots
        WHEN EXISTS (
          SELECT 1 FROM baton_run_events
          WHERE run_id = '${receipt.runId.replaceAll("'", "''")}'
            AND event_json LIKE '%"_tag":"ModelResponseCommitted"%'
        )
        BEGIN
          SELECT RAISE(ABORT, 'forced failure after model outbox insertion');
        END
      `)
      const failed = yield* Effect.exit(
        store.commitModelResponse({ ...claim, operationId: operation.operationId, ...exact }),
      )
      expect(failed._tag).toBe("Failure")
      expect(yield* runtime.history({ runId: receipt.runId, limit: 100 })).toEqual(before)
      expect((yield* store.getOperation({ runId: receipt.runId, operationId: operation.operationId })).status).toBe(
        "running",
      )
      expect(yield* Ref.get(seen)).toEqual([])

      database.exec("DROP TRIGGER fail_model_completion_after_event")
      database.close()
      yield* store.commitModelResponse({ ...claim, operationId: operation.operationId, ...exact })
      const observed = Array.from(yield* Fiber.join(subscriber))
      expect(observed).toHaveLength(1)
      expect(observed[0]?._tag).toBe("ModelResponseCommitted")
      expect(
        (yield* runtime.history({ runId: receipt.runId, limit: 100 })).filter(
          (event) => event._tag === "ModelResponseCommitted",
        ),
      ).toHaveLength(1)
    }),
  )
})
