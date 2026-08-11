import { Database } from "bun:sqlite"
import { expect, it, layer } from "@effect/vitest"
import { Effect, Fiber, Layer, Option, Ref, Schema, Stream } from "effect"
import { Response } from "effect/unstable/ai"
import { Pins, Session } from "@batonfx/core"
import { Runtime, RunStore } from "../src/index.js"
import { assistantAddress, memoryLayer, textPrompt } from "./helpers.js"
import { sqliteLayer, tempDbPath } from "./sqlite-helpers.js"

const jsonValue = (value: unknown): unknown => JSON.parse(Schema.encodeSync(Schema.UnknownFromJsonString)(value))

const completion = (operationKey: string, sessionParentId: string | null, text = "semantic answer") => {
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
    sessionParentId,
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
    const execution = yield* store.loadExecution(runId)
    const maybeSession = yield* store.sessionStore(execution.message.sessionId)
    if (Option.isNone(maybeSession)) return yield* Effect.die("expected Session store")
    const prefix = yield* maybeSession.value.append({
      _tag: "Message",
      message: textPrompt("durable model input").content[0]!,
    })
    return { store, claim, operation, operationKey, sessionParentId: prefix.id }
  })

const sessionProjection = (store: RunStore.Interface, sessionId: string) =>
  Effect.gen(function* () {
    const maybeSession = yield* store.sessionStore(sessionId)
    if (Option.isNone(maybeSession)) return yield* Effect.die("expected Session store")
    return Session.buildContext(yield* maybeSession.value.path())
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
      const { store, claim, operation, operationKey, sessionParentId } = yield* schedule(receipt.runId)
      const exact = completion(operationKey, sessionParentId)
      const divergent = {
        ...exact,
        event: { ...exact.event, response: completion(operationKey, sessionParentId, "wrong").event.response },
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
      expect((yield* sessionProjection(store, "session:model-commit-memory")).content).toHaveLength(1)

      yield* store.commitModelResponse({ ...claim, operationId: operation.operationId, ...exact })
      yield* store.commitModelResponse({ ...claim, operationId: operation.operationId, ...exact })
      const divergentRetry = completion(operationKey, sessionParentId, "divergent retry")
      expect(
        (yield* Effect.exit(
          store.commitModelResponse({ ...claim, operationId: operation.operationId, ...divergentRetry }),
        ))._tag,
      ).toBe("Failure")
      const responses = (yield* runtime.history({ runId: receipt.runId, limit: 100 })).filter(
        (event) => event._tag === "ModelResponseCommitted",
      )
      expect(responses).toHaveLength(1)
      expect(responses[0]).toMatchObject({ digest: exact.event.digest, response: exact.event.response })
      const projection = yield* sessionProjection(store, "session:model-commit-memory")
      expect(projection.content).toHaveLength(2)
      const projectionJson = yield* Schema.encodeEffect(Schema.UnknownFromJsonString)(projection.content)
      expect(projectionJson).toContain("semantic answer")
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
      const { store, claim, operation, operationKey, sessionParentId } = yield* schedule(receipt.runId)
      const exact = completion(operationKey, sessionParentId)
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
      expect((yield* sessionProjection(store, "session:model-response-rollback")).content).toHaveLength(1)
      expect(yield* Ref.get(seen)).toEqual([])

      database.exec("DROP TRIGGER fail_model_completion_after_event")
      database.close()
      yield* store.commitModelResponse({ ...claim, operationId: operation.operationId, ...exact })
      yield* store.commitModelResponse({ ...claim, operationId: operation.operationId, ...exact })
      const divergentRetry = completion(operationKey, sessionParentId, "divergent sqlite retry")
      expect(
        (yield* Effect.exit(
          store.commitModelResponse({ ...claim, operationId: operation.operationId, ...divergentRetry }),
        ))._tag,
      ).toBe("Failure")
      const observed = Array.from(yield* Fiber.join(subscriber))
      expect(observed).toHaveLength(1)
      expect(observed[0]?._tag).toBe("ModelResponseCommitted")
      expect(
        (yield* runtime.history({ runId: receipt.runId, limit: 100 })).filter(
          (event) => event._tag === "ModelResponseCommitted",
        ),
      ).toHaveLength(1)
      const projection = yield* sessionProjection(store, "session:model-response-rollback")
      expect(projection.content).toHaveLength(2)
      const projectionJson = yield* Schema.encodeEffect(Schema.UnknownFromJsonString)(projection.content)
      expect(projectionJson).toContain("semantic answer")
    }),
  )
})
