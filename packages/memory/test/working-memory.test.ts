import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Stream } from "effect"
import * as Ai from "effect/unstable/ai"
import { Memory } from "@batonfx/core"
import { WorkingMemory } from "../src/index"

const key: Memory.Key = { agent: "memory-agent", subject: "subject-a" }
const otherKey: Memory.Key = { agent: "memory-agent", subject: "subject-b" }

const textPart = (text: string) => Ai.Prompt.makePart("text", { text })
const user = (text: string) => Ai.Prompt.makeMessage("user", { content: [textPart(text)] })
const assistant = (text: string) => Ai.Prompt.makeMessage("assistant", { content: [textPart(text)] })
const prompt = (...messages: ReadonlyArray<Ai.Prompt.Message>) => Ai.Prompt.fromMessages(messages)

const itemText = (item: Memory.Item): string =>
  item.parts
    .filter((part): part is Ai.Prompt.TextPart => part.type === "text")
    .map((part) => part.text)
    .join("")

describe("WorkingMemory", () => {
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
    }).pipe(Effect.provide(WorkingMemory.layer({ maxMessages: 2 }))),
  )

  it.effect("summarizes overflow once and recalls summary before the recent tail", () => {
    let summaryCalls = 0
    let summaryPrompt = ""
    const summaryModel = Layer.effect(
      Ai.LanguageModel.LanguageModel,
      Ai.LanguageModel.make({
        generateText: (options) =>
          Effect.sync(() => {
            summaryCalls += 1
            summaryPrompt = JSON.stringify(options.prompt.content)
            return [{ type: "text", text: "summary" }]
          }),
        streamText: () => Stream.empty,
      }),
    )

    return Effect.gen(function* () {
      const memory = yield* Memory.Memory

      yield* memory.remember({
        key,
        turn: 0,
        terminal: true,
        transcript: prompt(user("one"), assistant("two"), user("three"), assistant("four")),
      })

      const recalled = yield* memory.recall({ key, turn: 0, prompt: prompt(user("current")) })

      expect(summaryCalls).toBe(1)
      expect(summaryPrompt).toContain("one")
      expect(summaryPrompt).toContain("two")
      expect(recalled.map(itemText)).toEqual([
        "<working-memory-summary>\nsummary\n</working-memory-summary>",
        "User: three",
        "Assistant: four",
      ])
    }).pipe(
      Effect.provide(
        WorkingMemory.layer({
          maxMessages: 2,
          summarize: { model: summaryModel },
        }),
      ),
    )
  })

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
    }).pipe(Effect.provide(WorkingMemory.layer({ maxMessages: 2 }))),
  )
})
