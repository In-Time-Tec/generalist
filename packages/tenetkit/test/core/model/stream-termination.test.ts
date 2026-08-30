import { describe, expect, it } from "@effect/vitest"
import { Effect, Exit, Fiber, Function, Schema, Stream } from "effect"
import { TestClock } from "effect/testing"
import { Response } from "effect/unstable/ai"
import { ModelStreamTermination } from "../../../src/index"

const usage = Response.Usage.make({
  inputTokens: { uncached: undefined, total: 4, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 2, text: undefined, reasoning: undefined },
})

const finishPart = Response.makePart("finish", { reason: "stop", usage, response: undefined })

const metadataPart = Response.makePart("response-metadata", {
  id: "req-1",
  modelId: "scripted",
  timestamp: undefined,
  request: undefined,
})

const origin = { turn: 7, provider: "anthropic", model: "claude", toPart: Function.identity }

const guard = <E, R>(self: Stream.Stream<Response.AnyPart, E, R>, idleTimeout?: number) =>
  ModelStreamTermination.requireTerminal(self, idleTimeout === undefined ? origin : { ...origin, idleTimeout })

describe("Stream.onEnd semantics requireTerminal depends on", () => {
  it.effect("runs the end effect only on a clean done signal", () =>
    Effect.gen(function* () {
      let onClean = 0
      yield* Stream.make(1, 2, 3).pipe(Stream.onEnd(Effect.sync(() => void (onClean += 1))), Stream.runDrain)

      let onFailure = 0
      const failed = yield* Stream.make(1).pipe(
        Stream.concat(Stream.fail("boom")),
        Stream.onEnd(Effect.sync(() => void (onFailure += 1))),
        Stream.runDrain,
        Effect.exit,
      )

      expect(onClean).toBe(1)
      expect(onFailure).toBe(0)
      expect(Exit.isFailure(failed)).toBe(true)
    }),
  )

  it.effect("replaces the done signal when the end effect fails, after elements already escaped", () =>
    Effect.gen(function* () {
      const seen: Array<number> = []
      const exit = yield* Stream.make(1, 2, 3).pipe(
        Stream.tap((value) => Effect.sync(() => void seen.push(value))),
        Stream.onEnd(Effect.fail("truncated")),
        Stream.runDrain,
        Effect.exit,
      )

      expect(seen).toEqual([1, 2, 3])
      expect(Exit.isFailure(exit)).toBe(true)
    }),
  )

  it.effect("passes interruption through without running the end effect", () =>
    Effect.gen(function* () {
      let ended = 0
      const fiber = yield* Stream.make(1).pipe(
        Stream.concat(Stream.never),
        Stream.onEnd(Effect.sync(() => void (ended += 1))),
        Stream.runDrain,
        Effect.forkChild,
      )
      yield* TestClock.adjust("1 millis")
      yield* Fiber.interrupt(fiber)

      expect(ended).toBe(0)
    }),
  )
})

describe("ModelStreamTermination.requireTerminal", () => {
  it.effect("passes a stream that ends with a provider finish part through unchanged", () =>
    Effect.gen(function* () {
      const parts = yield* Stream.runCollect(
        guard(
          Stream.fromIterable([metadataPart, Response.makePart("text-delta", { id: "t", delta: "hi" }), finishPart]),
        ),
      )

      expect(parts.map((part) => part.type)).toEqual(["response-metadata", "text-delta", "finish"])
    }),
  )

  it.effect("fails a clean end that never produced a finish part, stamping its origin", () =>
    Effect.gen(function* () {
      const error = yield* Stream.runDrain(
        guard(Stream.fromIterable([metadataPart, Response.makePart("text-delta", { id: "t", delta: "cut" })])),
      ).pipe(Effect.flip)

      expect(Schema.is(ModelStreamTermination.ModelStreamTruncated)(error)).toBe(true)
      expect(error.turn).toBe(7)
      expect(error.provider).toBe("anthropic")
      expect(error.model).toBe("claude")
      expect(error.requestId).toBe("req-1")
      expect(error.lastPart).toBe("text-delta")
      expect(error.emitted).toEqual({ _tag: "DisplayOnly", characters: 3 })
    }),
  )

  it.effect("reports nothing emitted when only response metadata escaped", () =>
    Effect.gen(function* () {
      const error = yield* Stream.runDrain(guard(Stream.make(metadataPart))).pipe(Effect.flip)

      expect(error.emitted).toEqual({ _tag: "Nothing" })
    }),
  )

  it.effect("reports the open tool call when parameters were cut mid-JSON", () =>
    Effect.gen(function* () {
      const error = yield* Stream.runDrain(
        guard(
          Stream.fromIterable([
            metadataPart,
            Response.makePart("tool-params-start", { id: "call-1", name: "write", providerExecuted: false }),
            Response.makePart("tool-params-delta", { id: "call-1", delta: '{"path":"a.md"' }),
          ]),
        ),
      ).pipe(Effect.flip)

      expect(error.emitted).toEqual({
        _tag: "OpenToolCall",
        toolCallId: "call-1",
        toolName: "write",
        characters: '{"path":"a.md"'.length,
      })
    }),
  )

  it.effect("treats a closed tool call as emitted output rather than an open one", () =>
    Effect.gen(function* () {
      const error = yield* Stream.runDrain(
        guard(
          Stream.fromIterable([
            Response.makePart("tool-params-start", { id: "call-1", name: "write", providerExecuted: false }),
            Response.makePart("tool-call", { id: "call-1", name: "write", params: {}, providerExecuted: false }),
          ]),
        ),
      ).pipe(Effect.flip)

      expect(error.emitted._tag).toBe("DisplayOnly")
    }),
  )

  it.effect("fails an explicitly bounded idle stream as timed out, not truncated", () =>
    Effect.gen(function* () {
      const fiber = yield* Stream.runDrain(guard(Stream.make(metadataPart).pipe(Stream.concat(Stream.never)), 10)).pipe(
        Effect.flip,
        Effect.forkChild,
      )
      yield* Effect.yieldNow
      yield* TestClock.adjust("10 millis")
      const error = yield* Fiber.join(fiber)

      expect(Schema.is(ModelStreamTermination.ModelStreamTimeout)(error)).toBe(true)
      expect(Schema.is(ModelStreamTermination.ModelStreamTruncated)(error)).toBe(false)
      expect(error.requestId).toBe("req-1")
      expect(error.emitted).toEqual({ _tag: "Nothing" })
    }),
  )

  it.effect("leaves an upstream failure untouched", () =>
    Effect.gen(function* () {
      const error = yield* Stream.runDrain(
        guard(Stream.make(metadataPart).pipe(Stream.concat(Stream.fail("provider exploded")))),
      ).pipe(Effect.flip)

      expect(error).toBe("provider exploded")
    }),
  )

  it.effect("does not impose a hidden idle deadline", () =>
    Effect.gen(function* () {
      const fiber = yield* Stream.runDrain(guard(Stream.never.pipe(Stream.map((part): Response.AnyPart => part)))).pipe(
        Effect.forkChild,
      )
      yield* Effect.yieldNow
      yield* TestClock.adjust("1 day")

      expect(fiber.pollUnsafe()).toBeUndefined()
      yield* Fiber.interrupt(fiber)
    }),
  )
})
