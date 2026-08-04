import { expect, layer } from "@effect/vitest"
import { Effect } from "effect"
import { Errors, Runtime } from "../src/index.js"
import { assistantAddress, memoryLayer, textPrompt } from "./helpers.js"

layer(memoryLayer)("Runtime idempotency", (it) => {
  it.effect("returns the same receipt for an exact duplicate", () =>
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
      expect(second.runId).toBe(first.runId)
      expect(second.messageId).toBe(first.messageId)
      expect(second.acceptedSequence).toBe(first.acceptedSequence)
      expect(second.duplicate).toBe(true)
    }),
  )

  it.effect("conflicts when the payload changes under one key", () =>
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
      if (error instanceof Errors.IdempotencyConflict) {
        expect(error.existingRunId).toBe(first.runId)
      }
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
      expect(replay.duplicate).toBe(true)
      const keyConflict = yield* runtime
        .send({
          runId: "run:caller:2",
          to: assistantAddress,
          sessionId: "session:caller-id",
          idempotencyKey: "first",
          prompt: textPrompt("hello"),
        })
        .pipe(Effect.flip)
      expect(keyConflict).toBeInstanceOf(Errors.RunIdConflict)
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
