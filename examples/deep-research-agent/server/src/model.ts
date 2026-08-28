import { OpenRouter } from "tenetkit/ai"
import { Effect, Layer, Option, Schema, Stream } from "effect"
import { LanguageModel, ModelRegistry, Prompt, Response } from "tenetkit"
import { FetchHttpClient } from "effect/unstable/http"

type StreamText = Parameters<typeof LanguageModel.make>[0]["streamText"]

const WebSearchSuccess = Schema.Struct({
  results: Schema.Array(Schema.Struct({ title: Schema.String, url: Schema.String, snippet: Schema.String })),
})
type WebSearchSuccess = typeof WebSearchSuccess.Type

const findWebSearchResult = (prompt: Prompt.Prompt): WebSearchSuccess | undefined => {
  for (const message of prompt.content) {
    if (message.role !== "tool") continue
    for (const part of message.content) {
      if (part.type === "tool-result" && part.name === "web_search" && !part.isFailure) {
        return Schema.decodeUnknownOption(WebSearchSuccess)(part.result).pipe(Option.getOrUndefined)
      }
    }
  }
  return undefined
}

const latestUserQuestion = (prompt: Prompt.Prompt): string => {
  const userMessages = prompt.content.filter((message) => message.role === "user")
  const last = userMessages.at(-1)
  if (last === undefined) return "the topic"
  for (const part of last.content) {
    if (part.type === "text") return part.text
  }
  return "the topic"
}

const synthesizeAnswer = (result: WebSearchSuccess): string => {
  if (result.results.length === 0) {
    return "I could not find any relevant sources for this question."
  }
  const summary = result.results.map((item) => item.snippet).join(" ")
  const citations = result.results.map((item, index) => `[${index + 1}] ${item.title} — ${item.url}`).join("\n")
  return [
    `Based on ${result.results.length} source${result.results.length === 1 ? "" : "s"}, here is what I found:`,
    "",
    summary,
    "",
    "Sources:",
    citations,
  ].join("\n")
}

/**
 * @experimental Scripted `streamText` for the credential-free demo path.
 * Reads the growing prompt to decide which script step to play: no prior
 * `web_search` tool result means "plan and call the tool"; a prior result
 * means "synthesize the final cited answer from it". Deriving the step from
 * the prompt (rather than a call counter) keeps the script correct across
 * multiple questions asked in the same server process.
 */
const scriptedUsage = Response.Usage.make({
  inputTokens: { uncached: 0, total: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
})

const scriptedFinish = (reason: Response.FinishReason) =>
  Response.makePart("finish", { reason, usage: scriptedUsage, response: { status: 200, headers: {} } })

const scriptedStreamText: StreamText = (options) => {
  const priorResult = findWebSearchResult(options.prompt)
  if (priorResult !== undefined) {
    return Stream.make(
      Response.makePart("text-delta", { id: "assistant", delta: synthesizeAnswer(priorResult) }),
      scriptedFinish("stop"),
    )
  }
  const query = latestUserQuestion(options.prompt)
  return Stream.make(
    Response.makePart("tool-call", {
      id: "search-1",
      name: "web_search",
      params: { query },
      providerExecuted: false,
    }),
    scriptedFinish("tool-calls"),
  )
}

/** @experimental A closed `LanguageModel` requiring nothing, scripted to demonstrate the plan -> search -> synthesize loop. */
const scriptedDeterministicModel: Layer.Layer<LanguageModel.LanguageModel> = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () =>
      Effect.succeed([
        { type: "text", text: "deterministic response" },
        { type: "finish", reason: "stop", usage: scriptedUsage, response: undefined },
      ]),
    streamText: scriptedStreamText,
  }),
)

/** @experimental */
export type LayerOrDeterministicOptions = OpenRouter.LayerOptions

/**
 * @experimental Copies the shape of `Deterministic.layerOpenAi`
 * (`packages/providers/src/deterministic.ts`), swapping OpenAI for
 * OpenRouter: try to build a real OpenRouter model layer from `options`, and
 * fall back to the scripted deterministic model above when the API key
 * config does not resolve. Unlike the packaged helper this returns a closed
 * `LanguageModel` directly (not a `ModelRegistry` registration), ready to be
 * provided by this server's executable resolver.
 */
export const layerOrDeterministic = (options: LayerOrDeterministicOptions): Layer.Layer<LanguageModel.LanguageModel> =>
  Layer.unwrap(
    Effect.gen(function* () {
      const openRouterRegistration = yield* Effect.scoped(
        Layer.build(Layer.provide(OpenRouter.layer(options), FetchHttpClient.layer)).pipe(
          Effect.flatMap((context) => ModelRegistry.registrations().pipe(Effect.provide(context))),
          Effect.map((registrations) => registrations[0]),
        ),
      ).pipe(
        Effect.asSome,
        Effect.catchTag("ConfigError", () => Effect.succeedNone),
      )
      return Option.match(openRouterRegistration, {
        onNone: () => scriptedDeterministicModel,
        onSome: (registration) => registration?.layer ?? scriptedDeterministicModel,
      })
    }),
  )
