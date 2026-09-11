import { expect, layer } from "@effect/vitest"
import { Effect } from "effect"
import { Errors, Runtime } from "../../../src/runtime/index.js"
import { assistantAddress, objectLayer, textPrompt } from "../execution/fixtures.js"

layer(objectLayer)("Runtime idempotency", (it) => {
  it.effect("returns the original receipt for an exact duplicate", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const first = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:1",
        idempotencyKey: "same",
        prompt: textPrompt("hello"),
      })
      const second = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:1",
        idempotencyKey: "same",
        prompt: textPrompt("hello"),
      })
      expect(second).toEqual(first)
    }),
  )

  it.effect("rejects changed input under one command identity", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const first = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:1",
        idempotencyKey: "same",
        prompt: textPrompt("hello"),
      })
      const error = yield* runtime
        .send({
          to: assistantAddress,
          sessionId: "session:1",
          idempotencyKey: "same",
          prompt: textPrompt("changed"),
        })
        .pipe(Effect.flip)
      expect(error).toBeInstanceOf(Errors.IdempotencyConflict)
      expect(error).toMatchObject({
        address: assistantAddress,
        sessionId: "session:1",
        idempotencyKey: "same",
        existingRunId: first.runId,
      })
      expect(
        (yield* runtime.history({ runId: first.runId, cursor: -1, limit: 20 })).filter(
          (event) => event._tag === "RunAccepted",
        ),
      ).toHaveLength(1)
    }),
  )

  it.effect("scopes idempotency keys per address and session", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const a = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:a",
        idempotencyKey: "shared",
        prompt: textPrompt("hello"),
      })
      const b = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:b",
        idempotencyKey: "shared",
        prompt: textPrompt("hello"),
      })
      expect(a.runId).not.toBe(b.runId)
    }),
  )

  it.effect("enforces a caller-supplied RunId across replay and conflicting admission", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const first = yield* runtime.send({
        runId: "run:caller:1",
        to: assistantAddress,
        sessionId: "session:caller-id",
        idempotencyKey: "first",
        prompt: textPrompt("hello"),
      })
      expect(first.runId).toBe("run:caller:1")
      const replay = yield* runtime.send({
        runId: "run:caller:1",
        to: assistantAddress,
        sessionId: "session:caller-id",
        idempotencyKey: "first",
        prompt: textPrompt("hello"),
      })
      expect(replay).toEqual(first)
      const keyConflict = yield* runtime
        .send({
          runId: "run:caller:2",
          to: assistantAddress,
          sessionId: "session:caller-id",
          idempotencyKey: "first",
          prompt: textPrompt("hello"),
        })
        .pipe(Effect.flip)
      expect(keyConflict).toBeInstanceOf(Errors.IdempotencyConflict)
      expect(keyConflict).toMatchObject({
        address: assistantAddress,
        sessionId: "session:caller-id",
        idempotencyKey: "first",
        existingRunId: first.runId,
      })
      const idConflict = yield* runtime
        .send({
          runId: "run:caller:1",
          to: assistantAddress,
          sessionId: "session:caller-id",
          idempotencyKey: "second",
          prompt: textPrompt("other"),
        })
        .pipe(Effect.flip)
      expect(idConflict).toBeInstanceOf(Errors.RunIdConflict)
    }),
  )
})
