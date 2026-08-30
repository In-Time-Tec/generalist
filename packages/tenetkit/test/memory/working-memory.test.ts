import { expect, layer } from "@effect/vitest"
import { Context, Deferred, Effect, Fiber, Layer, Ref, Schema, Stream } from "effect"
import { AiError, LanguageModel, Prompt, Response } from "effect/unstable/ai"
import { Agent, Memory } from "../../src/index.js"
import { expectTypeOf } from "vitest"
import { WorkingMemory } from "../../src/memory/index"

const key: Memory.Key = { agent: "memory-agent", subject: "subject-a" }
const otherKey: Memory.Key = { agent: "memory-agent", subject: "subject-b" }

const finishPart = Response.makePart("finish", {
  reason: "stop",
  usage: Response.Usage.make({
    inputTokens: { uncached: undefined, total: undefined, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: undefined, text: undefined, reasoning: undefined },
  }),
  response: undefined,
})

const textPart = (text: string) => Prompt.makePart("text", { text })
const user = (text: string) => Prompt.makeMessage("user", { content: [textPart(text)] })
const assistant = (text: string) => Prompt.makeMessage("assistant", { content: [textPart(text)] })
const prompt = (...messages: ReadonlyArray<Prompt.Message>) => Prompt.fromMessages(messages)

const itemText = (item: Memory.Item): string =>
  item.content
    .filter((part): part is Prompt.TextPart => part.type === "text")
    .map((part) => part.text)
    .join("")

const promptText = (value: Prompt.Prompt): string =>
  value.content
    .map((message) =>
      Schema.is(Schema.String)(message.content)
        ? message.content
        : message.content
            .filter((part): part is Prompt.TextPart => part.type === "text")
            .map((part) => part.text)
            .join(""),
    )
    .join("")

let summaryCalls = 0
let summaryPrompt: Prompt.Prompt["content"] | undefined
const summaryModel = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: (options) =>
      Effect.sync(() => {
        summaryCalls += 1
        summaryPrompt = options.prompt.content
        return [{ type: "text", text: "summary" }]
      }),
    streamText: () => Stream.empty,
  }),
)

const widenedSummaryOptions: WorkingMemory.Options = { summarize: {} }
expectTypeOf(WorkingMemory.layer(widenedSummaryOptions)).toEqualTypeOf<
  Layer.Layer<Memory.Memory, never, WorkingMemory.SummaryModel>
>()
expectTypeOf(WorkingMemory.make(widenedSummaryOptions)).toEqualTypeOf<
  Effect.Effect<Memory.Service, never, WorkingMemory.SummaryModel>
>()

layer(WorkingMemory.layer({ maxMessages: 2 }))("WorkingMemory", (it) => {
  it.effect("does not recursively remember recalled context while retaining identical authored text", () =>
    Effect.gen(function* () {
      const memory = yield* WorkingMemory.make({ maxMessages: 20 })
      const calls = yield* Ref.make(0)
      const model = yield* LanguageModel.make({
        generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
        streamText: () =>
          Ref.updateAndGet(calls, (count) => count + 1).pipe(
            Stream.fromEffect,
            Stream.flatMap((call) =>
              Stream.fromIterable([
                Response.makePart("text-start", { id: `text-${call}` }),
                Response.makePart("text-delta", { id: `text-${call}`, delta: call === 1 ? "first" : "second" }),
                Response.makePart("text-end", { id: `text-${call}` }),
                finishPart,
              ]),
            ),
          ),
      })
      const agent = Agent.make({ name: key.agent })
      const run = (input: string) =>
        Agent.generate(agent, { prompt: input, memory: { key } }).pipe(
          Effect.provideService(LanguageModel.LanguageModel, model),
          Effect.provideService(Memory.Memory, Memory.Memory.of(memory)),
        )

      yield* run("repeated")
      yield* run("repeated")

      const recalled = yield* memory.recall({ key, turn: 0, prompt: prompt(user("current")) })

      expect(recalled.map(itemText)).toEqual([
        "User: repeated",
        "Assistant: first",
        "User: repeated",
        "Assistant: second",
      ])
    }),
  )

  it.effect("keeps a bounded recent tail", () =>
    Effect.gen(function* () {
      const memory = yield* Memory.Memory

      yield* memory.remember({
        key,
        turn: 0,
        terminal: true,
        transcript: prompt(user("one"), assistant("two"), user("three")),
      })

      const recalled = yield* memory.recall({ key, turn: 0, prompt: prompt(user("current")) })

      expect(recalled.map(itemText)).toEqual(["Assistant: two", "User: three"])
    }),
  )

  it.effect("isolates state by memory key", () =>
    Effect.gen(function* () {
      const memory = yield* Memory.Memory

      yield* memory.remember({
        key,
        turn: 0,
        terminal: true,
        transcript: prompt(user("one"), assistant("two")),
      })

      const recalled = yield* memory.recall({ key: otherKey, turn: 0, prompt: prompt(user("current")) })

      expect(recalled).toEqual([])
    }),
  )

  it.effect("forgets the exact memory key", () =>
    Effect.gen(function* () {
      const memory = yield* Memory.Memory

      yield* memory.remember({
        key,
        turn: 0,
        terminal: true,
        transcript: prompt(user("one"), assistant("two")),
      })
      yield* memory.remember({
        key: otherKey,
        turn: 0,
        terminal: true,
        transcript: prompt(user("three"), assistant("four")),
      })

      yield* memory.forget({ key })

      const forgotten = yield* memory.recall({ key, turn: 0, prompt: prompt(user("current")) })
      const retained = yield* memory.recall({ key: otherKey, turn: 0, prompt: prompt(user("current")) })

      expect(forgotten).toEqual([])
      expect(retained.map(itemText)).toEqual(["User: three", "Assistant: four"])
    }),
  )

  it.effect("forgets one recalled item id within the exact memory key", () =>
    Effect.gen(function* () {
      const memory = yield* Memory.Memory

      yield* memory.remember({
        key,
        turn: 0,
        terminal: true,
        transcript: prompt(user("one"), assistant("two")),
      })
      yield* memory.remember({
        key: otherKey,
        turn: 0,
        terminal: true,
        transcript: prompt(user("three"), assistant("four")),
      })

      yield* memory.forget({ key, id: "working-1" })

      const retained = yield* memory.recall({ key, turn: 0, prompt: prompt(user("current")) })
      const otherRetained = yield* memory.recall({ key: otherKey, turn: 0, prompt: prompt(user("current")) })

      expect(retained.map(itemText)).toEqual(["Assistant: two"])
      expect(otherRetained.map(itemText)).toEqual(["User: three", "Assistant: four"])
    }),
  )
})

layer(
  WorkingMemory.layer({ maxMessages: 2, summarize: {} }).pipe(
    Layer.provide(WorkingMemory.layerSummaryModel),
    Layer.provide(summaryModel),
  ),
)((it) => {
  it.effect("keeps repeated Agent runs bounded and excludes recalled context from summary overflow", () =>
    Effect.gen(function* () {
      summaryCalls = 0
      summaryPrompt = undefined
      const memory = yield* Memory.Memory
      const calls = yield* Ref.make(0)
      const model = yield* LanguageModel.make({
        generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
        streamText: () =>
          Ref.updateAndGet(calls, (count) => count + 1).pipe(
            Stream.fromEffect,
            Stream.flatMap((call) =>
              Stream.fromIterable([
                Response.makePart("text-start", { id: `bounded-${call}` }),
                Response.makePart("text-delta", {
                  id: `bounded-${call}`,
                  delta: call === 1 ? "first" : "second",
                }),
                Response.makePart("text-end", { id: `bounded-${call}` }),
                finishPart,
              ]),
            ),
          ),
      })
      const agent = Agent.make({ name: key.agent })
      const run = Agent.generate(agent, { prompt: "repeated", memory: { key } }).pipe(
        Effect.provideService(LanguageModel.LanguageModel, model),
      )

      yield* run
      yield* run

      const recalled = yield* memory.recall({ key, turn: 0, prompt: prompt(user("current")) })
      const renderedSummaryPrompt = summaryPrompt === undefined ? "" : promptText(Prompt.fromMessages(summaryPrompt))

      expect(summaryCalls).toBe(1)
      expect(renderedSummaryPrompt).toContain("User: repeated")
      expect(renderedSummaryPrompt).toContain("Assistant: first")
      expect(renderedSummaryPrompt).not.toContain("User: User: repeatedAssistant: first")
      expect(recalled.map((item) => item.id)).toEqual(["working-summary", "working-3", "working-4"])
      expect(recalled.map(itemText)).toEqual([
        "<working-memory-summary>\nsummary\n</working-memory-summary>",
        "User: repeated",
        "Assistant: second",
      ])
    }),
  )

  it.effect("summarizes overflow once and recalls summary before the recent tail", () =>
    Effect.gen(function* () {
      summaryCalls = 0
      const memory = yield* Memory.Memory

      yield* memory.remember({
        key,
        turn: 0,
        terminal: true,
        transcript: prompt(user("one"), assistant("two"), user("three"), assistant("four")),
      })

      const recalled = yield* memory.recall({ key, turn: 0, prompt: prompt(user("current")) })

      expect(summaryCalls).toBe(1)
      expect(summaryPrompt?.some((message) => message.content.length > 0)).toBe(true)
      expect(recalled.map(itemText)).toEqual([
        "<working-memory-summary>\nsummary\n</working-memory-summary>",
        "User: three",
        "Assistant: four",
      ])
    }),
  )
})

const modelFailure = AiError.make({
  module: "WorkingMemory",
  method: "generateText",
  reason: AiError.UnknownError.make({ description: "summary failed" }),
})

const rememberOverflow = (memory: Memory.Service, transcript: Prompt.Prompt) =>
  memory.remember({ key, turn: 0, terminal: true, transcript })

layer(Layer.empty)((it) => {
  it.effect("acquires the composed summary model once, reuses it across overflows, and releases it once", () =>
    Effect.gen(function* () {
      const acquisitions = yield* Ref.make(0)
      const releases = yield* Ref.make(0)
      const calls = yield* Ref.make(0)
      const service = yield* LanguageModel.make({
        generateText: () =>
          Ref.updateAndGet(calls, (count) => count + 1).pipe(
            Effect.map((count) => [{ type: "text" as const, text: `summary-${count}` }]),
          ),
        streamText: () => Stream.empty,
      })
      const model = Layer.effect(
        LanguageModel.LanguageModel,
        Effect.acquireRelease(Ref.update(acquisitions, (count) => count + 1).pipe(Effect.as(service)), () =>
          Ref.update(releases, (count) => count + 1),
        ),
      )
      const memoryLayer = WorkingMemory.layer({ maxMessages: 2, summarize: {} }).pipe(
        Layer.provide(WorkingMemory.layerSummaryModel.pipe(Layer.provide(model))),
      )

      yield* Effect.scoped(
        Layer.build(memoryLayer).pipe(
          Effect.flatMap((context) =>
            Effect.gen(function* () {
              const memory = yield* Memory.Memory
              yield* rememberOverflow(memory, prompt(user("one"), assistant("two"), user("three")))
              yield* rememberOverflow(memory, prompt(user("one"), assistant("two"), user("three"), assistant("four")))
            }).pipe(Effect.provide(context)),
          ),
        ),
      )

      expect(yield* Ref.get(acquisitions)).toBe(1)
      expect(yield* Ref.get(calls)).toBe(2)
      expect(yield* Ref.get(releases)).toBe(1)
    }),
  )

  it.effect("releases the composed summary model after a model-call failure", () =>
    Effect.gen(function* () {
      const releases = yield* Ref.make(0)
      const service = yield* LanguageModel.make({
        generateText: () => Effect.fail(modelFailure),
        streamText: () => Stream.empty,
      })
      const model = Layer.effect(
        LanguageModel.LanguageModel,
        Effect.acquireRelease(Effect.succeed(service), () => Ref.update(releases, (count) => count + 1)),
      )
      const memoryLayer = WorkingMemory.layer({ maxMessages: 1, summarize: {} }).pipe(
        Layer.provide(WorkingMemory.layerSummaryModel.pipe(Layer.provide(model))),
      )

      const failure = yield* Effect.flip(
        Effect.scoped(
          Layer.build(memoryLayer).pipe(
            Effect.flatMap((context) =>
              rememberOverflow(Context.get(context, Memory.Memory), prompt(user("one"), assistant("two"))),
            ),
          ),
        ),
      )

      expect(failure._tag).toBe("tenetkit/core/MemoryError")
      expect(yield* Ref.get(releases)).toBe(1)
    }),
  )

  it.effect("keeps summary model acquisition failures visible at the layer boundary", () =>
    Effect.gen(function* () {
      const model = Layer.effect(LanguageModel.LanguageModel, Effect.fail(modelFailure))
      const memoryLayer = WorkingMemory.layer({ maxMessages: 1, summarize: {} }).pipe(
        Layer.provide(WorkingMemory.layerSummaryModel.pipe(Layer.provide(model))),
      )

      const failure = yield* Effect.flip(Effect.scoped(Layer.build(memoryLayer)))

      expect(failure).toBe(modelFailure)
    }),
  )

  it.effect("releases the composed summary model when summary generation is interrupted", () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>()
      const releases = yield* Ref.make(0)
      const service = yield* LanguageModel.make({
        generateText: () => Deferred.succeed(started, undefined).pipe(Effect.andThen(Effect.never)),
        streamText: () => Stream.empty,
      })
      const model = Layer.effect(
        LanguageModel.LanguageModel,
        Effect.acquireRelease(Effect.succeed(service), () => Ref.update(releases, (count) => count + 1)),
      )
      const memoryLayer = WorkingMemory.layer({ maxMessages: 1, summarize: {} }).pipe(
        Layer.provide(WorkingMemory.layerSummaryModel.pipe(Layer.provide(model))),
      )
      const run = Effect.scoped(
        Layer.build(memoryLayer).pipe(
          Effect.flatMap((context) =>
            rememberOverflow(Context.get(context, Memory.Memory), prompt(user("one"), assistant("two"))),
          ),
        ),
      )

      const fiber = yield* Effect.forkChild(run)
      yield* Deferred.await(started)
      yield* Fiber.interrupt(fiber)

      expect(yield* Ref.get(releases)).toBe(1)
    }),
  )

  it.effect("serializes concurrent overflow summaries", () =>
    Effect.gen(function* () {
      const calls = yield* Ref.make(0)
      const summaryPrompts = yield* Ref.make<ReadonlyArray<string>>([])
      const firstStarted = yield* Deferred.make<void>()
      const releaseFirst = yield* Deferred.make<void>()
      const service = yield* LanguageModel.make({
        generateText: (options) =>
          Ref.update(summaryPrompts, (prompts) => [...prompts, promptText(options.prompt)]).pipe(
            Effect.andThen(Ref.updateAndGet(calls, (count) => count + 1)),
            Effect.tap((count) =>
              count === 1
                ? Deferred.succeed(firstStarted, undefined).pipe(Effect.andThen(Deferred.await(releaseFirst)))
                : Effect.void,
            ),
            Effect.map((count) => [{ type: "text" as const, text: `summary-${count}` }]),
          ),
        streamText: () => Stream.empty,
      })
      const memoryLayer = WorkingMemory.layer({ maxMessages: 1, summarize: {} }).pipe(
        Layer.provide(WorkingMemory.layerSummaryModel),
        Layer.provide(Layer.succeed(LanguageModel.LanguageModel, service)),
      )

      yield* Effect.scoped(
        Layer.build(memoryLayer).pipe(
          Effect.flatMap((context) =>
            Effect.gen(function* () {
              const memory = yield* Memory.Memory
              const first = yield* Effect.forkChild(rememberOverflow(memory, prompt(user("one"), assistant("two"))))
              yield* Deferred.await(firstStarted)
              const second = yield* rememberOverflow(memory, prompt(user("three"), assistant("four"))).pipe(
                Effect.forkChild({ startImmediately: true }),
              )
              expect(yield* Ref.get(calls)).toBe(1)
              yield* Deferred.succeed(releaseFirst, undefined)
              yield* Fiber.join(first)
              yield* Fiber.join(second)
              expect(yield* Ref.get(calls)).toBe(2)
              const prompts = yield* Ref.get(summaryPrompts)
              expect(prompts[1]).toContain("Existing summary:\nsummary-1")
              expect(prompts[1]).toContain("New messages:\nAssistant: two\nUser: three")
              const recalled = yield* memory.recall({ key, turn: 0, prompt: prompt(user("current")) })
              expect(recalled.map((item) => item.id)).toEqual(["working-summary", "working-4"])
              expect(recalled.map(itemText)).toEqual([
                "<working-memory-summary>\nsummary-2\n</working-memory-summary>",
                "Assistant: four",
              ])
            }).pipe(Effect.provide(context)),
          ),
        ),
      )
    }),
  )

  it.effect("does not overwrite a concurrent transition for another key", () =>
    Effect.gen(function* () {
      const summaryStarted = yield* Deferred.make<void>()
      const releaseSummary = yield* Deferred.make<void>()
      const service = yield* LanguageModel.make({
        generateText: () =>
          Deferred.succeed(summaryStarted, undefined).pipe(
            Effect.andThen(Deferred.await(releaseSummary)),
            Effect.as([{ type: "text" as const, text: "summary" }]),
          ),
        streamText: () => Stream.empty,
      })
      const memoryLayer = WorkingMemory.layer({ maxMessages: 1, summarize: {} }).pipe(
        Layer.provide(WorkingMemory.layerSummaryModel),
        Layer.provide(Layer.succeed(LanguageModel.LanguageModel, service)),
      )

      yield* Effect.scoped(
        Layer.build(memoryLayer).pipe(
          Effect.flatMap((context) =>
            Effect.gen(function* () {
              const memory = yield* Memory.Memory
              yield* memory.remember({
                key: otherKey,
                turn: 0,
                terminal: true,
                transcript: prompt(user("other")),
              })
              const remembering = yield* Effect.forkChild(
                rememberOverflow(memory, prompt(user("one"), assistant("two"))),
              )
              yield* Deferred.await(summaryStarted)
              const forgetting = yield* memory
                .forget({ key: otherKey })
                .pipe(Effect.forkChild({ startImmediately: true }))
              yield* Deferred.succeed(releaseSummary, undefined)
              yield* Fiber.join(remembering)
              yield* Fiber.join(forgetting)

              expect(yield* memory.recall({ key: otherKey, turn: 0, prompt: prompt(user("current")) })).toEqual([])
              expect((yield* memory.recall({ key, turn: 0, prompt: prompt(user("current")) })).map(itemText)).toEqual([
                "<working-memory-summary>\nsummary\n</working-memory-summary>",
                "Assistant: two",
              ])
            }).pipe(Effect.provide(context)),
          ),
        ),
      )
    }),
  )

  it.effect("does not restore a key forgotten during an in-flight transition", () =>
    Effect.gen(function* () {
      const summaryStarted = yield* Deferred.make<void>()
      const releaseSummary = yield* Deferred.make<void>()
      const service = yield* LanguageModel.make({
        generateText: () =>
          Deferred.succeed(summaryStarted, undefined).pipe(
            Effect.andThen(Deferred.await(releaseSummary)),
            Effect.as([{ type: "text" as const, text: "summary" }]),
          ),
        streamText: () => Stream.empty,
      })
      const memoryLayer = WorkingMemory.layer({ maxMessages: 1, summarize: {} }).pipe(
        Layer.provide(WorkingMemory.layerSummaryModel),
        Layer.provide(Layer.succeed(LanguageModel.LanguageModel, service)),
      )

      yield* Effect.scoped(
        Layer.build(memoryLayer).pipe(
          Effect.flatMap((context) =>
            Effect.gen(function* () {
              const memory = yield* Memory.Memory
              const remembering = yield* Effect.forkChild(
                rememberOverflow(memory, prompt(user("one"), assistant("two"))),
              )
              yield* Deferred.await(summaryStarted)
              const forgetting = yield* memory.forget({ key }).pipe(Effect.forkChild({ startImmediately: true }))
              yield* Deferred.succeed(releaseSummary, undefined)
              yield* Fiber.join(remembering)
              yield* Fiber.join(forgetting)

              expect(yield* memory.recall({ key, turn: 0, prompt: prompt(user("current")) })).toEqual([])
            }).pipe(Effect.provide(context)),
          ),
        ),
      )
    }),
  )
})
