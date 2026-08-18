import { describe, expect, layer } from "@effect/vitest"
import { Config, ConfigProvider, Effect, Layer, Stream } from "effect"
import { LanguageModel, Prompt } from "tenetkit"
import { layerOrDeterministic } from "../src/model"
import { testLayer } from "../src/search-provider"
import { toolkit, toolkitLayer } from "../src/tools"

const withEnv = (env: Record<string, string>) => ConfigProvider.layer(ConfigProvider.fromUnknown(env))

const modelLayer = layerOrDeterministic({
  model: "openai/gpt-4o-mini",
  apiKey: Config.redacted("OPENROUTER_API_KEY"),
})

const deterministicModel = modelLayer.pipe(Layer.provide(withEnv({})))
const toolkitServices = toolkitLayer.pipe(Layer.provide(testLayer({ search: () => Effect.succeed([]) })))

const collectStreamText = (prompt: Prompt.RawInput) =>
  LanguageModel.streamText({ prompt, toolkit, disableToolCallResolution: true }).pipe(
    Stream.runCollect,
    Effect.map((chunk) => [...chunk]),
  )

const generateText = (prompt: Prompt.RawInput) =>
  LanguageModel.generateText({ prompt }).pipe(Effect.map((response) => response.text))

describe("DeepResearchAgent model", () => {
  layer(Layer.mergeAll(deterministicModel, toolkitServices))("streams tool calls and cited answers", (it) => {
    it.effect("streams a web_search tool call before any tool result exists", () =>
      Effect.gen(function* () {
        const parts = yield* collectStreamText("What makes TenetKit standalone?")

        expect(parts).toMatchObject([
          {
            type: "tool-call",
            id: "search-1",
            name: "web_search",
            params: { query: "What makes TenetKit standalone?" },
            providerExecuted: false,
          },
          { type: "finish", reason: "tool-calls" },
        ])
      }),
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
          { type: "finish", reason: "tool-calls" },
        ])
      }),
    )

    it.effect("streams a cited answer after the web_search tool result exists", () =>
      Effect.gen(function* () {
        const parts = yield* collectStreamText([
          {
            role: "user",
            content: [{ type: "text", text: "What makes TenetKit standalone?" }],
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
                      title: "TenetKit transport",
                      url: "https://tenetkit.test/transport",
                      snippet: "TenetKit streams same-process sessions over transport frames.",
                    },
                    {
                      title: "TenetKit agent loop",
                      url: "https://tenetkit.test/agent",
                      snippet: "The agent loop plans, calls tools, and synthesizes answers.",
                    },
                  ],
                },
              },
            ],
          },
        ])

        expect(parts).toHaveLength(2)
        expect(parts[1]?.type).toBe("finish")
        expect(parts[0]?.type).toBe("text-delta")
        if (parts[0]?.type === "text-delta") {
          expect(parts[0].delta).toContain("Based on 2 sources")
          expect(parts[0].delta).toContain("TenetKit transport")
          expect(parts[0].delta).toContain("https://tenetkit.test/agent")
        }
      }),
    )

    it.effect("streams an explicit empty-source answer after an empty web_search result", () =>
      Effect.gen(function* () {
        const parts = yield* collectStreamText([
          {
            role: "user",
            content: [{ type: "text", text: "What makes TenetKit standalone?" }],
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
          { type: "finish", reason: "stop" },
        ])
      }),
    )

    it.effect("generates deterministic fallback text for non-streaming calls", () =>
      Effect.gen(function* () {
        const text = yield* generateText("hello")

        expect(text).toBe("deterministic response")
      }),
    )
  })

  layer(modelLayer.pipe(Layer.provide(withEnv({ OPENROUTER_API_KEY: "openrouter-test-key" }))))(
    "builds an OpenRouter model layer when OPENROUTER_API_KEY is set",
    (it) => {
      it.effect("builds an OpenRouter model layer", () =>
        Effect.gen(function* () {
          const model = yield* LanguageModel.LanguageModel

          expect(model.streamText).toBeTypeOf("function")
          expect(model.generateText).toBeTypeOf("function")
        }),
      )
    },
  )
})
