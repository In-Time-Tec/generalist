import { Database } from "bun:sqlite"
import { expect, it, layer } from "@effect/vitest"
import { Effect, Fiber, Layer, Option, Ref, Schema, Stream } from "effect"
import { Response } from "effect/unstable/ai"
import { Pins, Session } from "../../../../src/index.js"
import { Runtime, RunStore } from "../../../../src/runtime/index.js"
import { assistantAddress, memoryLayer, textPrompt } from "../fixtures.js"
import { sqliteLayer, tempDbPath } from "../../sql/scenario.js"

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
    const maybeSession = yield* store.claimedSessionStore(claim)
    if (Option.isNone(maybeSession)) return yield* Effect.die("expected Session store")
    const prefix = yield* maybeSession.value.append({
      _tag: "Message",
      message: textPrompt("durable model input").content[0]!,
    })
    return { store, claim, operation, operationKey, sessionParentId: prefix.id }
  })

const sessionPath = (store: RunStore.Interface, sessionId: string) =>
  Effect.gen(function* () {
    const maybeSession = yield* store.sessionReader(sessionId)
    if (Option.isNone(maybeSession)) return yield* Effect.die("expected Session store")
    return yield* maybeSession.value.path()
  })

const sessionProjection = (store: RunStore.Interface, sessionId: string) =>
  sessionPath(store, sessionId).pipe(Effect.map(Session.buildContext))

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

      const checkpoint = { _tag: "Program" as const, version: "1" as const }
      yield* store.commitModelResponse({ ...claim, operationId: operation.operationId, ...exact, checkpoint })
      yield* store.commitModelResponse({ ...claim, operationId: operation.operationId, ...exact, checkpoint })
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
      expect(missing._tag).toBe("tenetkit/runtime/SessionEntryNotFound")
      const corrupt = yield* Effect.flip(runtime.resolveModelResponse({ ...responses[0], digest: "corrupt" }))
      expect(corrupt._tag).toBe("tenetkit/runtime/SessionEntryCorrupt")
      const projection = Session.buildContext(path)
      expect(projection.content).toHaveLength(2)
    }),
  )
})

const scopedWith =
  <A, E>(layerValue: Layer.Layer<A, E, never>) =>
  <B, E2, R2 extends A>(effect: Effect.Effect<B, E2, R2>): Effect.Effect<B, E | E2> =>
    Effect.scoped(Effect.flatMap(Layer.build(layerValue), (context) => effect.pipe(Effect.provideContext(context))))

it.live("rolls back every SQLite model transition statement boundary", () => {
  const filename = tempDbPath("model-response-boundaries")
  const quote = (value: string) => value.replaceAll("'", "''")
  return scopedWith(sqliteLayer(filename))(
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const checkpoints = [
        {
          name: "before_session_append",
          trigger: (runId: string, sessionId: string) => `
            CREATE TRIGGER fail_before_session_append
            BEFORE INSERT ON tenetkit_session_entries
            WHEN NEW.session_id = '${quote(sessionId)}' AND NEW.tag = 'ModelResponse'
            BEGIN SELECT RAISE(ABORT, 'before session append'); END
          `,
        },
        {
          name: "after_session_before_operation",
          trigger: (runId: string) => `
            CREATE TRIGGER fail_after_session_before_operation
            BEFORE UPDATE ON tenetkit_run_operations
            WHEN NEW.run_id = '${quote(runId)}' AND NEW.status = 'succeeded'
            BEGIN SELECT RAISE(ABORT, 'after session before operation'); END
          `,
        },
        {
          name: "after_operation_before_checkpoint",
          trigger: (runId: string) => `
            CREATE TRIGGER fail_after_operation_before_checkpoint
            BEFORE UPDATE ON tenetkit_runs
            WHEN NEW.run_id = '${quote(runId)}' AND EXISTS (
              SELECT 1 FROM tenetkit_run_operations
              WHERE run_id = NEW.run_id AND status = 'succeeded'
            )
            BEGIN SELECT RAISE(ABORT, 'after operation before checkpoint'); END
          `,
        },
        {
          name: "after_checkpoint_before_event",
          trigger: (runId: string) => `
            CREATE TRIGGER fail_after_checkpoint_before_event
            BEFORE INSERT ON tenetkit_run_events
            WHEN NEW.run_id = '${quote(runId)}' AND NEW.event_json LIKE '%"_tag":"ModelResponseCommitted"%'
            BEGIN SELECT RAISE(ABORT, 'after checkpoint before event'); END
          `,
        },
        {
          name: "after_event_before_commit",
          trigger: (runId: string) => `
            CREATE TRIGGER fail_after_event_before_commit
            BEFORE UPDATE ON tenetkit_tree_roots
            WHEN EXISTS (
              SELECT 1 FROM tenetkit_run_events
              WHERE run_id = '${quote(runId)}'
                AND event_json LIKE '%"_tag":"ModelResponseCommitted"%'
            )
            BEGIN SELECT RAISE(ABORT, 'after event before commit'); END
          `,
        },
      ] as const

      for (const boundary of checkpoints) {
        const sessionId = `session:model-boundary:${boundary.name}`
        const receipt = yield* runtime.send({
          to: assistantAddress,
          sessionId,
          idempotencyKey: `model-boundary:${boundary.name}`,
          prompt: textPrompt("answer"),
        })
        const { store, claim, operation, operationKey, sessionParentId } = yield* schedule(receipt.runId)
        const exact = completion(operationKey, sessionParentId)
        const checkpoint = { _tag: "Program" as const, version: "1" as const }
        const beforeHistory = yield* runtime.history({ runId: receipt.runId, limit: 100 })
        const beforeExecution = yield* store.loadExecution(receipt.runId)
        const database = new Database(filename)
        database.run(boundary.trigger(receipt.runId, sessionId))

        const failed = yield* Effect.exit(
          store.commitModelResponse({ ...claim, operationId: operation.operationId, ...exact, checkpoint }),
        )
        expect(failed._tag, boundary.name).toBe("Failure")
        expect(yield* runtime.history({ runId: receipt.runId, limit: 100 }), boundary.name).toEqual(beforeHistory)
        expect(
          (yield* store.getOperation({ runId: receipt.runId, operationId: operation.operationId })).status,
          boundary.name,
        ).toBe("running")
        expect((yield* sessionProjection(store, sessionId)).content, boundary.name).toHaveLength(1)
        expect((yield* store.loadExecution(receipt.runId)).checkpoint, boundary.name).toEqual(
          beforeExecution.checkpoint,
        )

        database.run(`DROP TRIGGER fail_${boundary.name}`)
        database.close()
        yield* store.commitModelResponse({ ...claim, operationId: operation.operationId, ...exact, checkpoint })
        expect((yield* sessionProjection(store, sessionId)).content, boundary.name).toHaveLength(2)
        expect((yield* store.loadExecution(receipt.runId)).checkpoint, boundary.name).toEqual(checkpoint)
        expect(
          (yield* runtime.history({ runId: receipt.runId, limit: 100 })).filter(
            (event) => event._tag === "ModelResponseCommitted",
          ),
          boundary.name,
        ).toHaveLength(1)
      }
    }),
  )
})

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
      database.run(`
        CREATE TRIGGER fail_model_completion_after_event
        BEFORE UPDATE ON tenetkit_tree_roots
        WHEN EXISTS (
          SELECT 1 FROM tenetkit_run_events
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

      database.run("DROP TRIGGER fail_model_completion_after_event")
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
      const committed = (yield* runtime.history({ runId: receipt.runId, limit: 100 })).filter(
        (event) => event._tag === "ModelResponseCommitted",
      )
      expect(committed).toHaveLength(1)
      expect(committed[0]).not.toHaveProperty("response")
      if (committed[0]?._tag !== "ModelResponseCommitted") return
      expect(yield* runtime.resolveModelResponse(committed[0])).toEqual(exact.event.response)
      expect(
        yield* runtime.sessionEntry({
          sessionId: committed[0].sessionId,
          entryId: committed[0].sessionEntryId,
        }),
      ).toMatchObject({ _tag: "ModelResponse", id: committed[0].sessionEntryId })
      const databaseAfter = new Database(filename)
      const operationRow = databaseAfter
        .query<
          { result_json: string },
          [string, string]
        >("SELECT result_json FROM tenetkit_run_operations WHERE run_id = ? AND operation_id = ?")
        .get(receipt.runId, operation.operationId)
      const eventRows = databaseAfter
        .query<
          { event_json: string },
          [string]
        >("SELECT event_json FROM tenetkit_run_events WHERE run_id = ? AND event_json LIKE '%ModelResponseCommitted%'")
        .all(receipt.runId)
      databaseAfter.close()
      expect(operationRow?.result_json).not.toContain("semantic answer")
      expect(operationRow?.result_json).not.toContain('"content"')
      expect(eventRows).toHaveLength(1)
      expect(eventRows[0]?.event_json).not.toContain("semantic answer")
      expect(eventRows[0]?.event_json).not.toContain('"response"')
      const path = yield* sessionPath(store, "session:model-response-rollback")
      expect(path.filter((entry) => entry._tag === "ModelResponse")).toHaveLength(1)
      expect(jsonText(path)).toContain("semantic answer")
      expect(Session.buildContext(path).content).toHaveLength(2)
    }),
  )
})

it.live("rejects mutated completed model response references and Session storage", () => {
  const filename = tempDbPath("model-response-hydration-corruption")
  return scopedWith(sqliteLayer(filename))(
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
            _tag: "tenetkit/runtime/SessionEntryCorrupt",
            sessionId: candidate.sessionId,
            entryId: candidate.sessionEntryId,
          })
        })

      for (const candidate of [
        { ...event, runId: "corrupt-run" },
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
        _tag: "tenetkit/runtime/SessionEntryNotFound",
        sessionId: "corrupt-session",
        entryId: event.sessionEntryId,
      })

      const database = new Database(filename)
      const row = database
        .query<
          { session_id: string; entry_id: string; parent_id: string | null; tag: string; payload_json: string },
          [string, string]
        >("SELECT session_id, entry_id, parent_id, tag, payload_json FROM tenetkit_session_entries WHERE session_id = ? AND entry_id = ?")
        .get(event.sessionId, event.sessionEntryId)
      if (row === null) return yield* Effect.die("expected persisted completed Session entry")

      database
        .query("UPDATE tenetkit_session_entries SET entry_id = ? WHERE session_id = ? AND entry_id = ?")
        .run("corrupt-entry", row.session_id, row.entry_id)
      const missingIdentity = yield* runtime.resolveModelResponse(event).pipe(Effect.flip)
      expect(missingIdentity).toMatchObject({
        _tag: "tenetkit/runtime/SessionEntryNotFound",
        sessionId: event.sessionId,
        entryId: event.sessionEntryId,
      })
      database
        .query("UPDATE tenetkit_session_entries SET entry_id = ? WHERE session_id = ? AND entry_id = ?")
        .run(row.entry_id, row.session_id, "corrupt-entry")

      database
        .query("UPDATE tenetkit_session_entries SET parent_id = NULL WHERE session_id = ? AND entry_id = ?")
        .run(row.session_id, row.entry_id)
      yield* assertCorrupt(event)
      database
        .query("UPDATE tenetkit_session_entries SET parent_id = ? WHERE session_id = ? AND entry_id = ?")
        .run(row.parent_id, row.session_id, row.entry_id)

      database
        .query("UPDATE tenetkit_session_entries SET tag = ? WHERE session_id = ? AND entry_id = ?")
        .run("Message", row.session_id, row.entry_id)
      yield* assertCorrupt(event)
      database
        .query("UPDATE tenetkit_session_entries SET tag = ? WHERE session_id = ? AND entry_id = ?")
        .run(row.tag, row.session_id, row.entry_id)

      const payload = yield* Schema.decodeEffect(Schema.fromJsonString(Session.EntryPayload))(row.payload_json)
      if (payload._tag !== "ModelResponse") return yield* Effect.die("expected ModelResponse session payload")
      for (const mutated of [
        { ...payload, metadata: { ...payload.metadata, modelResponseDigest: "corrupt-digest" } },
        { ...payload, _tag: "Message" },
        { ...payload, content: [{ type: "text", text: "corrupt content" }] },
      ]) {
        database
          .query("UPDATE tenetkit_session_entries SET payload_json = ? WHERE session_id = ? AND entry_id = ?")
          .run(jsonText(mutated), row.session_id, row.entry_id)
        yield* assertCorrupt(event)
        database
          .query("UPDATE tenetkit_session_entries SET payload_json = ? WHERE session_id = ? AND entry_id = ?")
          .run(row.payload_json, row.session_id, row.entry_id)
      }
      database.close()
      expect(yield* runtime.resolveModelResponse(event)).toEqual(exact.event.response)
    }),
  )
})
