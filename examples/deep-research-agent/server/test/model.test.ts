import { describe, expect, it } from "@effect/vitest"
import { Config, ConfigProvider, Effect, Stream } from "effect"
import { LanguageModel, Prompt } from "@batonfx/core"
import { withOpenRouterOrDeterministic } from "../src/model"
import { testLayer } from "../src/search-provider"
import { toolkit, toolkitLayer } from "../src/tools"

const withEnv = (env: Record<string, string>) => ConfigProvider.layer(ConfigProvider.fromUnknown(env))

const modelLayer = withOpenRouterOrDeterministic({
  model: "openai/gpt-4o-mini",
  apiKey: Config.redacted("OPENROUTER_API_KEY"),
})

const handledToolkit = toolkit.pipe(
  Effect.provide(toolkitLayer),
  Effect.provide(testLayer({ search: () => Effect.succeed([]) })),
)

const collectStreamText = (prompt: Prompt.RawInput) =>
  LanguageModel.streamText({ prompt, toolkit: handledToolkit, disableToolCallResolution: true }).pipe(
    Stream.runCollect,
    Effect.map((chunk) => [...chunk]),
  )

const generateText = (prompt: Prompt.RawInput) =>
  LanguageModel.generateText({ prompt }).pipe(Effect.map((response) => response.text))

describe("DeepResearchAgent model", () => {
  it.effect("builds an OpenRouter model layer when OPENROUTER_API_KEY is set", () =>
    Effect.gen(function* () {
      const model = yield* LanguageModel.LanguageModel

      expect(model.streamText).toBeTypeOf("function")
      expect(model.generateText).toBeTypeOf("function")
    }).pipe(Effect.provide(modelLayer), Effect.provide(withEnv({ OPENROUTER_API_KEY: "openrouter-test-key" }))),
  )

  it.effect("streams a web_search tool call before any tool result exists", () =>
    Effect.gen(function* () {
      const parts = yield* collectStreamText("What makes Baton standalone?")

      expect(parts).toMatchObject([
        {
          type: "tool-call",
          id: "search-1",
          name: "web_search",
          params: { query: "What makes Baton standalone?" },
          providerExecuted: false,
        },
      ])
    }).pipe(Effect.provide(modelLayer), Effect.provide(withEnv({}))),
  )

  it.effect("uses a generic search topic when the prompt has no user text", () =>
    Effect.gen(function* () {
      const parts = yield* collectStreamText([{ role: "assistant", content: [{ type: "text", text: "ready" }] }])

      expect(parts).toMatchObject([
        {
          type: "tool-call",
          id: "search-1",
          name: "web_search",
          params: { query: "the topic" },
          providerExecuted: false,
        },
      ])
    }).pipe(Effect.provide(modelLayer), Effect.provide(withEnv({}))),
  )

  it.effect("streams a cited answer after the web_search tool result exists", () =>
    Effect.gen(function* () {
      const parts = yield* collectStreamText([
        {
          role: "user",
          content: [{ type: "text", text: "What makes Baton standalone?" }],
        },
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              id: "search-1",
              name: "web_search",
              isFailure: false,
              result: {
                results: [
                  {
                    title: "Baton transport",
                    url: "https://baton.test/transport",
                    snippet: "Baton streams same-process sessions over transport frames.",
                  },
                  {
                    title: "Baton agent loop",
                    url: "https://baton.test/agent",
                    snippet: "The agent loop plans, calls tools, and synthesizes answers.",
                  },
                ],
              },
            },
          ],
        },
      ])

      expect(parts).toHaveLength(1)
      expect(parts[0]?.type).toBe("text-delta")
      if (parts[0]?.type === "text-delta") {
        expect(parts[0].delta).toContain("Based on 2 sources")
        expect(parts[0].delta).toContain("Baton transport")
        expect(parts[0].delta).toContain("https://baton.test/agent")
      }
    }).pipe(Effect.provide(modelLayer), Effect.provide(withEnv({}))),
  )

  it.effect("streams an explicit empty-source answer after an empty web_search result", () =>
    Effect.gen(function* () {
      const parts = yield* collectStreamText([
        {
          role: "user",
          content: [{ type: "text", text: "What makes Baton standalone?" }],
        },
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              id: "search-1",
              name: "web_search",
              isFailure: false,
              result: { results: [] },
            },
          ],
        },
      ])

      expect(parts).toMatchObject([
        {
          type: "text-delta",
          delta: "I could not find any relevant sources for this question.",
        },
      ])
    }).pipe(Effect.provide(modelLayer), Effect.provide(withEnv({}))),
  )

  it.effect("generates deterministic fallback text for non-streaming calls", () =>
    Effect.gen(function* () {
      const text = yield* generateText("hello")

      expect(text).toBe("deterministic response")
    }).pipe(Effect.provide(modelLayer), Effect.provide(withEnv({}))),
  )
})
