import type { ConverseCommandInput } from "@aws-sdk/client-bedrock-runtime"
import { ContextOverflow, ModelRegistry } from "tenetkit"
import { Effect, Layer, Schema, Stream } from "effect"
import { AiError, LanguageModel, Tool } from "effect/unstable/ai"
import type { RegistrationOptions } from "./openai.js"
import { Client, layerClient, type Options } from "./amazon-bedrock-client.js"
import { conformImageSourceModel } from "../model/image-source.js"
import { isAvailabilityFailure } from "../model/model-failure.js"
import { bedrockFailure, clientFailure } from "./amazon-bedrock-error.js"
import { makeRequest } from "./amazon-bedrock-request.js"
import { responseParts, streamParts } from "./amazon-bedrock-response.js"
export {
  Client,
  ClientFailure,
  layerClient,
  isRecoverableCredentialFailure,
  type Interface,
  type Options,
  type Recovery,
  RecoveryFailure,
} from "./amazon-bedrock-client.js"
export { CredentialFailure, defaultChain, type Credential, type Credentials } from "./amazon-bedrock-credentials.js"
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
      readonly requestId?: string
      readonly stopReason?: string
      readonly totalTokens?: number
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

const ConfigSchema = Schema.Struct({
  maxTokens: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))),
  temperature: Schema.optionalKey(Schema.Finite),
  topP: Schema.optionalKey(Schema.Finite),
  stopSequences: Schema.optionalKey(Schema.Array(Schema.String)),
  additionalModelRequestFields: Schema.optionalKey(Schema.Record(Schema.String, Schema.Json)),
  additionalModelResponseFieldPaths: Schema.optionalKey(Schema.Array(Schema.String)),
  guardrailConfig: Schema.optionalKey(
    Schema.Struct({
      guardrailIdentifier: Schema.String,
      guardrailVersion: Schema.String,
      trace: Schema.optionalKey(Schema.Literals(["disabled", "enabled", "enabled_full"])),
    }),
  ),
  performanceConfig: Schema.optionalKey(
    Schema.Struct({ latency: Schema.optionalKey(Schema.Literals(["standard", "optimized"])) }),
  ),
  promptVariables: Schema.optionalKey(Schema.Record(Schema.String, Schema.Struct({ text: Schema.String }))),
  requestMetadata: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
})

/** @experimental Decodes persisted provider options into Bedrock request configuration. */
export const decodeConfig = (options: unknown): Config =>
  Schema.decodeUnknownSync(ConfigSchema, { onExcessProperty: "error" })(options ?? {}) as unknown as Config
/** @experimental */
export interface Input extends RegistrationOptions {
  readonly model: string
  readonly config?: Config
}

const streamFailure = (cause: unknown) => {
  if (AiError.isAiError(cause)) return cause
  const value = cause instanceof Error ? cause : undefined
  const metadata =
    value !== undefined && "$metadata" in value && typeof value.$metadata === "object" && value.$metadata !== null
      ? value.$metadata
      : undefined
  const httpStatus =
    metadata !== undefined && "httpStatusCode" in metadata && typeof metadata.httpStatusCode === "number"
      ? metadata.httpStatusCode
      : undefined
  const errorCode =
    value !== undefined && "code" in value && typeof value.code === "string" ? value.code.slice(0, 256) : undefined
  const requestId =
    metadata !== undefined && "requestId" in metadata && typeof metadata.requestId === "string"
      ? metadata.requestId.slice(0, 256)
      : undefined
  return bedrockFailure("converseStream", {
    description: (value?.message ?? (typeof cause === "string" ? cause : "stream failed")).slice(0, 2_048),
    errorName: value?.name ?? "ModelStreamErrorException",
    ...(errorCode === undefined ? {} : { errorCode }),
    ...(httpStatus === undefined ? {} : { httpStatus }),
    ...(requestId === undefined ? {} : { requestId }),
  })
}

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
        Effect.mapError((error) => (AiError.isAiError(error) ? error : clientFailure("converse", error))),
      ),
    streamText: (options) =>
      makeRequest(input, options).pipe(
        Effect.flatMap(client.converseStream),
        Effect.map((output) =>
          streamParts(
            output.stream !== undefined
              ? Stream.fromAsyncIterable(output.stream, streamFailure)
              : Stream.fail(streamFailure("response contained no stream")),
            input.model,
            options.responseFormat.type === "json" ? options.responseFormat.objectName : undefined,
            output.$metadata.requestId,
          ),
        ),
        Stream.unwrap,
        Stream.mapError((error) => (AiError.isAiError(error) ? error : clientFailure("converseStream", error))),
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
export const layer = (
  input: Input & { readonly client?: Options },
): Layer.Layer<ModelRegistry.ModelRegistry, never, never> =>
  ModelRegistry.layer([
    ModelRegistry.registration({
      provider: "amazon-bedrock",
      model: input.model,
      layer: layerLanguageModel(input),
      classifyFailure,
      toolJsonSchemaCompiler,
      isAvailabilityFailure,
      ...(input.registrationKey === undefined ? {} : { registrationKey: input.registrationKey }),
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
    }),
  ]).pipe(Layer.provide(layerClient(input.client))) as Layer.Layer<ModelRegistry.ModelRegistry, never, never>
