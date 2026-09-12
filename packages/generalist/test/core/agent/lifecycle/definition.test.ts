import { describe, expect, it } from "@effect/vitest"
import { Context, Deferred, Effect, Fiber, Layer, Ref, Schema, Stream } from "effect"
import { LanguageModel, Response } from "effect/unstable/ai"
import { Agent } from "generalist"

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? (<Value>() => Value extends Right ? 1 : 2) extends <Value>() => Value extends Left ? 1 : 2
      ? true
      : false
    : false
type Assert<Value extends true> = Value
type EffectError<Value> = Value extends Effect.Effect<unknown, infer Error, unknown> ? Error : never
type EffectRequirements<Value> =
  Value extends Effect.Effect<unknown, unknown, infer Requirements> ? Requirements : never
type IsAssignable<Source, Target> = Source extends Target ? true : false

class Credentials extends Context.Service<Credentials, { readonly profile: string }>()(
  "generalist/test/core/agent/lifecycle/definition.test/Credentials",
) {}

class ModelLayerError extends Schema.TaggedError<ModelLayerError>()(
  "generalist/test/core/agent/lifecycle/definition.test/ModelLayerError",
  { model: Schema.String },
) {}

class InputEncoding extends Context.Service<InputEncoding, { readonly encode: (value: string) => string }>()(
  "generalist/test/core/agent/lifecycle/definition.test/InputEncoding",
) {}

class OutputDecoding extends Context.Service<OutputDecoding, { readonly decode: (value: string) => string }>()(
  "generalist/test/core/agent/lifecycle/definition.test/OutputDecoding",
) {}

class OutputEncoding extends Context.Service<OutputEncoding, { readonly encode: (value: string) => string }>()(
  "generalist/test/core/agent/lifecycle/definition.test/OutputEncoding",
) {}

type InputCodec = Schema.Codec<string, string, never, InputEncoding>
type OutputCodec = Schema.Codec<string, string, OutputDecoding, OutputEncoding>

const defaultAgent = Agent.make({ name: "fallible-closure" })

const modelService = LanguageModel.make({
  generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
  streamText: () => Stream.make(Response.makePart("text-delta", { id: "unused", delta: "unused" })),
})

const declarationEnvironment: Layer.Layer<LanguageModel.LanguageModel, ModelLayerError, Credentials> = Layer.effect(
  LanguageModel.LanguageModel,
  Credentials.pipe(Effect.andThen(Effect.fail(ModelLayerError.make({ model: "declaration" })))),
)

const uncurriedClosed = Agent.close(defaultAgent, declarationEnvironment)
const curriedClosed = Agent.close(declarationEnvironment)(defaultAgent)
const uncurriedOpened = uncurriedClosed.open((_agent, environment) => Effect.scoped(Layer.build(environment)))
const curriedOpened = curriedClosed.open((_agent, environment) => Effect.scoped(Layer.build(environment)))

const customClosureTypes = (
  agent: Agent.Agent<
    Record<never, never>,
    LanguageModel.LanguageModel,
    LanguageModel.LanguageModel,
    LanguageModel.LanguageModel,
    InputCodec,
    OutputCodec
  >,
  environment: Layer.Layer<
    LanguageModel.LanguageModel | InputEncoding | OutputDecoding | OutputEncoding,
    ModelLayerError,
    Credentials
  >,
) => Agent.close(agent, environment)

const customCurriedClosureTypes = (
  agent: Agent.Agent<
    Record<never, never>,
    LanguageModel.LanguageModel,
    LanguageModel.LanguageModel,
    LanguageModel.LanguageModel,
    InputCodec,
    OutputCodec
  >,
  environment: Layer.Layer<
    LanguageModel.LanguageModel | InputEncoding | OutputDecoding | OutputEncoding,
    ModelLayerError,
    Credentials
  >,
) => Agent.close(environment)(agent)

const missingEnvironment = Agent.close(Layer.empty)

const declarationProofs: ReadonlyArray<true> = [
  true satisfies Assert<Equal<EffectError<typeof uncurriedOpened>, ModelLayerError>>,
  true satisfies Assert<Equal<EffectRequirements<typeof uncurriedOpened>, Credentials>>,
  true satisfies Assert<Equal<EffectError<typeof curriedOpened>, ModelLayerError>>,
  true satisfies Assert<Equal<EffectRequirements<typeof curriedOpened>, Credentials>>,
  true satisfies Assert<Equal<ReturnType<typeof customClosureTypes>, Agent.Closed<ModelLayerError, Credentials>>>,
  true satisfies Assert<
    Equal<ReturnType<typeof customCurriedClosureTypes>, Agent.Closed<ModelLayerError, Credentials>>
  >,
  true satisfies Assert<Equal<IsAssignable<typeof uncurriedClosed, Agent.Closed<never, never>>, false>>,
  true satisfies Assert<Equal<IsAssignable<typeof defaultAgent, Parameters<typeof missingEnvironment>[0]>, false>>,
]

describe("Agent.close", () => {
  it("preserves fallible Layer declarations", () => {
    expect(declarationProofs.every(Boolean)).toBe(true)
  })

  it.effect("stays lazy and preserves a tagged acquisition failure with cleanup", () =>
    Effect.gen(function* () {
      const acquired = yield* Ref.make(0)
      const released = yield* Ref.make(0)
      const failure = ModelLayerError.make({ model: "failing" })
      const environment = Layer.effect(
        LanguageModel.LanguageModel,
        Effect.gen(function* () {
          yield* Credentials
          yield* Effect.acquireRelease(
            Ref.update(acquired, (count) => count + 1),
            () => Ref.update(released, (count) => count + 1),
          )
          return yield* failure
        }),
      )
      const closed = Agent.close(defaultAgent, environment)

      expect(yield* Ref.get(acquired)).toBe(0)
      const observed = yield* closed
        .open((_agent, layer) => Effect.scoped(Layer.build(layer)))
        .pipe(Effect.provideService(Credentials, { profile: "test" }), Effect.flip)
      expect(observed).toBe(failure)
      expect(yield* Ref.get(acquired)).toBe(1)
      expect(yield* Ref.get(released)).toBe(1)
    }),
  )

  it.effect("finalizes a partially acquired Layer when opening is interrupted", () =>
    Effect.gen(function* () {
      const acquired = yield* Deferred.make<void>()
      const released = yield* Deferred.make<void>()
      const environment = Layer.effect(
        LanguageModel.LanguageModel,
        Effect.acquireRelease(Deferred.succeed(acquired, undefined).pipe(Effect.andThen(modelService)), () =>
          Deferred.succeed(released, undefined),
        ).pipe(Effect.andThen(Effect.never)),
      )
      const closed = Agent.close(defaultAgent, environment)
      const fiber = yield* closed
        .open((_agent, layer) => Effect.scoped(Layer.build(layer)))
        .pipe(Effect.forkChild({ startImmediately: true }))

      yield* Deferred.await(acquired)
      yield* Fiber.interrupt(fiber)
      expect(yield* Deferred.isDone(released)).toBe(true)
    }),
  )
})
