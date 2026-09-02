import { describe, expect, it } from "@effect/vitest"
import type { InvokeModelCommandInput } from "@aws-sdk/client-bedrock-runtime"
import { Effect, Layer, Schema } from "effect"
import { EmbeddingModel } from "effect/unstable/ai"
import { type Service, layerEmbedding } from "generalist/ai/amazon-bedrock"

const json = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))

describe("Amazon Bedrock embeddings", () => {
  it.effect("invokes Titan for each input and preserves result order and usage", () => {
    const inputs: Array<InvokeModelCommandInput> = []
    const client: Service = {
      converse: () => Effect.die("unexpected converse call"),
      converseStream: () => Effect.die("unexpected converseStream call"),
      invokeModel: (input) =>
        Effect.gen(function* () {
          inputs.push(input)
          if (!Schema.is(Schema.String)(input.body)) return yield* Effect.die("expected string request body")
          const request = yield* Schema.decodeEffect(
            Schema.fromJsonString(Schema.Struct({ inputText: Schema.String })),
          )(input.body).pipe(Effect.orDie)
          const index = request.inputText === "first" ? 1 : 2
          const body = Object.assign(
            new TextEncoder().encode(json({ embedding: [index, 0], inputTextTokenCount: index })),
            { transformToString: () => json({ embedding: [index, 0], inputTextTokenCount: index }) },
          )
          return {
            body,
            contentType: "application/json",
            $metadata: {},
          }
        }),
    }
    const model = layerEmbedding({
      model: "amazon.titan-embed-text-v2:0",
      dimensions: 1024,
      client: { client },
    })
    const program = Effect.gen(function* () {
      const embedding = yield* EmbeddingModel.EmbeddingModel
      const response = yield* embedding.embedMany(["first", "second"])
      expect(response.embeddings.map((result) => Array.from(result.vector))).toEqual([
        [1, 0],
        [2, 0],
      ])
      expect(response.usage.inputTokens).toBe(3)
      expect(
        yield* Effect.forEach(inputs, (input) =>
          Schema.is(Schema.String)(input.body)
            ? Schema.decodeEffect(Schema.fromJsonString(Schema.Unknown))(input.body).pipe(
                Effect.map((body) => ({ modelId: input.modelId, body })),
              )
            : Effect.die("expected string request body"),
        ),
      ).toEqual([
        {
          modelId: "amazon.titan-embed-text-v2:0",
          body: { inputText: "first", dimensions: 1024 },
        },
        {
          modelId: "amazon.titan-embed-text-v2:0",
          body: { inputText: "second", dimensions: 1024 },
        },
      ])
    })
    return Effect.scoped(
      Layer.build(model).pipe(Effect.flatMap((context) => program.pipe(Effect.provideContext(context)))),
    )
  })
})
