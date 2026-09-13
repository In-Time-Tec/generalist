import { expect, it, layer } from "@effect/vitest"
import { Effect, Layer, Option, Schema, Stream } from "effect"
import { Response } from "effect/unstable/ai"
import { Pins, Session } from "../../../../src/index.js"
import * as Runtime from "../../../../src/runtime/engine.js"
import { RunStore, type Service as RunStoreService } from "../../../../src/runtime/run/store.js"
import { assistantAddress, objectLayer, textPrompt } from "../fixtures.js"
import { objectWorkerId } from "../object.js"

const jsonValue = <Value>(value: Value): Schema.Json =>
  Schema.decodeSync(Schema.fromJsonString(Schema.Json))(Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))(value))
const jsonText = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))

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
    replayFromHistory: false,
    content: Schema.encodeSync(Schema.Array(Response.TextPart))(response.content),
    finishReason: "stop" as const,
    budgetCharge: 0,
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
      budgetCharge: 0,
      digest,
    },
  }
}

const schedule = (runId: string) =>
  Effect.gen(function* () {
    const store = yield* RunStore
    const claim = yield* store.claimExecution({
      commandId: "runtime-execution-model-response-commit-test-ts-claim-1",
      runId,
      ownerId: objectWorkerId,
    })
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
    yield* store.startOperation({
      commandId: "runtime-execution-model-response-commit-test-ts-startOperation-1",
      ...claim,
      operationId: operation.operationId,
    })
    const maybeSession = yield* store.claimedSessionStore(claim)
    if (Option.isNone(maybeSession)) return yield* Effect.die("expected Session store")
    const prefix = yield* maybeSession.value.append(
      {
        _tag: "Message",
        message: textPrompt("durable model input").content[0]!,
      },
      { commandId: "model-response-input" },
    )
    return { store, claim, operation, operationKey, sessionParentId: prefix.id }
  })

const sessionPath = (store: RunStoreService, sessionId: string) =>
  Effect.gen(function* () {
    const maybeSession = yield* store.sessionReader(sessionId)
    if (Option.isNone(maybeSession)) return yield* Effect.die("expected Session store")
    return yield* maybeSession.value.path()
  })

const sessionProjection = (store: RunStoreService, sessionId: string) =>
  sessionPath(store, sessionId).pipe(Effect.map(Session.buildContext))

layer(objectLayer)("atomic model response memory commit", (suite) => {
  suite.effect("rejects a divergent outbox and appends one exact event across retries", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      yield* runtime.createSession({ id: "session:model-commit-memory" })
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
      const beforeModelCommit = yield* runtime.sessionSnapshot("session:model-commit-memory")

      const checkpoint = { _tag: "Program" as const, version: "1" as const }
      yield* store.commitModelResponse({ ...claim, operationId: operation.operationId, ...exact, checkpoint })
      yield* store.commitModelResponse({ ...claim, operationId: operation.operationId, ...exact, checkpoint })
      const committedSnapshot = yield* runtime.sessionSnapshot("session:model-commit-memory")
      expect(committedSnapshot.runs[0]?.status).toBe("running")
      expect(committedSnapshot.conversation.entries).toHaveLength(2)
      const committedUpdates = yield* runtime
        .sessionEvents({ sessionId: "session:model-commit-memory", cursor: beforeModelCommit.cursor })
        .pipe(
          Stream.takeUntil((entry) => entry.cursor === committedSnapshot.cursor),
          Stream.runCollect,
        )
      expect(committedUpdates.filter((entry) => entry._tag === "Conversation")).toHaveLength(1)
      expect(
        committedUpdates.filter((entry) => entry._tag === "Run" && entry.event._tag === "ModelResponseCommitted"),
      ).toHaveLength(1)
      expect(
        committedUpdates.filter((entry) => entry._tag === "Conversation").flatMap((entry) => entry.update.entries),
      ).toEqual(committedSnapshot.conversation.entries.slice(1))
      const divergentCheckpoint = yield* Effect.exit(
        store.commitModelResponse({ ...claim, operationId: operation.operationId, ...exact }),
      )
      expect(divergentCheckpoint._tag).toBe("Failure")
      expect((yield* store.loadExecution(receipt.runId)).checkpoint).toEqual(checkpoint)
      const divergentRetry = completion(operationKey, sessionParentId, "divergent retry")
      expect(
        (yield* Effect.exit(
          store.commitModelResponse({
            ...claim,
            operationId: operation.operationId,
            ...divergentRetry,
            checkpoint,
          }),
        ))._tag,
      ).toBe("Failure")
      const responses = (yield* runtime.history({ runId: receipt.runId, limit: 100 })).filter(
        (event) => event._tag === "ModelResponseCommitted",
      )
      expect(responses).toHaveLength(1)
      expect(responses[0]).toMatchObject({
        digest: exact.event.digest,
        sessionId: "session:model-commit-memory",
        sessionParentId,
      })
      expect(responses[0]).not.toHaveProperty("response")
      if (responses[0]?._tag !== "ModelResponseCommitted") return
      expect(yield* runtime.resolveModelResponse(responses[0])).toEqual(exact.event.response)
      const persisted = yield* store.getOperation({ runId: receipt.runId, operationId: operation.operationId })
      expect(jsonText(persisted.result)).not.toContain("semantic answer")
      expect(persisted.result).not.toHaveProperty("content")
      const path = yield* sessionPath(store, "session:model-commit-memory")
      const entries = path.filter((entry) => entry._tag === "ModelResponse")
      expect(entries).toHaveLength(1)
      expect(entries[0]).toMatchObject({ id: responses[0].sessionEntryId, parentId: sessionParentId })
      expect(jsonText(entries[0])).toContain("semantic answer")
      const publicEntry = yield* runtime.sessionEntry({
        sessionId: responses[0].sessionId,
        entryId: responses[0].sessionEntryId,
      })
      expect(publicEntry).toEqual(entries[0])
      expect(Object.isFrozen(publicEntry)).toBe(true)
      const missing = yield* Effect.flip(
        runtime.sessionEntry({ sessionId: responses[0].sessionId, entryId: "missing:model-response" }),
      )
      expect(missing._tag).toBe("generalist/runtime/SessionEntryNotFound")
      const corrupt = yield* Effect.flip(runtime.resolveModelResponse({ ...responses[0], digest: "corrupt" }))
      expect(corrupt._tag).toBe("generalist/runtime/SessionEntryCorrupt")
      const projection = Session.buildContext(path)
      expect(projection.content).toHaveLength(2)
    }),
  )
})

const scopedWith =
  <A, E>(layerValue: Layer.Layer<A, E, never>) =>
  <B, E2, R2 extends A>(effect: Effect.Effect<B, E2, R2>): Effect.Effect<B, E | E2> =>
    Effect.scoped(Effect.flatMap(Layer.build(layerValue), (context) => effect.pipe(Effect.provideContext(context))))

it.live("rejects mutated completed model response references and Session storage", () =>
  scopedWith(objectLayer)(
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const receipt = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:model-response-hydration-corruption",
        idempotencyKey: "model-response-hydration-corruption",
        prompt: textPrompt("answer"),
      })
      const { store, claim, operation, operationKey, sessionParentId } = yield* schedule(receipt.runId)
      const exact = completion(operationKey, sessionParentId)
      yield* store.commitModelResponse({ ...claim, operationId: operation.operationId, ...exact })
      const event = (yield* runtime.history({ runId: receipt.runId, limit: 100 })).find(
        (candidate) => candidate._tag === "ModelResponseCommitted",
      )
      if (event?._tag !== "ModelResponseCommitted") return yield* Effect.die("expected committed response event")

      const assertCorrupt = (candidate: typeof event) =>
        Effect.gen(function* () {
          const error = yield* runtime.resolveModelResponse(candidate).pipe(Effect.flip)
          expect(error).toMatchObject({
            _tag: "generalist/runtime/SessionEntryCorrupt",
            sessionId: candidate.sessionId,
            entryId: candidate.sessionEntryId,
          })
        })

      for (const candidate of [
        { ...event, originRunId: "corrupt-run" },
        { ...event, operationKey: "corrupt-operation" },
        { ...event, sessionEntryId: "corrupt-entry" },
        { ...event, turn: event.turn + 1 },
        { ...event, modelCallId: "corrupt-model-call" },
        { ...event, modelAttemptId: "corrupt-model-attempt" },
        { ...event, attempt: event.attempt + 1 },
        { ...event, sessionParentId: null },
        { ...event, digest: "corrupt-digest" },
      ]) {
        yield* assertCorrupt(candidate)
      }
      const wrongSession = yield* runtime
        .resolveModelResponse({ ...event, sessionId: "corrupt-session" })
        .pipe(Effect.flip)
      expect(wrongSession).toMatchObject({
        _tag: "generalist/runtime/SessionEntryNotFound",
        sessionId: "corrupt-session",
        entryId: event.sessionEntryId,
      })
      expect(yield* runtime.resolveModelResponse(event)).toEqual(exact.event.response)
    }),
  ),
)
