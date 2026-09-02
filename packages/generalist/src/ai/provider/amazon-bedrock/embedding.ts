import { Effect, Layer, Schema } from "effect"
import { AiError, EmbeddingModel } from "effect/unstable/ai"
import { Client, ClientFailure, layerClient, type ClientOptions } from "./client.js"
import { clientFailure } from "./error.js"

/** Amazon Bedrock embedding model configuration. */
export interface Options {
  readonly model: string
  readonly dimensions?: 256 | 512 | 1024
  readonly normalize?: boolean
}

const TitanEmbeddingResponse = Schema.Struct({
  embedding: Schema.Array(Schema.Finite),
  inputTextTokenCount: Schema.optionalKey(Schema.Finite),
})

const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))
const decodeTitanEmbedding = Schema.decodeUnknownEffect(Schema.fromJsonString(TitanEmbeddingResponse), {
  onExcessProperty: "ignore",
})

const embeddingFailure = (error: AiError.AiError | ClientFailure | Schema.SchemaError): AiError.AiError => {
  if (AiError.isAiError(error)) return error
  if (Schema.is(ClientFailure)(error)) return clientFailure("invokeModel", error)
  return AiError.make({
    module: "AmazonBedrock",
    method: "invokeModel",
    reason: AiError.InvalidOutputError.make({ description: "Bedrock returned invalid embedding JSON" }),
  })
}

/** Effect AI EmbeddingModel backed by Bedrock InvokeModel. */
export const make = Effect.fnUntraced(function* (options: Options) {
  const client = yield* Client
  return yield* EmbeddingModel.make({
    embedMany: ({ inputs }) =>
      Effect.forEach(
        inputs,
        (inputText) =>
          client
            .invokeModel({
              modelId: options.model,
              contentType: "application/json",
              accept: "application/json",
              body: encodeJson({
                inputText,
                ...(options.dimensions === undefined ? undefined : { dimensions: options.dimensions }),
                ...(options.normalize === undefined ? undefined : { normalize: options.normalize }),
              }),
            })
            .pipe(
              Effect.flatMap((response) => decodeTitanEmbedding(new TextDecoder().decode(response.body))),
              Effect.mapError(embeddingFailure),
            ),
        { concurrency: 8 },
      ).pipe(
        Effect.map((responses) => ({
          results: responses.map((response) => Array.from(response.embedding)),
          usage: {
            inputTokens: responses.reduce<number | undefined>(
              (total, response) =>
                response.inputTextTokenCount === undefined ? total : (total ?? 0) + response.inputTextTokenCount,
              undefined,
            ),
          },
        })),
      ),
  })
})

/** EmbeddingModel layer backed by an owned Bedrock client. */
export const layer = (
  options: Options & { readonly client?: ClientOptions },
): Layer.Layer<EmbeddingModel.EmbeddingModel> =>
  Layer.effect(EmbeddingModel.EmbeddingModel, make(options)).pipe(Layer.provide(layerClient(options.client)))
