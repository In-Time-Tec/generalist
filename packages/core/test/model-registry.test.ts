import { describe, expect, it } from "@effect/vitest"
import { Cause, Context, Deferred, Effect, Exit, Fiber, Layer, Ref, Stream } from "effect"
import { LanguageModel, Response } from "effect/unstable/ai"
import { ModelRegistry } from "../src/index"
import { ItLayer } from "./it-layer"

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2 ? true : false
type Assert<Value extends true> = Value

const modelLayerOptions = (delta: string) => ({
  generateText: () => Effect.succeed([{ type: "text" as const, text: delta }]),
  streamText: () => Stream.make(Response.makePart("text-delta", { id: "text", delta })),
})

const modelLayer = (delta: string) =>
  Layer.effect(LanguageModel.LanguageModel, LanguageModel.make(modelLayerOptions(delta)))

describe("ModelRegistry", () => {
  it("infers requirement-free data-first, data-last, and empty registry layers", () => {
    const registration = ModelRegistry.registration({ provider: "test", model: "typed", layer: modelLayer("typed") })
    const dataFirst = ModelRegistry.layer([registration])
    const dataLast = ModelRegistry.layer({})([registration])
    const empty = ModelRegistry.layer()
    const inference: Assert<
      Equal<typeof dataFirst, Layer.Layer<ModelRegistry.ModelRegistry>> &
        Equal<typeof dataLast, Layer.Layer<ModelRegistry.ModelRegistry>> &
        Equal<typeof empty, Layer.Layer<ModelRegistry.ModelRegistry>>
    > = true

    expect(inference).toBe(true)
  })

  ItLayer.make(it, "registers an already-resolved registration value", () => {
    const registrationValue = Effect.runSync(
      ModelRegistry.registration({
        provider: "test",
        model: "resolved",
        layer: modelLayer("resolved output"),
      }),
    )
    return [
      ModelRegistry.layer([Effect.succeed(registrationValue)]),
      ModelRegistry.operate(
        { provider: "test", model: "resolved" },
        LanguageModel.generateText({ prompt: "hello" }),
      ).pipe(Effect.map((response) => expect(response.text).toBe("resolved output"))),
    ] as const
  })

  ItLayer.make(
    it,
    "fails typed when the selected model is not registered",
    () =>
      [
        ModelRegistry.layerMemory(),
        Effect.gen(function* () {
          const failure = yield* Effect.flip(
            ModelRegistry.operate({ provider: "missing", model: "none" }, Effect.succeed("unused")),
          )

          expect(failure._tag).toBe("LanguageModelNotRegistered")
          if (failure._tag === "LanguageModelNotRegistered") {
            expect(failure.provider).toBe("missing")
            expect(failure.model).toBe("none")
          }
        }),
      ] as const,
  )

  ItLayer.make(
    it,
    "fails streams typed when the selected model is not registered",
    () =>
      [
        ModelRegistry.layerMemory(),
        Effect.gen(function* () {
          const failure = yield* Effect.flip(
            ModelRegistry.stream({ provider: "missing", model: "none" }, Stream.make("unused")).pipe(Stream.runDrain),
          )

          expect(failure._tag).toBe("LanguageModelNotRegistered")
        }),
      ] as const,
  )

  ItLayer.make(
    it,
    "provides a registered language model layer",
    () =>
      [
        ModelRegistry.layerMemory(),
        Effect.gen(function* () {
          const registration = yield* ModelRegistry.registration({
            provider: "test",
            model: "deterministic",
            layer: modelLayer("registered output"),
          })
          yield* ModelRegistry.register({ registration })

          const response = yield* ModelRegistry.operate(
            { provider: "test", model: "deterministic" },
            LanguageModel.generateText({ prompt: "hello" }),
          )

          expect(response.text).toBe("registered output")
        }),
      ] as const,
  )

  ItLayer.make(it, "builds a repeatedly selected model layer once for the registry lifetime", () => {
    let builds = 0
    const selection = { provider: "test", model: "memoized" }
    const registered = Layer.effect(
      LanguageModel.LanguageModel,
      Effect.sync(() => {
        builds += 1
      }).pipe(
        Effect.andThen(
          LanguageModel.make({
            generateText: () => Effect.succeed([{ type: "text", text: "memoized" }]),
            streamText: () => Stream.empty,
          }),
        ),
      ),
    )

    return [
      ModelRegistry.layer([ModelRegistry.registration({ ...selection, layer: registered })]),
      Effect.gen(function* () {
        yield* ModelRegistry.operate(selection, LanguageModel.generateText({ prompt: "first" }))
        yield* ModelRegistry.operate(selection, LanguageModel.generateText({ prompt: "second" }))

        expect(builds).toBe(1)
      }),
    ] as const
  })

  it.effect("shares a concurrent first build and releases it once with the registry scope", () =>
    Effect.gen(function* () {
      const acquisitions = yield* Ref.make(0)
      const releases = yield* Ref.make(0)
      const started = yield* Deferred.make<void>()
      const gate = yield* Deferred.make<void>()
      const selection = { provider: "test", model: "concurrent" }
      const registered = Layer.effect(
        LanguageModel.LanguageModel,
        Effect.acquireRelease(
          Ref.updateAndGet(acquisitions, (count) => count + 1).pipe(
            Effect.tap((count) => (count === 1 ? Deferred.succeed(started, undefined) : Effect.void)),
            Effect.andThen(Deferred.await(gate)),
            Effect.andThen(
              LanguageModel.make({
                generateText: () => Effect.succeed([{ type: "text", text: "concurrent" }]),
                streamText: () => Stream.empty,
              }),
            ),
          ),
          () => Ref.update(releases, (count) => count + 1),
        ),
      )
      const registryLayer = ModelRegistry.layer([ModelRegistry.registration({ ...selection, layer: registered })])

      yield* Effect.scoped(
        Effect.gen(function* () {
          const context = yield* Layer.build(registryLayer)
          const registry = Context.get(context, ModelRegistry.ModelRegistry)
          const calls = yield* Effect.all([
            Effect.forkChild(registry.operate(selection, Effect.void)),
            Effect.forkChild(registry.operate(selection, Effect.void)),
          ])
          yield* Deferred.await(started)
          yield* Effect.yieldNow
          expect(yield* Ref.get(acquisitions)).toBe(1)
          yield* Deferred.succeed(gate, undefined)
          yield* Effect.forEach(calls, Fiber.join)
        }),
      )

      expect(yield* Ref.get(releases)).toBe(1)
    }),
  )

  it.effect("keeps a shared first build alive when its first selector is interrupted", () =>
    Effect.gen(function* () {
      const releases = yield* Ref.make(0)
      const started = yield* Deferred.make<void>()
      const gate = yield* Deferred.make<void>()
      const selection = { provider: "test", model: "interrupted-selector" }
      const registered = Layer.effect(
        LanguageModel.LanguageModel,
        Deferred.succeed(started, undefined).pipe(
          Effect.andThen(Deferred.await(gate)),
          Effect.andThen(
            Effect.acquireRelease(LanguageModel.make(modelLayerOptions("recovered")), () =>
              Ref.update(releases, (count) => count + 1),
            ),
          ),
        ),
      )
      const registryLayer = ModelRegistry.layer([ModelRegistry.registration({ ...selection, layer: registered })])

      yield* Effect.scoped(
        Effect.gen(function* () {
          const context = yield* Layer.build(registryLayer)
          const registry = Context.get(context, ModelRegistry.ModelRegistry)
          const first = yield* Effect.forkChild(registry.operate(selection, Effect.void))
          yield* Deferred.await(started)
          yield* Fiber.interrupt(first)

          const second = yield* Effect.forkChild(
            registry.operate(selection, LanguageModel.generateText({ prompt: "recover" })),
          )
          yield* Deferred.succeed(gate, undefined)
          expect((yield* Fiber.join(second)).text).toBe("recovered")
        }),
      )

      expect(yield* Ref.get(releases)).toBe(1)
    }),
  )

  ItLayer.make(
    it,
    "upserts registrations by provider, model, and registrationKey",
    () =>
      [
        ModelRegistry.layerMemory(),
        Effect.gen(function* () {
          const first = yield* ModelRegistry.registration({
            provider: "test",
            model: "deterministic",
            layer: modelLayer("first"),
            metadata: { revision: 1 },
          })
          const second = yield* ModelRegistry.registration({
            provider: "test",
            model: "deterministic",
            layer: modelLayer("second"),
            metadata: { revision: 2 },
          })
          const keyed = yield* ModelRegistry.registration({
            provider: "test",
            model: "deterministic",
            registrationKey: "eu",
            layer: modelLayer("keyed"),
          })

          yield* ModelRegistry.register({ registration: first })
          yield* ModelRegistry.register({ registration: second })
          yield* ModelRegistry.register({ registration: keyed })
          const registrations = yield* ModelRegistry.registrations()

          expect(registrations).toHaveLength(2)
          expect(registrations[0]?.metadata).toEqual({ revision: 2 })
          expect(registrations[1]?.registrationKey).toBe("eu")

          const keyedResponse = yield* ModelRegistry.operate(
            { provider: "test", model: "deterministic", registrationKey: "eu" },
            LanguageModel.generateText({ prompt: "hello" }),
          )
          expect(keyedResponse.text).toBe("keyed")
        }),
      ] as const,
  )

  ItLayer.make(it, "uses a replacement layer after the original selection was memoized", () => {
    let firstBuilds = 0
    let secondBuilds = 0
    const selection = { provider: "test", model: "replaceable" }
    const countedLayer = (value: string, count: () => void) =>
      Layer.effect(
        LanguageModel.LanguageModel,
        Effect.sync(count).pipe(Effect.andThen(LanguageModel.make(modelLayerOptions(value)))),
      )

    return [
      ModelRegistry.layerMemory(),
      Effect.gen(function* () {
        const first = yield* ModelRegistry.registration({
          ...selection,
          layer: countedLayer("first", () => {
            firstBuilds += 1
          }),
        })
        const other = yield* ModelRegistry.registration({
          provider: "test",
          model: "other",
          layer: modelLayer("other"),
        })
        yield* ModelRegistry.register({ registration: first })
        yield* ModelRegistry.register({ registration: other })
        expect((yield* ModelRegistry.operate(selection, LanguageModel.generateText({ prompt: "first" }))).text).toBe(
          "first",
        )

        const second = yield* ModelRegistry.registration({
          ...selection,
          layer: countedLayer("second", () => {
            secondBuilds += 1
          }),
        })
        yield* ModelRegistry.register({ registration: second })
        yield* ModelRegistry.operate(selection, LanguageModel.generateText({ prompt: "second" }))
        const response = yield* ModelRegistry.operate(selection, LanguageModel.generateText({ prompt: "repeat" }))
        const registrations = yield* ModelRegistry.registrations()

        expect(response.text).toBe("second")
        expect([firstBuilds, secondBuilds]).toEqual([1, 1])
        expect(registrations.map((registration) => registration.model)).toEqual(["replaceable", "other"])
      }),
    ] as const
  })

  ItLayer.make(
    it,
    "combine resolves models from every combined registry layer",
    () =>
      [
        ModelRegistry.combine([
          ModelRegistry.layer([
            ModelRegistry.registration({ provider: "prov-a", model: "model-a", layer: modelLayer("from-a") }),
          ]),
          ModelRegistry.layer([
            ModelRegistry.registration({ provider: "prov-b", model: "model-b", layer: modelLayer("from-b") }),
          ]),
        ]),
        Effect.gen(function* () {
          const first = yield* ModelRegistry.operate(
            { provider: "prov-a", model: "model-a" },
            LanguageModel.generateText({ prompt: "hello" }),
          )
          const second = yield* ModelRegistry.operate(
            { provider: "prov-b", model: "model-b" },
            LanguageModel.generateText({ prompt: "hello" }),
          )

          expect(first.text).toBe("from-a")
          expect(second.text).toBe("from-b")
        }),
      ] as const,
  )

  ItLayer.make(it, "keeps failure classification attached to the in-flight registration snapshot", () => {
    const selection = { provider: "test", model: "classified" }
    const failure = new Error("classified failure")
    return [
      ModelRegistry.layer([
        ModelRegistry.registration({
          ...selection,
          layer: modelLayer("first"),
          classifyFailure: () => "context-overflow",
        }),
      ]),
      Effect.gen(function* () {
        const entered = yield* Deferred.make<void>()
        const release = yield* Deferred.make<void>()
        const inFlight = yield* Effect.forkChild(
          ModelRegistry.operate(
            selection,
            Effect.gen(function* () {
              const model = yield* LanguageModel.LanguageModel
              yield* Deferred.succeed(entered, undefined)
              yield* Deferred.await(release)
              return ModelRegistry.classifyFailure(model, failure)
            }),
          ),
        )
        yield* Deferred.await(entered)
        const replacement = yield* ModelRegistry.registration({
          ...selection,
          layer: modelLayer("second"),
          classifyFailure: () => "other",
        })
        yield* ModelRegistry.register({ registration: replacement })
        yield* Deferred.succeed(release, undefined)

        expect(yield* Fiber.join(inFlight)).toBe("context-overflow")
        expect(
          yield* ModelRegistry.operate(
            selection,
            LanguageModel.LanguageModel.pipe(Effect.map((model) => ModelRegistry.classifyFailure(model, failure))),
          ),
        ).toBe("other")
      }),
    ] as const
  })

  ItLayer.make(
    it,
    "combine keeps upsert semantics for identical registrations",
    () =>
      [
        ModelRegistry.combine([
          ModelRegistry.layer([
            ModelRegistry.registration({
              provider: "test",
              model: "deterministic",
              layer: modelLayer("first"),
            }),
          ]),
          ModelRegistry.layer([
            ModelRegistry.registration({
              provider: "test",
              model: "deterministic",
              layer: modelLayer("second"),
            }),
          ]),
        ]),
        Effect.gen(function* () {
          const registrations = yield* ModelRegistry.registrations()
          const response = yield* ModelRegistry.operate(
            { provider: "test", model: "deterministic" },
            LanguageModel.generateText({ prompt: "hello" }),
          )

          expect(registrations).toHaveLength(1)
          expect(response.text).toBe("second")
        }),
      ] as const,
  )

  ItLayer.make(
    it,
    "bounds concurrent provides to maxConcurrentModelCalls",
    () =>
      [
        ModelRegistry.layerMemory([], { maxConcurrentModelCalls: 1 }),
        Effect.gen(function* () {
          const registration = yield* ModelRegistry.registration({
            provider: "test",
            model: "deterministic",
            layer: modelLayer("unused"),
          })
          yield* ModelRegistry.register({ registration })
          const entered = yield* Ref.make(0)
          const firstEntered = yield* Deferred.make<void>()
          const gate = yield* Deferred.make<void>()
          const call = ModelRegistry.operate(
            { provider: "test", model: "deterministic" },
            Ref.updateAndGet(entered, (count) => count + 1).pipe(
              Effect.tap((count) => (count === 1 ? Deferred.succeed(firstEntered, undefined) : Effect.void)),
              Effect.andThen(Deferred.await(gate)),
            ),
          )

          const fibers = yield* Effect.all([Effect.forkChild(call), Effect.forkChild(call), Effect.forkChild(call)])
          yield* Deferred.await(firstEntered)
          yield* Effect.forEach(Array.from({ length: 20 }), () => Effect.yieldNow)
          const concurrent = yield* Ref.get(entered)

          yield* Deferred.succeed(gate, undefined)
          yield* Effect.forEach(fibers, Fiber.join)
          const total = yield* Ref.get(entered)

          expect(concurrent).toBe(1)
          expect(total).toBe(3)
        }),
      ] as const,
  )

  ItLayer.make(it, "keeps the model layer live through complete stream consumption", () => {
    let acquired = 0
    let released = 0
    let pulls = 0
    const selected = { provider: "test", model: "scoped-stream" }
    const layer = Layer.effect(
      LanguageModel.LanguageModel,
      Effect.acquireRelease(
        Effect.gen(function* () {
          acquired += 1
          return yield* LanguageModel.make({
            generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
            streamText: () =>
              Stream.fromEffect(
                Effect.gen(function* () {
                  pulls += 1
                  if (released !== 0) return yield* Effect.die("stream pulled after model layer release")
                  return Response.makePart("text-delta", { id: "text", delta: "live" })
                }),
              ),
          })
        }),
        () =>
          Effect.sync(() => {
            released += 1
          }),
      ),
    )

    return [
      ModelRegistry.layer([ModelRegistry.registration({ ...selected, layer })]),
      Effect.gen(function* () {
        const parts = ModelRegistry.stream(selected, LanguageModel.streamText({ prompt: "hello" }))
        const result = yield* Stream.runCollect(parts)

        expect(result.some((part) => part.type === "text-delta")).toBe(true)
        expect(acquired).toBe(1)
        expect(pulls).toBe(1)
        expect(released).toBe(0)
      }),
    ] as const
  })

  ItLayer.make(it, "holds one governance permit until each selected stream exits", () => {
    const selected = { provider: "test", model: "governed-stream" }
    return [
      ModelRegistry.layer([ModelRegistry.registration({ ...selected, layer: modelLayer("unused") })], {
        maxConcurrentModelCalls: 1,
      }),
      Effect.gen(function* () {
        const entered = yield* Ref.make(0)
        const firstEntered = yield* Deferred.make<void>()
        const gate = yield* Deferred.make<void>()
        const operation = Stream.fromEffect(
          Ref.updateAndGet(entered, (count) => count + 1).pipe(
            Effect.tap((count) => (count === 1 ? Deferred.succeed(firstEntered, undefined) : Effect.void)),
            Effect.andThen(Deferred.await(gate)),
          ),
        )
        const run = ModelRegistry.stream(selected, operation).pipe(Stream.runDrain)

        const fibers = yield* Effect.all([Effect.forkChild(run), Effect.forkChild(run)])
        yield* Deferred.await(firstEntered)
        yield* Effect.forEach(Array.from({ length: 20 }), () => Effect.yieldNow)
        expect(yield* Ref.get(entered)).toBe(1)

        yield* Deferred.succeed(gate, undefined)
        yield* Effect.forEach(fibers, Fiber.join)
        expect(yield* Ref.get(entered)).toBe(2)
      }),
    ] as const
  })

  ItLayer.make(it, "cancels a stream waiting for a governance permit without leaking it", () => {
    const selected = { provider: "test", model: "queued-cancellation" }
    return [
      ModelRegistry.layer([ModelRegistry.registration({ ...selected, layer: modelLayer("unused") })], {
        maxConcurrentModelCalls: 1,
      }),
      Effect.gen(function* () {
        const entered = yield* Ref.make(0)
        const firstEntered = yield* Deferred.make<void>()
        const firstGate = yield* Deferred.make<void>()
        const first = yield* Effect.forkChild(
          ModelRegistry.stream(
            selected,
            Stream.fromEffect(
              Ref.updateAndGet(entered, (count) => count + 1).pipe(
                Effect.tap(() => Deferred.succeed(firstEntered, undefined)),
                Effect.andThen(Deferred.await(firstGate)),
              ),
            ),
          ).pipe(Stream.runDrain),
        )
        yield* Deferred.await(firstEntered)

        const queued = yield* Effect.forkChild(
          ModelRegistry.stream(selected, Stream.fromEffect(Ref.update(entered, (count) => count + 1))).pipe(
            Stream.runDrain,
          ),
        )
        yield* Effect.forEach(Array.from({ length: 20 }), () => Effect.yieldNow)
        const cancelling = yield* Effect.forkChild(Fiber.interrupt(queued))
        yield* Effect.forEach(Array.from({ length: 20 }), () => Effect.yieldNow)
        const cancellation = cancelling.pollUnsafe()
        const enteredWhileQueued = yield* Ref.get(entered)
        expect(cancellation).toBeDefined()
        expect(enteredWhileQueued).toBe(1)

        yield* Deferred.succeed(firstGate, undefined)
        yield* Fiber.join(first)
        yield* ModelRegistry.stream(selected, Stream.fromEffect(Ref.update(entered, (count) => count + 1))).pipe(
          Stream.runDrain,
        )
        const enteredAfterRelease = yield* Ref.get(entered)
        expect(enteredAfterRelease).toBe(2)
      }),
    ] as const
  })

  ItLayer.make(it, "releases stream scope and permit exactly once on short-circuit and interruption", () => {
    let acquired = 0
    let released = 0
    const selected = { provider: "test", model: "early-exit" }
    const layer = Layer.effect(
      LanguageModel.LanguageModel,
      Effect.acquireRelease(
        Effect.gen(function* () {
          acquired += 1
          return yield* LanguageModel.make({
            generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
            streamText: () => Stream.empty,
          })
        }),
        () =>
          Effect.sync(() => {
            released += 1
          }),
      ),
    )

    return [
      ModelRegistry.layer([ModelRegistry.registration({ ...selected, layer })], {
        maxConcurrentModelCalls: 1,
      }),
      Effect.gen(function* () {
        yield* ModelRegistry.stream(selected, Stream.make(1, 2)).pipe(Stream.take(1), Stream.runDrain)

        const started = yield* Deferred.make<void>()
        const interrupted = ModelRegistry.stream(
          selected,
          Stream.fromEffect(Deferred.succeed(started, undefined).pipe(Effect.andThen(Effect.never))),
        ).pipe(Stream.runDrain)
        const fiber = yield* Effect.forkChild(interrupted)
        yield* Deferred.await(started)
        yield* Fiber.interrupt(fiber)

        yield* ModelRegistry.stream(selected, Stream.make(3)).pipe(Stream.runDrain)
        expect(acquired).toBe(1)
        expect(released).toBe(0)
      }),
    ] as const
  })

  ItLayer.make(it, "preserves typed stream failures, defects, and interruption causes", () => {
    let acquired = 0
    let released = 0
    const selected = { provider: "test", model: "failure-causes" }
    const layer = Layer.effect(
      LanguageModel.LanguageModel,
      Effect.acquireRelease(
        Effect.gen(function* () {
          acquired += 1
          return yield* LanguageModel.make({
            generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
            streamText: () => Stream.empty,
          })
        }),
        () =>
          Effect.sync(() => {
            released += 1
          }),
      ),
    )
    return [
      ModelRegistry.layer([ModelRegistry.registration({ ...selected, layer })], {
        maxConcurrentModelCalls: 1,
      }),
      Effect.gen(function* () {
        const typed = yield* Effect.flip(
          ModelRegistry.stream(selected, Stream.fail("model-failure")).pipe(Stream.runDrain),
        )
        expect(typed).toBe("model-failure")
        expect([acquired, released]).toEqual([1, 0])

        const defect = yield* Effect.exit(
          ModelRegistry.stream(selected, Stream.die("model-defect")).pipe(Stream.runDrain),
        )
        expect(Exit.isFailure(defect) && Cause.hasDies(defect.cause)).toBe(true)
        expect([acquired, released]).toEqual([1, 0])

        const started = yield* Deferred.make<void>()
        const fiber = yield* Effect.forkChild(
          ModelRegistry.stream(
            selected,
            Stream.fromEffect(Deferred.succeed(started, undefined).pipe(Effect.andThen(Effect.never))),
          ).pipe(Stream.runDrain),
        )
        yield* Deferred.await(started)
        yield* Fiber.interrupt(fiber)
        const interrupted = yield* Fiber.await(fiber)
        expect(Exit.isFailure(interrupted) && Cause.hasInterrupts(interrupted.cause)).toBe(true)
        expect([acquired, released]).toEqual([1, 0])

        yield* ModelRegistry.stream(selected, Stream.make("after exits")).pipe(Stream.runDrain)
        expect([acquired, released]).toEqual([1, 0])
      }),
    ] as const
  })
})
