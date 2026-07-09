import { describe, expect, it } from "@effect/vitest"
import { Cause, Effect, Exit, Schedule, Schema, Stream } from "effect"
import { AiError, LanguageModel, Response } from "effect/unstable/ai"
import { ModelResilience } from "../src/index"

const transientError = AiError.make({
  module: "TestLanguageModel",
  method: "streamText",
  reason: new AiError.RateLimitError({}),
})

const terminalError = AiError.make({
  module: "TestLanguageModel",
  method: "streamText",
  reason: new AiError.UnknownError({ description: "terminal model failure" }),
})

const textPart = (text: string) => Response.makePart("text", { text })

const textDelta = (delta: string) => Response.makePart("text-delta", { id: "text", delta })

const languageModel = (overrides: Partial<LanguageModel.Service>): LanguageModel.Service =>
  ({
    generateText: () => Effect.succeed(new LanguageModel.GenerateTextResponse([])),
    generateObject: () => Effect.succeed(new LanguageModel.GenerateObjectResponse({}, [])),
    streamText: () => Stream.empty,
    ...overrides,
  }) as LanguageModel.Service

const retryOnce = ModelResilience.make({
  retrySchedule: Schedule.recurs(1),
  classify: (error) => (error === transientError ? "transient" : "terminal"),
})

describe("ModelResilience", () => {
  it("classifies retryable AiErrors as transient by default", () => {
    expect(ModelResilience.defaultClassify(transientError)).toBe("transient")
    expect(ModelResilience.defaultClassify(terminalError)).toBe("terminal")
    expect(ModelResilience.defaultClassify(new Error("plain"))).toBe("terminal")
  })

  it.effect("none does not retry non-streaming calls", () => {
    let calls = 0
    const wrapped = ModelResilience.apply(
      languageModel({
        generateText: () => {
          calls += 1
          return Effect.fail(transientError)
        },
      }),
      ModelResilience.none,
    )
    return Effect.gen(function* () {
      const failure = yield* Effect.flip(wrapped.generateText({ prompt: "no retry" }))

      expect(calls).toBe(1)
      expect(failure).toBe(transientError)
    })
  })

  it.effect("retries transient generateText failures", () => {
    let calls = 0
    const wrapped = ModelResilience.apply(
      languageModel({
        generateText: () => {
          calls += 1
          return calls === 1
            ? Effect.fail(transientError)
            : Effect.succeed(new LanguageModel.GenerateTextResponse([textPart("ok")]))
        },
      }),
      retryOnce,
    )
    return Effect.gen(function* () {
      const response = yield* wrapped.generateText({ prompt: "retry text" })

      expect(calls).toBe(2)
      expect(response.text).toBe("ok")
    })
  })

  it.effect("does not retry terminal generateText failures", () => {
    let calls = 0
    const wrapped = ModelResilience.apply(
      languageModel({
        generateText: () => {
          calls += 1
          return Effect.fail(terminalError)
        },
      }),
      retryOnce,
    )
    return Effect.gen(function* () {
      const failure = yield* Effect.flip(wrapped.generateText({ prompt: "terminal" }))

      expect(calls).toBe(1)
      expect(failure).toBe(terminalError)
    })
  })

  it.effect("retries transient generateObject failures", () => {
    let calls = 0
    const wrapped = ModelResilience.apply(
      languageModel({
        generateObject: (() => {
          calls += 1
          return calls === 1
            ? Effect.fail(transientError)
            : Effect.succeed(new LanguageModel.GenerateObjectResponse({ ok: true }, [textPart('{"ok":true}')]))
        }) as unknown as LanguageModel.Service["generateObject"],
      }),
      retryOnce,
    )
    return Effect.gen(function* () {
      const response = yield* wrapped.generateObject({
        prompt: "retry object",
        schema: Schema.Struct({ ok: Schema.Boolean }),
      })

      expect(calls).toBe(2)
      expect(response.value).toEqual({ ok: true })
    })
  })

  it.effect("retries streamText failures before any part is emitted", () => {
    let calls = 0
    const wrapped = ModelResilience.apply(
      languageModel({
        streamText: () => {
          calls += 1
          return calls === 1 ? Stream.fail(transientError) : Stream.make(textDelta("ok"))
        },
      }),
      retryOnce,
    )
    return Effect.gen(function* () {
      const parts = yield* Stream.runCollect(wrapped.streamText({ prompt: "retry stream" }))

      expect(calls).toBe(2)
      expect(parts.map((part) => part.type)).toEqual(["text-delta"])
    })
  })

  it.effect("keeps terminal streamText failures before any part on the error channel", () => {
    let calls = 0
    let classifications = 0
    const wrapped = ModelResilience.apply(
      languageModel({
        streamText: () => {
          calls += 1
          return Stream.fail(terminalError)
        },
      }),
      ModelResilience.make({
        retrySchedule: Schedule.recurs(3),
        classify: () => {
          classifications += 1
          return "terminal"
        },
      }),
    )
    return Effect.gen(function* () {
      const failure = yield* Effect.flip(Stream.runCollect(wrapped.streamText({ prompt: "terminal stream" })))

      expect(calls).toBe(1)
      expect(classifications).toBe(1)
      expect(failure).toBe(terminalError)
    })
  })

  it.effect("fails streamText with the original error when transient retries are exhausted", () => {
    let calls = 0
    const wrapped = ModelResilience.apply(
      languageModel({
        streamText: () => {
          calls += 1
          return Stream.fail(transientError)
        },
      }),
      retryOnce,
    )
    return Effect.gen(function* () {
      const failure = yield* Effect.flip(Stream.runCollect(wrapped.streamText({ prompt: "exhaust retries" })))

      expect(calls).toBe(2)
      expect(failure).toBe(transientError)
    })
  })

  it.effect("does not retry streamText failures after a part is emitted", () => {
    let calls = 0
    const wrapped = ModelResilience.apply(
      languageModel({
        streamText: () => {
          calls += 1
          return Stream.make(textDelta("partial")).pipe(Stream.concat(Stream.fail(transientError)))
        },
      }),
      ModelResilience.make({ retrySchedule: Schedule.recurs(3), classify: () => "transient" }),
    )
    return Effect.gen(function* () {
      const parts = yield* Stream.runCollect(wrapped.streamText({ prompt: "partial stream" }))

      expect(calls).toBe(1)
      expect(parts.map((part) => part.type)).toEqual(["text-delta", "error"])
      const errorPart = parts[1]
      if (errorPart?.type === "error") expect(errorPart.error).toBe(transientError)
    })
  })

  it.effect("propagates mid-stream interrupts instead of squashing them into an error part", () => {
    let calls = 0
    const wrapped = ModelResilience.apply(
      languageModel({
        streamText: () => {
          calls += 1
          return Stream.make(textDelta("partial")).pipe(Stream.concat(Stream.failCause(Cause.interrupt())))
        },
      }),
      ModelResilience.make({ retrySchedule: Schedule.recurs(3), classify: () => "transient" }),
    )
    return Effect.gen(function* () {
      const exit = yield* Effect.exit(Stream.runCollect(wrapped.streamText({ prompt: "interrupted stream" })))

      expect(calls).toBe(1)
      expect(Exit.isFailure(exit)).toBe(true)
      expect(Exit.isFailure(exit) && Cause.hasInterrupts(exit.cause)).toBe(true)
    })
  })

  it.effect("does not classify or retry in-band error parts", () => {
    let calls = 0
    let classifications = 0
    const wrapped = ModelResilience.apply(
      languageModel({
        streamText: () => {
          calls += 1
          return Stream.make(Response.makePart("error", { error: transientError }))
        },
      }),
      ModelResilience.make({
        retrySchedule: Schedule.recurs(3),
        classify: () => {
          classifications += 1
          return "transient"
        },
      }),
    )
    return Effect.gen(function* () {
      const parts = yield* Stream.runCollect(wrapped.streamText({ prompt: "in band error" }))

      expect(calls).toBe(1)
      expect(classifications).toBe(0)
      expect(parts.map((part) => part.type)).toEqual(["error"])
    })
  })
})
