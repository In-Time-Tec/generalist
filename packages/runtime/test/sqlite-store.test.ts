import { Database } from "bun:sqlite"
import { expect, it } from "@effect/vitest"
import { Effect, Exit, Stream } from "effect"
import { Response } from "effect/unstable/ai"
import { Errors, Runtime, RunStore } from "../src/index.js"
import { SCHEMA_META_TABLE, SCHEMA_VERSION, schemaChecksum } from "../src/sql/schema.js"
import { markDirty } from "../src/sql/migrate.js"
import { layer as sqliteClientLayer } from "../src/sql/bun-client.js"
import { assistantAddress, completedResult, openWait, textPrompt } from "./helpers.js"
import { sqliteLayer, tempDbPath } from "./sqlite-helpers.js"

it.live("migrates and reopens a durable sqlite store", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("migrate")
    const first = yield* Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const receipt = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:1",
        idempotencyKey: "k1",
        prompt: textPrompt("hello"),
      })
      const info = yield* store.info
      expect(info).toEqual({ durability: "durable", backend: "sqlite", multiWorker: false })
      expect((yield* runtime.inspect(receipt.runId)).durability).toBe("durable")
      return receipt.runId
    }).pipe(Effect.provide(sqliteLayer(filename)), Effect.scoped)

    const second = yield* Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const inspection = yield* runtime.inspect(first)
      expect(inspection.status).toBe("running")
      const tags = yield* runtime.events({ runId: first, cursor: -1 }).pipe(
        Stream.take(2),
        Stream.runCollect,
        Effect.map((chunk) => [...chunk].map((event) => event._tag)),
      )
      expect(tags).toEqual(["RunAccepted", "RunAttemptStarted"])
    }).pipe(Effect.provide(sqliteLayer(filename)), Effect.scoped)
    void second
  }).pipe(Effect.asVoid),
)

it.live("persists decoded finish parts that omit an undefined response", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("finish-part")
    const runId = yield* Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const receipt = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:finish-part",
        idempotencyKey: "finish-part:1",
        prompt: textPrompt("hello"),
      })
      const claim = yield* store.claimExecution({ runId: receipt.runId, ownerId: "test" })
      const part = {
        "~effect/ai/Content/Part": "~effect/ai/Content/Part",
        metadata: {},
        type: "finish",
        reason: "stop",
        usage: Response.Usage.make({
          inputTokens: { total: 1, uncached: 1, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 1, text: 1, reasoning: undefined },
        }),
      } as unknown as Response.FinishPart
      yield* store.emitAgentEvent({
        ...claim,
        runId: receipt.runId,
        event: {
          _tag: "ModelPart",
          turn: 0,
          modelCallId: "model-call:1",
          modelAttemptId: "model-attempt:1",
          attempt: 0,
          part,
        },
      })
      return receipt.runId
    }).pipe(Effect.provide(sqliteLayer(filename)), Effect.scoped)

    const history = yield* Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      return yield* runtime.history({ runId, cursor: -1, limit: 10 })
    }).pipe(Effect.provide(sqliteLayer(filename)), Effect.scoped)
    const modelPart = history.find((event) => event._tag === "ModelPart")
    expect(modelPart?._tag === "ModelPart" && modelPart.part.type).toBe("finish")
  }).pipe(Effect.asVoid),
)

it.live("rejects dirty schema and checksum mismatch", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("dirty")
    yield* Effect.void.pipe(Effect.provide(sqliteLayer(filename)), Effect.scoped)
    yield* markDirty(filename).pipe(Effect.provide(sqliteClientLayer({ filename })), Effect.scoped)
    const dirty = yield* Effect.exit(Effect.void.pipe(Effect.provide(sqliteLayer(filename)), Effect.scoped))
    expect(Exit.isFailure(dirty)).toBe(true)

    const checksumFile = tempDbPath("checksum")
    yield* Effect.void.pipe(Effect.provide(sqliteLayer(checksumFile)), Effect.scoped)
    const db = new Database(checksumFile)
    db.run(`UPDATE ${SCHEMA_META_TABLE} SET checksum = 'deadbeef' WHERE id = 1`)
    db.close()
    const mismatch = yield* Effect.exit(Effect.void.pipe(Effect.provide(sqliteLayer(checksumFile)), Effect.scoped))
    expect(Exit.isFailure(mismatch)).toBe(true)
  }).pipe(Effect.asVoid),
)

it.live("rejects unsupported forward schema versions", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("forward")
    yield* Effect.void.pipe(Effect.provide(sqliteLayer(filename)), Effect.scoped)
    const db = new Database(filename)
    db.run(`UPDATE ${SCHEMA_META_TABLE} SET version = ${SCHEMA_VERSION + 5} WHERE id = 1`)
    db.close()
    const failed = yield* Effect.exit(Effect.void.pipe(Effect.provide(sqliteLayer(filename)), Effect.scoped))
    expect(Exit.isFailure(failed)).toBe(true)
  }).pipe(Effect.asVoid),
)

it.live("rejects multi-worker configuration", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("workers")
    const failed = yield* Effect.exit(
      Effect.void.pipe(
        Effect.provide(
          Runtime.layerSqlite({
            filename,
            multiWorker: true,
            agents: [],
            addresses: [],
          }),
        ),
        Effect.scoped,
      ),
    )
    expect(Exit.isFailure(failed)).toBe(true)
  }).pipe(Effect.asVoid),
)

it.live("exact duplicate admission and changed-payload conflict", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("idem")
    yield* Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const first = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:1",
        idempotencyKey: "same",
        prompt: textPrompt("one"),
      })
      const dup = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:1",
        idempotencyKey: "same",
        prompt: textPrompt("one"),
      })
      expect(dup.duplicate).toBe(true)
      expect(dup.runId).toBe(first.runId)
      const conflict = yield* runtime
        .send({
          to: assistantAddress,
          sessionId: "session:1",
          idempotencyKey: "same",
          prompt: textPrompt("two"),
        })
        .pipe(Effect.flip)
      expect(conflict).toBeInstanceOf(Errors.IdempotencyConflict)
    }).pipe(Effect.provide(sqliteLayer(filename)), Effect.scoped)
  }).pipe(Effect.asVoid),
)

it.live("persists caller RunId, wait resolution, and finite inspection reads across reopen", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("protocol-foundation")
    yield* Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const receipt = yield* runtime.send({
        runId: "run:sqlite:caller",
        to: assistantAddress,
        sessionId: "session:sqlite:caller",
        idempotencyKey: "sqlite:caller",
        prompt: textPrompt("wait"),
      })
      expect(receipt.runId).toBe("run:sqlite:caller")
      yield* store.wait({
        ...(yield* store.claimExecution({ runId: receipt.runId, ownerId: "test" })),
        runId: receipt.runId,
        wait: openWait("wait:sqlite"),
      })
      yield* runtime.respond({
        runId: receipt.runId,
        waitId: "wait:sqlite",
        resolution: { _tag: "ToolResult", result: "yes", encodedResult: "yes" },
      })
    }).pipe(Effect.provide(sqliteLayer(filename)), Effect.scoped)

    yield* Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const inspection = yield* runtime.inspect("run:sqlite:caller")
      expect(inspection.wait?.resolution).toEqual({ _tag: "ToolResult", result: "yes", encodedResult: "yes" })
      expect((yield* runtime.snapshot("run:sqlite:caller")).cursor).toBe(inspection.lastSequence)
      expect((yield* runtime.history({ runId: "run:sqlite:caller", limit: 1 })).length).toBe(1)
      expect((yield* runtime.list({ limit: 10 })).map((run) => run.runId)).toContain("run:sqlite:caller")
      const conflict = yield* runtime
        .send({
          runId: "run:sqlite:caller",
          to: assistantAddress,
          sessionId: "session:sqlite:caller",
          idempotencyKey: "different",
          prompt: textPrompt("different"),
        })
        .pipe(Effect.flip)
      expect(conflict).toBeInstanceOf(Errors.RunIdConflict)
    }).pipe(Effect.provide(sqliteLayer(filename)), Effect.scoped)
  }).pipe(Effect.asVoid),
)

it.live("fifo blocks successors until head terminals", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("fifo")
    yield* Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const driver = yield* RunStore.RunStore
      const head = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:fifo",
        idempotencyKey: "a",
        prompt: textPrompt("a"),
      })
      const blocked = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:fifo",
        idempotencyKey: "b",
        prompt: textPrompt("b"),
      })
      expect((yield* runtime.inspect(head.runId)).status).toBe("running")
      expect((yield* runtime.inspect(blocked.runId)).status).toBe("queued")
      yield* driver.complete({
        ...(yield* driver.claimExecution({ runId: head.runId, ownerId: "test" })),
        runId: head.runId,
        result: completedResult("done"),
      })
      expect((yield* runtime.inspect(blocked.runId)).status).toBe("running")
    }).pipe(Effect.provide(sqliteLayer(filename)), Effect.scoped)
  }).pipe(Effect.asVoid),
)

it.live("response signal and cancel bypass the lane", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("control")
    yield* Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const driver = yield* RunStore.RunStore
      const waiting = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:control",
        idempotencyKey: "wait",
        prompt: textPrompt("wait"),
      })
      const successor = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:control",
        idempotencyKey: "next",
        prompt: textPrompt("next"),
      })
      yield* driver.wait({
        ...(yield* driver.claimExecution({ runId: waiting.runId, ownerId: "test" })),
        runId: waiting.runId,
        wait: openWait("approval", "approval"),
      })
      expect((yield* runtime.inspect(successor.runId)).status).toBe("queued")
      yield* runtime.respond({ runId: waiting.runId, waitId: "approval", resolution: { _tag: "Approved" } })
      expect((yield* runtime.inspect(waiting.runId)).status).toBe("running")
      yield* driver.wait({
        ...(yield* driver.claimExecution({ runId: waiting.runId, ownerId: "test" })),
        runId: waiting.runId,
        wait: openWait("signal-me", "signal"),
      })
      yield* runtime.signal({ runId: waiting.runId, name: "signal-me" })
      expect((yield* runtime.inspect(waiting.runId)).status).toBe("running")
      yield* runtime.cancel({ runId: waiting.runId, reason: "stop" })
      expect((yield* runtime.inspect(waiting.runId)).status).toBe("cancelled")
      expect((yield* runtime.inspect(successor.runId)).status).toBe("running")
    }).pipe(Effect.provide(sqliteLayer(filename)), Effect.scoped)
  }).pipe(Effect.asVoid),
)

it.live("attempt fencing is monotonic across promote", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("fence")
    yield* Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const driver = yield* RunStore.RunStore
      const first = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:fence",
        idempotencyKey: "a",
        prompt: textPrompt("a"),
      })
      const second = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:fence",
        idempotencyKey: "b",
        prompt: textPrompt("b"),
      })
      const firstEvents = yield* runtime.events({ runId: first.runId }).pipe(
        Stream.take(2),
        Stream.runCollect,
        Effect.map((chunk) => [...chunk]),
      )
      const started = firstEvents.find((event) => event._tag === "RunAttemptStarted")
      expect(started && started._tag === "RunAttemptStarted" ? started.attempt : 0).toBe(1)
      yield* driver.complete({
        ...(yield* driver.claimExecution({ runId: first.runId, ownerId: "test" })),
        runId: first.runId,
        result: completedResult("done"),
      })
      const secondEvents = yield* runtime.events({ runId: second.runId }).pipe(
        Stream.take(2),
        Stream.runCollect,
        Effect.map((chunk) => [...chunk]),
      )
      const secondStarted = secondEvents.find((event) => event._tag === "RunAttemptStarted")
      expect(secondStarted && secondStarted._tag === "RunAttemptStarted" ? secondStarted.attempt : 0).toBe(1)
    }).pipe(Effect.provide(sqliteLayer(filename)), Effect.scoped)
  }).pipe(Effect.asVoid),
)

it.live("expired non-idempotent running operations become unknown", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("ops")
    yield* Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const driver = yield* RunStore.RunStore
      const receipt = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:ops",
        idempotencyKey: "op",
        prompt: textPrompt("op"),
      })
      const recorded = yield* driver.recordOperation({
        ...(yield* driver.claimExecution({ runId: receipt.runId, ownerId: "test" })),
        runId: receipt.runId,
        operationKey: "tool:counter",
        kind: "tool",
        inputDigest: "digest:1",
        input: { n: 1 },
        replayPolicy: "never",
        attempt: 1,
      })
      const operationClaim = yield* driver.claimExecution({ runId: receipt.runId, ownerId: "test" })
      yield* driver.startOperation({ ...operationClaim, operationId: recorded.operationId })
      const expired = yield* driver.expireRunningOperation({
        ...operationClaim,
        operationId: recorded.operationId,
      })
      expect(expired.outcome).toBe("unknown")
      expect(expired.record.status).toBe("unknown")
      expect((yield* runtime.inspect(receipt.runId)).status).toBe("needs-resolution")
      const pure = yield* driver.recordOperation({
        ...(yield* driver.claimExecution({ runId: receipt.runId, ownerId: "test" })),
        runId: receipt.runId,
        operationKey: "model:pure",
        kind: "model",
        inputDigest: "digest:2",
        input: { prompt: "x" },
        replayPolicy: "pure",
        attempt: 1,
      })
      const retryClaim = yield* driver.claimExecution({ runId: receipt.runId, ownerId: "test" })
      yield* driver.startOperation({ ...retryClaim, operationId: pure.operationId })
      const retried = yield* driver.expireRunningOperation({
        ...retryClaim,
        operationId: pure.operationId,
      })
      expect(retried.outcome).toBe("retried")
      expect(retried.record.status).toBe("requested")
    }).pipe(Effect.provide(sqliteLayer(filename)), Effect.scoped)
  }).pipe(Effect.asVoid),
)

it.live("first terminal wins", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("terminal")
    yield* Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const driver = yield* RunStore.RunStore
      const receipt = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:term",
        idempotencyKey: "t",
        prompt: textPrompt("t"),
      })
      const claim = yield* driver.claimExecution({ runId: receipt.runId, ownerId: "test" })
      yield* driver.complete({ ...claim, result: completedResult("ok") })
      const again = yield* driver.fail({ ...claim, error: { message: "nope" } }).pipe(Effect.flip)
      expect(again).toBeInstanceOf(Errors.RunTerminal)
      expect((yield* runtime.inspect(receipt.runId)).status).toBe("succeeded")
    }).pipe(Effect.provide(sqliteLayer(filename)), Effect.scoped)
  }).pipe(Effect.asVoid),
)

it.live("child link reconciliation and cursor replay after reopen", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("child")
    const parentRunId = yield* Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const driver = yield* RunStore.RunStore
      const parent = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:child",
        idempotencyKey: "parent",
        prompt: textPrompt("parent"),
      })
      const child = yield* runtime.spawn({
        parentRunId: parent.runId,
        invocationId: "inv-1",
        agent: (yield* runtime.inspect(parent.runId)).agent,
        prompt: textPrompt("child"),
      })
      yield* driver.complete({
        ...(yield* driver.claimExecution({ runId: child.runId, ownerId: "test" })),
        runId: child.runId,
        result: completedResult("child-done"),
      })
      const parentTags = yield* runtime.events({ runId: parent.runId }).pipe(
        Stream.take(4),
        Stream.runCollect,
        Effect.map((chunk) => [...chunk].map((event) => event._tag)),
      )
      expect(parentTags).toContain("ChildLinked")
      expect(parentTags).toContain("ChildSettled")
      return parent.runId
    }).pipe(Effect.provide(sqliteLayer(filename)), Effect.scoped)

    yield* Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const tags = yield* runtime.events({ runId: parentRunId, cursor: 0 }).pipe(
        Stream.take(3),
        Stream.runCollect,
        Effect.map((chunk) => [...chunk].map((event) => event._tag)),
      )
      expect(tags.length).toBeGreaterThan(0)
      expect(schemaChecksum().length).toBe(64)
    }).pipe(Effect.provide(sqliteLayer(filename)), Effect.scoped)
  }).pipe(Effect.asVoid),
)

it.live("serializes concurrent sqlite writers on one file", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("concurrent")
    yield* Effect.void.pipe(Effect.provide(sqliteLayer(filename)), Effect.scoped)
    const send = (key: string) =>
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        return yield* runtime.send({
          to: assistantAddress,
          sessionId: "session:concurrent",
          idempotencyKey: key,
          prompt: textPrompt(key),
        })
      }).pipe(Effect.provide(sqliteLayer(filename)), Effect.scoped)

    const results = yield* Effect.all(
      Array.from({ length: 8 }, (_, index) => send(`k${index}`)),
      { concurrency: 8 },
    )
    expect(new Set(results.map((receipt) => receipt.runId)).size).toBe(8)
    expect(results.map((receipt) => receipt.acceptedSequence).toSorted((a, b) => a - b)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7,
    ])
  }).pipe(Effect.asVoid),
)
