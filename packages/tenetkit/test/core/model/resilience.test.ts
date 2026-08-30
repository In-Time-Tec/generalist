import "./suites/agent-default-resilience-suite.js"
import { describe, expect, it } from "@effect/vitest"
import { Cause, Effect, Exit, Function, Layer, Schedule, Schema, Stream } from "effect"
import { AiError, LanguageModel, Response, Tool } from "effect/unstable/ai"
import { ModelResilience, ModelStreamTermination } from "../../../src/index"

const transientError = AiError.make({
  module: "TestLanguageModel",
  method: "streamText",
  reason: AiError.RateLimitError.make({}),
})

const terminalError = AiError.make({
  module: "TestLanguageModel",
  method: "streamText",
  reason: AiError.UnknownError.make({ description: "terminal model failure" }),
})

function extractTransientError<Options>(options: Options): LanguageModel.ExtractError<Options>
function extractTransientError(_options: LanguageModel.GenerateTextOptions<Record<string, Tool.Any>>): AiError.AiError {
  return transientError
}

const textPart = (text: string) => Response.makePart("text", { text })

const textDelta = (delta: string) => Response.makePart("text-delta", { id: "text", delta })

const responseMetadata = (id: string) =>
  Response.makePart("response-metadata", { id, modelId: "m", timestamp: undefined, request: undefined })

const makeResilience = (input?: Partial<ModelResilience.Service>): ModelResilience.Service =>
  Effect.runSync(ModelResilience.make(input))

const languageModel = (overrides: Partial<LanguageModel.Service>): LanguageModel.Service => ({
  generateText: () => Effect.succeed(new LanguageModel.GenerateTextResponse([])),
  generateObject: () => Effect.succeed(new LanguageModel.GenerateObjectResponse({}, [])),
  streamText: () => Stream.empty,
  ...overrides,
})

const retryOnce = makeResilience({
  retrySchedule: Schedule.recurs(1),
  classify: (error) => (error === transientError ? "transient" : "terminal"),
})

describe("ModelResilience", () => {
  it("classifies retryable AiErrors as transient by default", () => {
    expect(ModelResilience.defaultClassify(transientError)).toBe("transient")
    expect(ModelResilience.defaultClassify(terminalError)).toBe("terminal")
    expect(ModelResilience.defaultClassify(new Error("plain"))).toBe("terminal")
  })

  const invalidCorrectionLimits = [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, 3]

  it.effect.each(invalidCorrectionLimits)("make rejects invalid correction limit %s with a typed failure", (limit) =>
    Effect.gen(function* () {
      const failure = yield* ModelResilience.make({ invalidToolCallCorrectionLimit: limit }).pipe(Effect.flip)

      expect(Schema.is(ModelResilience.ModelResilienceMisconfigured)(failure)).toBe(true)
      expect(failure.reason).toBe("invalid-tool-call-correction-limit")
    }).pipe(Effect.orDie),
  )

  it.effect("layer and layerTest fail typed for invalid correction limits", () =>
    Effect.gen(function* () {
      const fromOptions = yield* Layer.build(
        ModelResilience.layer({ invalidToolCallCorrectionLimit: Number.NaN }),
      ).pipe(Effect.scoped, Effect.flip)
      const implementation = { ...ModelResilience.none, invalidToolCallCorrectionLimit: 3 }
      const fromInterface = yield* Layer.build(ModelResilience.layerTest(implementation)).pipe(
        Effect.scoped,
        Effect.flip,
      )

      expect(Schema.is(ModelResilience.ModelResilienceMisconfigured)(fromOptions)).toBe(true)
      expect(Schema.is(ModelResilience.ModelResilienceMisconfigured)(fromInterface)).toBe(true)
    }).pipe(Effect.orDie),
  )

  it.effect("defensively rejects a direct Service before provider invocation", () => {
    let calls = 0
    const implementation = {
      ...ModelResilience.none,
      invalidToolCallCorrectionLimit: Number.POSITIVE_INFINITY,
    }
    const wrapped = ModelResilience.apply(
      languageModel({
        streamText: () => {
          calls += 1
          return Stream.empty
        },
      }),
      implementation,
    )
    return Effect.gen(function* () {
      const failure = yield* Stream.runDrain(wrapped.streamText({ prompt: "must not run" })).pipe(Effect.flip)

      expect(Schema.is(ModelResilience.ModelResilienceMisconfigured)(failure)).toBe(true)
      expect(calls).toBe(0)
    })
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

  it.effect("retries transient generateText provider errors", () => {
    let calls = 0
    const wrapped = ModelResilience.apply(
      languageModel({
        generateText: () => {
          calls += 1
          return calls === 1
            ? Effect.fail(transientError)
            : Effect.succeed(new LanguageModel.GenerateTextResponse([textPart("recovered")]))
        },
      }),
      retryOnce,
    )
    return Effect.gen(function* () {
      const response = yield* wrapped.generateText({ prompt: "retry error response" })

      expect(calls).toBe(2)
      expect(response.text).toBe("recovered")
    })
  })

  it.effect("preserves and does not classify a mixed generateText Cause", () => {
    const cause = Cause.combine(Cause.fail(transientError), Cause.die(new Error("model defect")))
    let calls = 0
    let classifications = 0
    const wrapped = ModelResilience.apply(
      languageModel({
        generateText: () => {
          calls += 1
          return Effect.failCause(cause)
        },
      }),
      makeResilience({
        retrySchedule: Schedule.recurs(3),
        classify: () => {
          classifications += 1
          return "transient"
        },
      }),
    )
    return Effect.gen(function* () {
      const exit = yield* Effect.exit(wrapped.generateText({ prompt: "compound text" }))

      expect(calls).toBe(1)
      expect(classifications).toBe(0)
      expect(exit).toEqual(Exit.failCause(cause))
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
    const generateObject = <
      ObjectEncoded extends Record<string, Schema.Json>,
      StructuredOutputSchema extends Schema.Encoder<ObjectEncoded, unknown>,
      Options extends LanguageModel.GenerateObjectOptions<Tools, StructuredOutputSchema>,
      Tools extends Record<string, Tool.Any> = Record<string, never>,
    >(
      options: Options,
    ): Effect.Effect<
      LanguageModel.GenerateObjectResponse<Tools, StructuredOutputSchema["Type"]>,
      LanguageModel.ExtractError<Options>,
      LanguageModel.ExtractServices<Options> | StructuredOutputSchema["DecodingServices"]
    > => {
      calls += 1
      return Schema.decodeUnknownEffect(options.schema)({ ok: true }).pipe(
        Effect.orDie,
        Effect.flatMap((value) =>
          calls === 1
            ? Effect.fail(extractTransientError(options))
            : Effect.succeed(new LanguageModel.GenerateObjectResponse(value, [textPart('{"ok":true}')])),
        ),
      )
    }
    const wrapped = ModelResilience.apply(
      languageModel({
        generateObject,
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

  it.effect("retries transient generateObject provider errors", () => {
    let calls = 0
    const generateObject: LanguageModel.Service["generateObject"] = (options) => {
      calls += 1
      return Schema.decodeUnknownEffect(options.schema)({ ok: true }).pipe(
        Effect.orDie,
        Effect.flatMap((value) =>
          calls === 1
            ? Effect.fail(extractTransientError(options))
            : Effect.succeed(new LanguageModel.GenerateObjectResponse(value, [textPart('{"ok":true}')])),
        ),
      )
    }
    const wrapped = ModelResilience.apply(
      languageModel({
        generateObject,
      }),
      retryOnce,
    )
    return Effect.gen(function* () {
      const response = yield* wrapped.generateObject({
        prompt: "retry object error response",
        schema: Schema.Struct({ ok: Schema.Boolean }),
      })

      expect(calls).toBe(2)
      expect(response.value).toEqual({ ok: true })
    })
  })

  it.effect("preserves and does not classify a mixed generateObject Cause", () => {
    const cause = Cause.combine(Cause.fail(transientError), Cause.die(new Error("model defect")))
    let calls = 0
    let classifications = 0
    const generateObject = <
      ObjectEncoded extends Record<string, Schema.Json>,
      StructuredOutputSchema extends Schema.Encoder<ObjectEncoded, unknown>,
      Options extends LanguageModel.GenerateObjectOptions<Tools, StructuredOutputSchema>,
      Tools extends Record<string, Tool.Any> = Record<string, never>,
    >(
      _options: Options,
    ): Effect.Effect<
      LanguageModel.GenerateObjectResponse<Tools, StructuredOutputSchema["Type"]>,
      LanguageModel.ExtractError<Options>,
      LanguageModel.ExtractServices<Options> | StructuredOutputSchema["DecodingServices"]
    > => {
      calls += 1
      return Effect.failCause(
        Cause.combine(Cause.fail(extractTransientError(_options)), Cause.die(new Error("model defect"))),
      )
    }
    const wrapped = ModelResilience.apply(
      languageModel({
        generateObject,
      }),
      makeResilience({
        retrySchedule: Schedule.recurs(3),
        classify: () => {
          classifications += 1
          return "transient"
        },
      }),
    )
    return Effect.gen(function* () {
      const exit = yield* Effect.exit(
        wrapped.generateObject({ prompt: "compound object", schema: Schema.Struct({ ok: Schema.Boolean }) }),
      )

      expect(calls).toBe(1)
      expect(classifications).toBe(0)
      expect(exit).toEqual(Exit.failCause(cause))
    })
  })

  it.effect("retries after a lone response-metadata part and drops the discarded attempt's metadata", () => {
    let calls = 0
    const wrapped = ModelResilience.apply(
      languageModel({
        streamText: () => {
          calls += 1
          return calls === 1
            ? Stream.concat(Stream.make(responseMetadata("req-1")), Stream.fail(transientError))
            : Stream.make(textDelta("ok"))
        },
      }),
      retryOnce,
    )
    return Effect.gen(function* () {
      const parts = yield* Stream.runCollect(wrapped.streamText({ prompt: "metadata then fail" }))

      expect(calls).toBe(2)
      expect(parts.map((part) => part.type)).toEqual(["text-delta"])
    })
  })

  it.effect("keeps response metadata ahead of the output of the attempt that produced it", () => {
    const wrapped = ModelResilience.apply(
      languageModel({
        streamText: () => Stream.make(responseMetadata("req-1"), textDelta("ok"), responseMetadata("req-1-trailer")),
      }),
      retryOnce,
    )
    return Effect.gen(function* () {
      const parts = yield* Stream.runCollect(wrapped.streamText({ prompt: "metadata then text" }))

      expect(parts.map((part) => part.type)).toEqual(["response-metadata", "text-delta", "response-metadata"])
    })
  })

  it.effect("bounds retries when every attempt emits an unreplayable part before failing", () => {
    let calls = 0
    const wrapped = ModelResilience.apply(
      languageModel({
        streamText: () => {
          calls += 1
          return Stream.concat(Stream.make(responseMetadata(`req-${calls}`)), Stream.fail(transientError))
        },
      }),
      retryOnce,
    )
    return Effect.gen(function* () {
      const failure = yield* Stream.runDrain(wrapped.streamText({ prompt: "always cut" })).pipe(Effect.flip)

      expect(calls).toBe(2)
      expect(failure).toBe(transientError)
    })
  })

  it.effect("retries a truncation that emitted nothing and gives the retry a fresh attempt", () => {
    let calls = 0
    const wrapped = ModelResilience.apply(
      languageModel({
        streamText: () => {
          calls += 1
          return calls === 1
            ? Stream.make(
                Response.makePart("response-metadata", {
                  id: "req-1",
                  modelId: "m",
                  timestamp: undefined,
                  request: undefined,
                }),
              )
            : Stream.make(textDelta("recovered"))
        },
      }),
      makeResilience({ retrySchedule: Schedule.recurs(1) }),
    )
    const guarded = Stream.suspend(() =>
      ModelStreamTermination.requireTerminal(wrapped.streamText({ prompt: "truncated" }), {
        turn: 0,
        provider: undefined,
        model: undefined,
        toPart: Function.identity,
      }),
    )
    return Effect.gen(function* () {
      const error = yield* Stream.runCollect(guarded).pipe(Effect.flip)

      expect(Schema.is(ModelStreamTermination.ModelStreamTruncated)(error)).toBe(true)
      expect(ModelStreamTermination.isTerminationFailure(error) && error.emitted).toEqual({ _tag: "Nothing" })
      expect(ModelResilience.defaultClassify(error)).toBe("transient")
    })
  })

  it.effect("treats an open tool call as terminal so a retry cannot duplicate the transcript", () =>
    Effect.gen(function* () {
      const openToolCall = yield* Stream.runDrain(
        ModelStreamTermination.requireTerminal(
          Stream.fromIterable([
            Response.makePart("tool-params-start", { id: "call-1", name: "write", providerExecuted: false }),
            Response.makePart("tool-params-delta", { id: "call-1", delta: '{"path":"a.md"' }),
          ]),
          { turn: 0, provider: undefined, model: undefined, toPart: Function.identity },
        ),
      ).pipe(Effect.flip)

      expect(openToolCall.emitted._tag).toBe("OpenToolCall")
      expect(ModelResilience.defaultClassify(openToolCall)).toBe("terminal")
    }),
  )

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
      makeResilience({
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
      makeResilience({ retrySchedule: Schedule.recurs(3), classify: () => "transient" }),
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
    const cause = Cause.interrupt()
    const wrapped = ModelResilience.apply(
      languageModel({
        streamText: () => {
          calls += 1
          return Stream.make(textDelta("partial")).pipe(Stream.concat(Stream.failCause(cause)))
        },
      }),
      makeResilience({ retrySchedule: Schedule.recurs(3), classify: () => "transient" }),
    )
    return Effect.gen(function* () {
      const exit = yield* Effect.exit(Stream.runCollect(wrapped.streamText({ prompt: "interrupted stream" })))

      expect(calls).toBe(1)
      expect(exit).toEqual(Exit.failCause(cause))
    })
  })

  it.effect("preserves a mid-stream defect after an emitted part", () => {
    const defect = new Error("model defect")
    const cause = Cause.die(defect)
    const emitted: Array<string> = []
    const wrapped = ModelResilience.apply(
      languageModel({
        streamText: () => Stream.make(textDelta("partial")).pipe(Stream.concat(Stream.failCause(cause))),
      }),
      makeResilience({ retrySchedule: Schedule.recurs(3), classify: () => "transient" }),
    )
    return Effect.gen(function* () {
      const exit = yield* wrapped.streamText({ prompt: "defective stream" }).pipe(
        Stream.runForEach((part) => Effect.sync(() => emitted.push(part.type))),
        Effect.exit,
      )

      expect(emitted).toEqual(["text-delta"])
      expect(exit).toEqual(Exit.failCause(cause))
    })
  })

  it.effect("preserves a mixed mid-stream Cause after an emitted part", () => {
    const cause = Cause.combine(Cause.fail(transientError), Cause.die(new Error("model defect")))
    const emitted: Array<string> = []
    let calls = 0
    let classifications = 0
    const wrapped = ModelResilience.apply(
      languageModel({
        streamText: () => {
          calls += 1
          return Stream.make(textDelta("partial")).pipe(Stream.concat(Stream.failCause(cause)))
        },
      }),
      makeResilience({
        retrySchedule: Schedule.recurs(3),
        classify: () => {
          classifications += 1
          return "transient"
        },
      }),
    )
    return Effect.gen(function* () {
      const exit = yield* wrapped.streamText({ prompt: "compound stream" }).pipe(
        Stream.runForEach((part) => Effect.sync(() => emitted.push(part.type))),
        Effect.exit,
      )

      expect(emitted).toEqual(["text-delta"])
      expect(calls).toBe(1)
      expect(classifications).toBe(0)
      expect(exit).toEqual(Exit.failCause(cause))
    })
  })

  it.effect("preserves and does not classify a mixed Cause before emission", () => {
    const cause = Cause.combine(Cause.fail(transientError), Cause.die(new Error("model defect")))
    let calls = 0
    let classifications = 0
    const wrapped = ModelResilience.apply(
      languageModel({
        streamText: () => {
          calls += 1
          return Stream.failCause(cause)
        },
      }),
      makeResilience({
        retrySchedule: Schedule.recurs(3),
        classify: () => {
          classifications += 1
          return "transient"
        },
      }),
    )
    return Effect.gen(function* () {
      const exit = yield* Effect.exit(Stream.runCollect(wrapped.streamText({ prompt: "compound stream" })))

      expect(calls).toBe(1)
      expect(classifications).toBe(0)
      expect(exit).toEqual(Exit.failCause(cause))
    })
  })

  it.effect("retries transient in-band error parts before replayable output", () => {
    let calls = 0
    const wrapped = ModelResilience.apply(
      languageModel({
        streamText: () => {
          calls += 1
          return calls === 1
            ? Stream.make(responseMetadata("discarded-request"), Response.makePart("error", { error: transientError }))
            : Stream.make(responseMetadata("recovered-request"), textDelta("recovered"))
        },
      }),
      retryOnce,
    )
    return Effect.gen(function* () {
      const parts = yield* Stream.runCollect(wrapped.streamText({ prompt: "in-band retry" }))

      expect(calls).toBe(2)
      expect(parts.map((part) => part.type)).toEqual(["response-metadata", "text-delta"])
      expect(parts[0]?.type === "response-metadata" && parts[0].id).toBe("recovered-request")
    })
  })

  it.effect("normalizes an unknown in-band error to a terminal AiError", () => {
    let calls = 0
    const wrapped = ModelResilience.apply(
      languageModel({
        streamText: () => {
          calls += 1
          return Stream.make(Response.makePart("error", { error: { code: "provider_specific_terminal" } }))
        },
      }),
      makeResilience({ retrySchedule: Schedule.recurs(3) }),
    )
    return Effect.gen(function* () {
      const failure = yield* Stream.runDrain(wrapped.streamText({ prompt: "unknown in-band error" })).pipe(Effect.flip)

      expect(calls).toBe(1)
      expect(AiError.isAiError(failure) && failure.reason._tag).toBe("UnknownError")
      expect(String(failure)).toContain("provider_specific_terminal")
    })
  })

  it.effect("uses an explicit resolver before classifying a custom in-band error", () => {
    const custom = { code: "custom_transient" }
    let calls = 0
    let resolutions = 0
    const wrapped = ModelResilience.apply(
      languageModel({
        streamText: () => {
          calls += 1
          return calls === 1
            ? Stream.make(Response.makePart("error", { error: custom }))
            : Stream.make(textDelta("resolved"))
        },
      }),
      makeResilience({
        retrySchedule: Schedule.recurs(1),
        resolve: ({ error, method }) => {
          resolutions += 1
          expect(error).toBe(custom)
          expect(method).toBe("streamText")
          return transientError
        },
      }),
    )
    return Effect.gen(function* () {
      const parts = yield* Stream.runCollect(wrapped.streamText({ prompt: "custom in-band error" }))

      expect(calls).toBe(2)
      expect(resolutions).toBe(1)
      expect(parts.map((part) => part.type)).toEqual(["text-delta"])
    })
  })

  it.effect("fails with the original in-band error when transient retries are exhausted", () => {
    let calls = 0
    const wrapped = ModelResilience.apply(
      languageModel({
        streamText: () => {
          calls += 1
          return Stream.make(Response.makePart("error", { error: transientError }))
        },
      }),
      retryOnce,
    )
    return Effect.gen(function* () {
      const failure = yield* Stream.runDrain(wrapped.streamText({ prompt: "in-band exhaustion" })).pipe(Effect.flip)

      expect(calls).toBe(2)
      expect(failure).toBe(transientError)
    })
  })

  it.effect("does not retry an in-band error after replayable output", () => {
    let calls = 0
    const wrapped = ModelResilience.apply(
      languageModel({
        streamText: () => {
          calls += 1
          return Stream.make(textDelta("partial"), Response.makePart("error", { error: transientError }))
        },
      }),
      makeResilience({ retrySchedule: Schedule.recurs(3), classify: () => "transient" }),
    )
    return Effect.gen(function* () {
      const parts = yield* Stream.runCollect(wrapped.streamText({ prompt: "in-band partial" }))

      expect(calls).toBe(1)
      expect(parts.map((part) => part.type)).toEqual(["text-delta", "error"])
      const errorPart = parts[1]
      if (errorPart?.type === "error") expect(errorPart.error).toBe(transientError)
    })
  })

  it.effect("does not retry an in-band error after a tool call starts", () => {
    let calls = 0
    const wrapped = ModelResilience.apply(
      languageModel({
        streamText: () => {
          calls += 1
          return Stream.make(
            Response.makePart("tool-params-start", { id: "call-1", name: "write", providerExecuted: false }),
            Response.makePart("error", { error: transientError }),
          )
        },
      }),
      makeResilience({ retrySchedule: Schedule.recurs(3), classify: () => "transient" }),
    )
    return Effect.gen(function* () {
      const parts = yield* Stream.runCollect(wrapped.streamText({ prompt: "in-band tool failure" }))

      expect(calls).toBe(1)
      expect(parts.map((part) => part.type)).toEqual(["tool-params-start", "error"])
    })
  })
})
