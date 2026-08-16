import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Ref, Stream } from "effect"
import { LanguageModel, Prompt, Response } from "effect/unstable/ai"
import { Agent } from "../src/index"
import { withCacheBreakpoints } from "../src/model/prompt-cache"
import { withProviderFinish } from "./provider-finish"

const textDelta = (delta: string) => Response.makePart("text-delta", { id: "text", delta })

const toolResultMessage = () =>
  Prompt.fromResponseParts([
    Prompt.makePart("tool-result", {
      id: "t1",
      name: "read",
      isFailure: false,
      result: "file contents",
    }) as unknown as Response.AnyPart,
  ])

const conversationPrompt = Prompt.fromMessages([
  Prompt.makeMessage("system", { content: "primary instructions" }),
  Prompt.makeMessage("user", { content: [Prompt.makePart("text", { text: "fix the bug" })] }),
  Prompt.makeMessage("assistant", { content: [Prompt.makePart("text", { text: "inspecting" })] }),
  ...toolResultMessage().content,
])

const lastUserLikeMessage = (prompt: Prompt.Prompt) =>
  [...prompt.content].reverse().find((message) => message.role === "user" || message.role === "tool")

const lastPartOf = (message: Prompt.Message) => message.content.at(-1) as Prompt.Part

const cacheControlOf = (options: Prompt.Part["options"]) => {
  const anthropic = options.anthropic
  return typeof anthropic === "object" && anthropic !== null && "cacheControl" in anthropic
    ? (anthropic as { cacheControl: { type: string; ttl?: string } }).cacheControl
    : undefined
}

const cachePointOf = (options: Prompt.Part["options"]) => {
  const amazonBedrock = options.amazonBedrock
  return typeof amazonBedrock === "object" && amazonBedrock !== null
    ? (amazonBedrock as { cachePoint?: boolean }).cachePoint
    : undefined
}

describe("prompt-cache", () => {
  it.effect("marks the first system for one hour, later systems for five minutes, and the last tool message part", () =>
    Effect.sync(() => {
      const prompt = Prompt.fromMessages([
        Prompt.makeMessage("system", { content: "primary instructions" }),
        Prompt.makeMessage("system", { content: "dynamic harness" }),
        Prompt.makeMessage("user", { content: [Prompt.makePart("text", { text: "fix the bug" })] }),
        Prompt.makeMessage("assistant", { content: [Prompt.makePart("text", { text: "inspecting" })] }),
        ...toolResultMessage().content,
      ])
      const marked = withCacheBreakpoints(prompt, "conversation")
      expect(cacheControlOf(marked.content[0]!.options)).toEqual({ type: "ephemeral", ttl: "1h" })
      expect(cachePointOf(marked.content[0]!.options)).toEqual(true)
      expect(cacheControlOf(marked.content[1]!.options)).toEqual({ type: "ephemeral" })
      expect(cachePointOf(marked.content[1]!.options)).toEqual(true)
      const markedTail = lastUserLikeMessage(marked)!
      expect(markedTail.role).toEqual("tool")
      expect(cacheControlOf(lastPartOf(markedTail).options)).toEqual({ type: "ephemeral" })
      expect(cachePointOf(lastPartOf(markedTail).options)).toEqual(true)
      expect(marked.content[2]!.options).toEqual({})
      expect(marked.content[3]!.options).toEqual({})
    }),
  )

  it.effect("selects the last user-like message even when an assistant message ends the prompt", () =>
    Effect.sync(() => {
      const prompt = Prompt.fromMessages([
        ...conversationPrompt.content,
        Prompt.makeMessage("assistant", { content: [Prompt.makePart("text", { text: "done" })] }),
      ])
      const marked = withCacheBreakpoints(prompt, "conversation")
      const markedTail = lastUserLikeMessage(marked)!
      expect(markedTail.role).toEqual("tool")
      expect(cacheControlOf(lastPartOf(markedTail).options)).toEqual({ type: "ephemeral" })
      const assistant = [...marked.content].reverse().find((message) => message.role === "assistant")
      expect(assistant!.options).toEqual({})
    }),
  )

  it.effect("marks the last text part of a plain user message", () =>
    Effect.sync(() => {
      const prompt = Prompt.fromMessages([
        Prompt.makeMessage("system", { content: "primary instructions" }),
        Prompt.makeMessage("user", { content: [Prompt.makePart("text", { text: "fix the bug" })] }),
      ])
      const marked = withCacheBreakpoints(prompt, "conversation")
      const tail = lastUserLikeMessage(marked)!
      expect(tail.role).toEqual("user")
      expect(cacheControlOf(lastPartOf(tail).options)).toEqual({ type: "ephemeral" })
      expect(cachePointOf(lastPartOf(tail).options)).toEqual(true)
    }),
  )

  it.effect("preserves caller-set options and fills only missing gaps", () =>
    Effect.sync(() => {
      const prompt = Prompt.fromMessages([
        Prompt.makeMessage("system", {
          content: "primary instructions",
          options: { anthropic: { cacheControl: { type: "ephemeral", ttl: "1h" } } },
        }),
        Prompt.makeMessage("user", {
          content: [Prompt.makePart("text", { text: "fix the bug", options: { amazonBedrock: { cachePoint: true } } })],
        }),
      ])
      const marked = withCacheBreakpoints(prompt, "conversation")
      expect(marked.content[0]!.options.anthropic).toEqual({ cacheControl: { type: "ephemeral", ttl: "1h" } })
      expect(marked.content[0]!.options.amazonBedrock).toEqual({ cachePoint: true })
      const tail = lastUserLikeMessage(marked)!
      expect(lastPartOf(tail).options.amazonBedrock).toEqual({ cachePoint: true })
      expect(lastPartOf(tail).options.anthropic).toEqual({ cacheControl: { type: "ephemeral" } })
    }),
  )

  it.effect("leaves non-conversation purposes untouched", () =>
    Effect.sync(() => {
      for (const purpose of ["structured-output", "compaction-summary"] as const) {
        expect(withCacheBreakpoints(conversationPrompt, purpose)).toBe(conversationPrompt)
      }
    }),
  )

  it.effect("returns the same prompt when nothing needs marking", () =>
    Effect.sync(() => {
      const prompt = Prompt.fromMessages([
        Prompt.makeMessage("system", {
          content: "primary instructions",
          options: {
            anthropic: { cacheControl: { type: "ephemeral", ttl: "1h" } },
            amazonBedrock: { cachePoint: true },
          },
        }),
        Prompt.makeMessage("user", {
          content: [
            Prompt.makePart("text", {
              text: "fix the bug",
              options: { anthropic: { cacheControl: { type: "ephemeral" } }, amazonBedrock: { cachePoint: true } },
            }),
          ],
        }),
      ])
      expect(withCacheBreakpoints(prompt, "conversation")).toBe(prompt)
    }),
  )

  it.effect("caps total breakpoints at four", () =>
    Effect.sync(() => {
      const prompt = Prompt.fromMessages([
        Prompt.makeMessage("system", { content: "one" }),
        Prompt.makeMessage("system", { content: "two" }),
        Prompt.makeMessage("system", { content: "three" }),
        Prompt.makeMessage("system", { content: "four" }),
        Prompt.makeMessage("system", { content: "five" }),
        Prompt.makeMessage("user", { content: [Prompt.makePart("text", { text: "fix the bug" })] }),
      ])
      const marked = withCacheBreakpoints(prompt, "conversation")
      const markedCount = marked.content.filter((message) => {
        if (message.role === "system") return cacheControlOf(message.options) !== undefined
        return cacheControlOf(lastPartOf(message).options) !== undefined
      }).length
      expect(markedCount).toEqual(4)
    }),
  )

  it.effect("marks the wire prompt an Agent sends and orders supplemental as the second system message", () =>
    Effect.gen(function* () {
      const sent = yield* Ref.make<ReadonlyArray<Prompt.Prompt>>([])
      const captureModel = Layer.effect(
        LanguageModel.LanguageModel,
        LanguageModel.make({
          generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
          streamText: (options) =>
            withProviderFinish(
              Stream.make(textDelta("done")).pipe(
                Stream.tap(() => Ref.update(sent, (values) => [...values, options.prompt])),
              ),
            ),
        }),
      )
      const agent = Agent.make({
        name: "cache-agent",
        instructions: "primary instructions",
        supplemental: "dynamic harness",
      })
      yield* Effect.scoped(
        Effect.flatMap(Layer.build(captureModel), (context) =>
          Agent.generate(agent, { prompt: "fix the bug" }).pipe(Effect.provideContext(context)),
        ),
      )
      const [prompt] = yield* Ref.get(sent)
      expect(prompt).toBeDefined()
      const wirePrompt = prompt!
      expect(wirePrompt.content[0]!.role).toEqual("system")
      expect(wirePrompt.content[0]!.content).toEqual("primary instructions")
      expect(wirePrompt.content[1]!.role).toEqual("system")
      expect(wirePrompt.content[1]!.content).toEqual("dynamic harness")
      expect(cacheControlOf(wirePrompt.content[0]!.options)).toEqual({ type: "ephemeral", ttl: "1h" })
      expect(cacheControlOf(wirePrompt.content[1]!.options)).toEqual({ type: "ephemeral" })
      const tail = lastUserLikeMessage(wirePrompt)!
      expect(tail.role).toEqual("user")
      expect(cacheControlOf(lastPartOf(tail).options)).toEqual({ type: "ephemeral" })
    }),
  )
})
