import { OpenRouter } from "tenetkit/ai"
import { Config, Effect, Layer, Option, Stream } from "effect"
import { LanguageModel, ModelRegistry, Prompt, Response } from "tenetkit"
import { FetchHttpClient } from "effect/unstable/http"

interface WebSearchSuccess {
  readonly results: ReadonlyArray<{ readonly title: string; readonly url: string; readonly snippet: string }>
}

const findWebSearchResult = (prompt: Prompt.Prompt): WebSearchSuccess | undefined => {
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

const latestUserQuestion = (prompt: Prompt.Prompt): string => {
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

const usage = Response.Usage.make({
  inputTokens: { uncached: 0, total: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
})

const scriptedModel: Layer.Layer<LanguageModel.LanguageModel> = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: (options) => {
      const found = findWebSearchResult(options.prompt)
      if (found !== undefined) {
        return Stream.make(
          Response.makePart("text-delta", { id: "assistant", delta: synthesizeAnswer(found) }),
          Response.makePart("finish", { reason: "stop", usage, response: undefined }),
        )
      }
      return Stream.make(
        Response.makePart("tool-call", {
          id: "search-1",
          name: "web_search",
          params: { query: latestUserQuestion(options.prompt) },
          providerExecuted: false,
        }),
        Response.makePart("finish", { reason: "tool-calls", usage, response: undefined }),
      )
    },
  }),
)

export const modelLayer: Layer.Layer<LanguageModel.LanguageModel> = Layer.unwrap(
  Effect.gen(function* () {
    const registration = yield* Effect.scoped(
      Layer.build(
        Layer.provide(
          OpenRouter.layer({ model: "openai/gpt-4o-mini", apiKey: Config.redacted("OPENROUTER_API_KEY") }),
          FetchHttpClient.layer,
        ),
      ).pipe(
        Effect.flatMap((context) => ModelRegistry.registrations().pipe(Effect.provide(context))),
        Effect.map((registrations) => registrations[0]),
      ),
    ).pipe(
      Effect.asSome,
      Effect.catchTag("ConfigError", () => Effect.succeedNone),
    )
    return Option.match(registration, {
      onNone: () => scriptedModel,
      onSome: (openRouter) => openRouter?.layer ?? scriptedModel,
    })
  }),
)
