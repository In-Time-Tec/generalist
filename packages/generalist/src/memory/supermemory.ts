import { Config, Effect, Layer, Redacted, Schema } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import { Prompt } from "effect/unstable/ai"
import { type Item, type Key, Memory, MemoryError, type Metadata, type Service } from "../core/context/memory.js"

const CreateResponse = Schema.Struct({
  memories: Schema.Array(Schema.Struct({ id: Schema.String })),
})
const SearchResponse = Schema.Struct({
  results: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      memory: Schema.String,
      similarity: Schema.Finite,
      metadata: Schema.optionalKey(Schema.NullOr(Schema.Record(Schema.String, Schema.Unknown))),
    }),
  ),
})

/** Supermemory HTTP API failure. */
export class SupermemoryError extends Schema.TaggedError<SupermemoryError>()("generalist/memory/SupermemoryError", {
  status: Schema.Int,
  body: Schema.String,
}) {}

/** Hosted Supermemory configuration. */
export interface Options {
  readonly apiKey: Config.Config<Redacted.Redacted<string>>
  readonly containerTag: string
  readonly containerTagForKey?: (key: Key) => string
  readonly endpoint?: string
  readonly limit?: number
  readonly threshold?: number
}

const textFromParts = (parts: ReadonlyArray<Prompt.Part>): string =>
  parts
    .filter((part): part is Prompt.TextPart => part.type === "text")
    .map((part) => part.text)
    .join("")

const userText = (prompt: Prompt.Prompt): string =>
  prompt.content
    .filter((message): message is Prompt.UserMessage => message.role === "user")
    .map((message) => textFromParts(message.content))
    .filter((text) => text.length > 0)
    .join("\n\n")

const finalExchangeText = (prompt: Prompt.Prompt): string | undefined => {
  let assistant: string | undefined
  for (let index = prompt.content.length - 1; index >= 0; index -= 1) {
    const message = prompt.content[index]
    if (assistant === undefined && message?.role === "assistant") {
      const text = textFromParts(message.content).trim()
      if (text.length > 0) assistant = text
      continue
    }
    if (assistant !== undefined && message?.role === "user") {
      const text = textFromParts(message.content).trim()
      if (text.length > 0) return `User: ${text}\nAssistant: ${assistant}`
    }
  }
  return undefined
}

const memoryError = (cause: SupermemoryError): MemoryError =>
  MemoryError.make({ message: `Supermemory request failed with status ${cause.status}`, cause })

const boundedBody = (response: HttpClientResponse.HttpClientResponse) =>
  response.text.pipe(
    Effect.map((body) => body.slice(0, 16_384)),
    Effect.orElseSucceed(() => "Response body could not be read"),
  )

const decode = <A>(
  response: HttpClientResponse.HttpClientResponse,
  schema: Schema.Decoder<A>,
): Effect.Effect<A, SupermemoryError> =>
  response.status >= 200 && response.status < 300
    ? boundedBody(response).pipe(
        Effect.flatMap((body) =>
          Schema.decodeEffect(Schema.fromJsonString(schema))(body).pipe(
            Effect.mapError(() => SupermemoryError.make({ status: response.status, body })),
          ),
        ),
      )
    : boundedBody(response).pipe(
        Effect.flatMap((body) => Effect.fail(SupermemoryError.make({ status: response.status, body }))),
      )

const request = (method: "POST" | "DELETE", url: string, apiKey: Redacted.Redacted<string>, body: Schema.Json) =>
  HttpClientRequest.make(method)(url).pipe(
    HttpClientRequest.bearerToken(Redacted.value(apiKey)),
    HttpClientRequest.bodyJsonUnsafe(body),
  )

const item = (result: (typeof SearchResponse.Type.results)[number]): Item => ({
  id: result.id,
  content: [Prompt.makePart("text", { text: result.memory })],
  metadata: {
    ...result.metadata,
    score: result.similarity,
  } satisfies Metadata,
})

/** Hosted semantic Memory that uses Supermemory's embeddings and vector storage. */
export const layer = (options: Options): Layer.Layer<Memory, Config.ConfigError, HttpClient.HttpClient> =>
  Layer.effect(
    Memory,
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient
      const apiKey = yield* options.apiKey
      const endpoint = (options.endpoint ?? "https://api.supermemory.ai").replace(/\/$/, "")
      const containerTag = options.containerTagForKey ?? (() => options.containerTag)
      const execute = <A>(method: "POST" | "DELETE", path: string, body: Schema.Json, schema: Schema.Decoder<A>) =>
        client.execute(request(method, `${endpoint}${path}`, apiKey, body)).pipe(
          Effect.mapError(() => SupermemoryError.make({ status: 0, body: "HTTP request failed" })),
          Effect.flatMap((response) => decode(response, schema)),
        )

      const service: Service = {
        recall: (input) => {
          const q = userText(input.prompt)
          if (q.length === 0) return Effect.succeed([])
          return execute(
            "POST",
            "/v4/search",
            {
              q,
              containerTag: containerTag(input.key),
              searchMode: "memories",
              limit: options.limit ?? 5,
              ...(options.threshold === undefined ? undefined : { threshold: options.threshold }),
            },
            SearchResponse,
          ).pipe(
            Effect.map((response) => response.results.map(item)),
            Effect.mapError(memoryError),
          )
        },
        remember: (input) => {
          if (!input.terminal) return Effect.void
          const content = finalExchangeText(input.transcript)
          if (content === undefined) return Effect.void
          return execute(
            "POST",
            "/v4/memories",
            { memories: [{ content }], containerTag: containerTag(input.key) },
            CreateResponse,
          ).pipe(Effect.asVoid, Effect.mapError(memoryError))
        },
        forget: (input) =>
          input.id === undefined
            ? client
                .execute(
                  request(
                    "DELETE",
                    `${endpoint}/v3/container-tags/${encodeURIComponent(containerTag(input.key))}`,
                    apiKey,
                    {},
                  ),
                )
                .pipe(
                  Effect.mapError(() => SupermemoryError.make({ status: 0, body: "HTTP request failed" })),
                  Effect.flatMap((response) =>
                    response.status >= 200 && response.status < 300
                      ? Effect.void
                      : boundedBody(response).pipe(
                          Effect.flatMap((body) =>
                            Effect.fail(SupermemoryError.make({ status: response.status, body })),
                          ),
                        ),
                  ),
                  Effect.mapError(memoryError),
                )
            : execute(
                "DELETE",
                "/v4/memories",
                { id: input.id, containerTag: containerTag(input.key) },
                Schema.Unknown,
              ).pipe(Effect.asVoid, Effect.mapError(memoryError)),
      }
      return Memory.of(service)
    }),
  )
