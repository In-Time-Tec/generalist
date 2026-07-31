import type { ConverseCommandInput } from "@aws-sdk/client-bedrock-runtime"
import { ContextOverflow, ModelRegistry } from "@batonfx/core"
import { Effect, Layer, Schema, Stream } from "effect"
import { AiError, LanguageModel, Tool } from "effect/unstable/ai"
import type { RegistrationOptions } from "./openai.js"
import { Client, ClientFailure, layerClient, type Options } from "./amazon-bedrock-client.js"
import { conformImageSourceModel } from "./image-source.js"
import { makeRequest } from "./amazon-bedrock-request.js"
import { responseParts, streamParts } from "./amazon-bedrock-response.js"
export * from "./amazon-bedrock-client.js"
export * from "./amazon-bedrock-credentials.js"
export { makeRequest } from "./amazon-bedrock-request.js"

declare module "effect/unstable/ai/Prompt" {
  export interface SystemMessageOptions extends ProviderOptions {
    readonly amazonBedrock?: { readonly cachePoint?: boolean } | null
  }
  export interface TextPartOptions extends ProviderOptions {
    readonly amazonBedrock?: { readonly cachePoint?: boolean } | null
  }
  export interface FilePartOptions extends ProviderOptions {
    readonly amazonBedrock?: { readonly cachePoint?: boolean } | null
  }
  export interface ToolResultPartOptions extends ProviderOptions {
    readonly amazonBedrock?: { readonly cachePoint?: boolean } | null
  }
  export interface ReasoningPartOptions extends ProviderOptions {
    readonly amazonBedrock?: { readonly signature?: string; readonly redactedData?: string } | null
  }
}
declare module "effect/unstable/ai/Response" {
  export interface ReasoningPartMetadata extends ProviderMetadata {
    readonly amazonBedrock?: { readonly signature?: string; readonly redactedData?: string } | null
  }
  export interface ReasoningDeltaPartMetadata extends ProviderMetadata {
    readonly amazonBedrock?: { readonly signature?: string; readonly redactedData?: string } | null
  }
  export interface FinishPartMetadata extends ProviderMetadata {
    readonly amazonBedrock?: {
      readonly metrics?: { readonly latencyMs?: number }
      readonly trace?: import("effect").Schema.Json
      readonly additionalModelResponseFields?: import("effect").Schema.Json
      readonly performanceConfig?: import("effect").Schema.Json
    } | null
  }
}

/** @experimental */
export interface Config {
  readonly maxTokens?: number
  readonly temperature?: number
  readonly topP?: number
  readonly stopSequences?: ReadonlyArray<string>
  readonly additionalModelRequestFields?: Readonly<Record<string, Schema.Json>>
  readonly additionalModelResponseFieldPaths?: ConverseCommandInput["additionalModelResponseFieldPaths"]
  readonly guardrailConfig?: ConverseCommandInput["guardrailConfig"]
  readonly performanceConfig?: ConverseCommandInput["performanceConfig"]
  readonly promptVariables?: ConverseCommandInput["promptVariables"]
  readonly requestMetadata?: ConverseCommandInput["requestMetadata"]
}
/** @experimental */
export interface Input extends RegistrationOptions {
  readonly model: string
  readonly config?: Config
}

const failure = (method: string, error: ClientFailure) =>
  AiError.AiError.make({
    module: "AmazonBedrock",
    method,
    reason:
      error.awsErrorName === "ValidationException"
        ? AiError.InvalidRequestError.make({ description: error.description })
        : AiError.UnknownError.make({ description: error.description }),
  })

const streamFailure = (description: string) =>
  AiError.AiError.make({
    module: "AmazonBedrock",
    method: "converseStream",
    reason: AiError.UnknownError.make({ description }),
  })

/** @experimental */
export const make = Effect.fnUntraced(function* (input: Input) {
  const client = yield* Client
  const model = yield* LanguageModel.make({
    generateText: (options) =>
      makeRequest(input, options).pipe(
        Effect.flatMap(client.converse),
        Effect.map((value) =>
          responseParts(
            value,
            input.model,
            options.responseFormat.type === "json" ? options.responseFormat.objectName : undefined,
          ),
        ),
        Effect.mapError((error) => (AiError.isAiError(error) ? error : failure("converse", error))),
      ),
    streamText: (options) =>
      makeRequest(input, options).pipe(
        Effect.flatMap(client.converseStream),
        Effect.map((output) =>
          output.stream !== undefined
            ? Stream.fromAsyncIterable(output.stream, (cause) =>
                streamFailure(cause instanceof Error ? cause.name : "stream failed"),
              )
            : Stream.fail(streamFailure("response contained no stream")),
        ),
        Effect.map((events) =>
          streamParts(
            events,
            input.model,
            options.responseFormat.type === "json" ? options.responseFormat.objectName : undefined,
          ),
        ),
        Stream.unwrap,
        Stream.mapError((error) => (AiError.isAiError(error) ? error : failure("converseStream", error))),
      ),
  })
  return conformImageSourceModel(model)
})

/** @experimental */
export const layerLanguageModel = (input: Input) => Layer.effect(LanguageModel.LanguageModel, make(input))
/** @experimental */
export const classifyFailure: ModelRegistry.FailureClassifier = ContextOverflow.classify
/** @experimental */
export const toolJsonSchemaCompiler: ModelRegistry.ToolJsonSchemaCompiler = (tool) =>
  Effect.try({
    try: () => Tool.getJsonSchema(tool),
    catch: (error) =>
      AiError.make({
        module: "AmazonBedrock",
        method: "makeRequest",
        reason: AiError.UnsupportedSchemaError.make({
          description: error instanceof Error ? error.message : String(error),
        }),
      }),
  })
/** @experimental */
export const layer = (input: Input & { readonly client?: Options }) =>
  ModelRegistry.layer([
    ModelRegistry.registration({
      provider: "amazon-bedrock",
      model: input.model,
      layer: layerLanguageModel(input),
      classifyFailure,
      toolJsonSchemaCompiler,
      ...(input.registrationKey === undefined ? {} : { registrationKey: input.registrationKey }),
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
    }),
  ]).pipe(Layer.provide(layerClient(input.client)))
