import { OpenRouter } from "@batonfx/providers"
import { Config, Effect, Layer, Option, Stream } from "effect"
import * as Ai from "effect/unstable/ai"
import { FetchHttpClient } from "effect/unstable/http"

interface WebSearchSuccess {
  readonly results: ReadonlyArray<{ readonly title: string; readonly url: string; readonly snippet: string }>
}

const findWebSearchResult = (prompt: Ai.Prompt.Prompt): WebSearchSuccess | undefined => {
  for (const message of prompt.content) {
    if (message.role !== "tool") continue
    for (const part of message.content) {
      if (part.type === "tool-result" && part.name === "web_search" && !part.isFailure) {
        return part.result as WebSearchSuccess
      }
    }
  }
  return undefined
}

const latestUserQuestion = (prompt: Ai.Prompt.Prompt): string => {
  const last = prompt.content.findLast((message) => message.role === "user")
  if (last === undefined) return "the topic"
  for (const part of last.content) {
    if (part.type === "text") return part.text
  }
  return "the topic"
}

const synthesizeAnswer = (found: WebSearchSuccess): string => {
  const summary = found.results.map((item) => item.snippet).join(" ")
  const citations = found.results.map((item, index) => `[${index + 1}] ${item.title} — ${item.url}`).join("\n")
  return [
    `Based on ${found.results.length} sources, here is what I found:`,
    "",
    summary,
    "",
    "Sources:",
    citations,
  ].join("\n")
}

const scriptedModel: Layer.Layer<Ai.LanguageModel.LanguageModel> = Layer.effect(
  Ai.LanguageModel.LanguageModel,
  Ai.LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: (options) => {
      const found = findWebSearchResult(options.prompt)
      if (found !== undefined) {
        return Stream.make(Ai.Response.makePart("text-delta", { id: "assistant", delta: synthesizeAnswer(found) }))
      }
      return Stream.make(
        Ai.Response.makePart("tool-call", {
          id: "search-1",
          name: "web_search",
          params: { query: latestUserQuestion(options.prompt) },
          providerExecuted: false,
        }),
      )
    },
  }),
)

export const modelLayer: Layer.Layer<Ai.LanguageModel.LanguageModel> = Layer.unwrap(
  Effect.gen(function* () {
    const registration = yield* OpenRouter.openRouter({ model: "openai/gpt-4o-mini" }).pipe(
      Effect.provide(OpenRouter.openRouterClientLayerConfig({ apiKey: Config.redacted("OPENROUTER_API_KEY") })),
      Effect.provide(FetchHttpClient.layer),
      Effect.asSome,
      Effect.catchTag("ConfigError", () => Effect.succeedNone),
    )
    return Option.match(registration, {
      onNone: () => scriptedModel,
      onSome: (openRouter) => openRouter.layer,
    })
  }),
)
