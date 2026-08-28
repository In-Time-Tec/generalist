import { expect, layer } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { Errors, Runtime } from "../../../src/runtime/index.js"
import {
  alternateAssistantRef,
  assistantAddress,
  assistantRef,
  memoryLayer,
  registrationsFor,
  textPrompt,
} from "../execution/fixtures.js"
import { make as makeMessage } from "../../../src/runtime/messaging/message.js"
import { admitSend } from "../../../src/runtime/memory/store/admit.js"
import { emptyState } from "../../../src/runtime/memory/state.js"
import { childDigest, messageDigest } from "../../../src/runtime/memory/digest.js"

layer(memoryLayer)("Runtime idempotency", (it) => {
  it("uses canonical SHA-256 digests without changing root and child identity inputs", () => {
    const first = makeMessage({
      id: "message:first",
      to: assistantAddress,
      sessionId: "session:digest",
      idempotencyKey: "first",
      correlationId: "correlation:digest",
      prompt: textPrompt("digest"),
      metadata: { outer: { second: 2, first: 1 } },
    })
    const replay = makeMessage({
      ...first,
      id: "message:replay",
      idempotencyKey: "replay",
      metadata: { outer: { first: 1, second: 2 } },
    })

    expect(messageDigest(first)).toMatch(/^[a-f0-9]{64}$/)
    expect(messageDigest(replay)).toBe(messageDigest(first))
    expect(childDigest(first, assistantRef.ref)).toMatch(/^[a-f0-9]{64}$/)
    expect(childDigest(first, alternateAssistantRef.ref)).not.toBe(childDigest(first, assistantRef.ref))
    expect(() => messageDigest({ ...first, metadata: { invalid: undefined } })).toThrow(/Expected JSON value/)
  })

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
      if (Schema.is(Errors.IdempotencyConflict)(error)) {
        expect(error.existingRunId).toBe(first.runId)
      }
    }),
  )

  it.effect("conflicts when an exact payload is replayed under changed executable authority", () =>
    Effect.gen(function* () {
      const message = makeMessage({
        id: "message:authority",
        to: assistantAddress,
        sessionId: "session:authority",
        idempotencyKey: "same",
        correlationId: "message:authority",
        prompt: textPrompt("hello"),
      })
      const initial = emptyState({ addressBindings: new Map(), subscriberQueueCapacity: 8 })
      const [, admitted] = yield* admitSend(initial, {
        message,
        executableRef: assistantRef.ref,
        executableManifest: assistantRef.manifest,
        registrations: registrationsFor(assistantRef),
      })
      const conflict = yield* admitSend(admitted, {
        message,
        executableRef: alternateAssistantRef.ref,
        executableManifest: alternateAssistantRef.manifest,
        registrations: registrationsFor(alternateAssistantRef),
      }).pipe(Effect.flip)
      expect(conflict).toBeInstanceOf(Errors.IdempotencyConflict)
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
