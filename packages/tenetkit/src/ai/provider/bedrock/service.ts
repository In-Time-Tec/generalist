import { classify } from "../../../core/model/result/context-overflow.js"
import {
  type FailureClassifier,
  type ModelRegistry,
  type ToolJsonSchemaCompiler,
  layer as modelRegistryLayer,
  registration,
} from "../../../core/model/registry.js"
import { Effect, Layer, Option, Schema, Stream } from "effect"
import { AiError, LanguageModel, Tool } from "effect/unstable/ai"
import type { RegistrationOptions } from "../../model/registration.js"
import { Client, layerClient, type ClientOptions } from "./client.js"
import { conformImageSourceModel } from "../../model/image-source.js"
import { isAvailabilityFailure } from "../../model/failure.js"
import { bedrockFailure, clientFailure } from "./error.js"
import { make as makeBedrockRequest } from "./request.js"
import { responseParts, streamParts } from "./response.js"
export {
  Client,
  ClientFailure,
  layerClient,
  isRecoverableCredentialFailure,
  type Service,
  type ClientOptions,
  type Recovery,
  RecoveryFailure,
} from "./client.js"
export { CredentialFailure, defaultChain, type Credential, type Credentials } from "./credentials.js"

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

/** @experimental */
export type Config = typeof ConfigSchema.Type

/** @experimental Decodes persisted provider options into Bedrock request configuration. */
type ConfigInput = typeof Schema.Unknown.Type
const decodeConfigInput = Schema.decodeUnknownSync(ConfigSchema, { onExcessProperty: "error" })

export const decodeConfig = (options: ConfigInput): Config => decodeConfigInput(options ?? {})
/** @experimental */
export interface Options extends RegistrationOptions {
  readonly model: string
  readonly config?: Config
}

const StreamFailureSchema = Schema.Union([
  Schema.String,
  Schema.Struct({
    name: Schema.optionalKey(Schema.String),
    message: Schema.optionalKey(Schema.String),
    code: Schema.optionalKey(Schema.String),
    $metadata: Schema.optionalKey(
      Schema.Struct({
        httpStatusCode: Schema.optionalKey(Schema.Finite),
        requestId: Schema.optionalKey(Schema.String),
      }),
    ),
  }),
])

type StreamFailure = typeof StreamFailureSchema.Type
type StreamFailureEvent = Exclude<StreamFailure, string>

const streamFailureFields = (event: StreamFailureEvent | undefined) => {
  const errorCode = event?.code?.slice(0, 256)
  const httpStatus = event?.$metadata?.httpStatusCode
  const requestId = event?.$metadata?.requestId?.slice(0, 256)
  return Object.assign(
    {},
    errorCode === undefined ? undefined : { errorCode },
    httpStatus === undefined ? undefined : { httpStatus },
    requestId === undefined ? undefined : { requestId },
  )
}

const parsedStreamFailure = (value: StreamFailure | undefined) => {
  const isString = Schema.is(Schema.String)(value)
  const event = isString ? undefined : value
  return bedrockFailure("converseStream", {
    description: (isString ? value : (event?.message ?? "stream failed")).slice(0, 2_048),
    errorName: event?.name ?? "ModelStreamErrorException",
    ...streamFailureFields(event),
  })
}

const streamFailure = (cause: unknown) =>
  AiError.isAiError(cause)
    ? cause
    : parsedStreamFailure(Option.getOrUndefined(Schema.decodeUnknownOption(StreamFailureSchema)(cause)))

const registrationOptions = (input: Options) => {
  const required = {
    provider: "amazon-bedrock",
    model: input.model,
    layer: layerLanguageModel(input),
    classifyFailure,
    toolJsonSchemaCompiler,
    isAvailabilityFailure,
  }
  if (input.registrationKey !== undefined && input.metadata !== undefined) {
    return { ...required, registrationKey: input.registrationKey, metadata: input.metadata }
  }
  if (input.registrationKey !== undefined) return { ...required, registrationKey: input.registrationKey }
  if (input.metadata !== undefined) return { ...required, metadata: input.metadata }
  return required
}

/** @experimental */
export const make = Effect.fnUntraced(function* (input: Options) {
  const client = yield* Client
  const model = yield* LanguageModel.make({
    generateText: (options) =>
      makeBedrockRequest(input, options).pipe(
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
      makeBedrockRequest(input, options).pipe(
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
export const layerLanguageModel = (input: Options) => Layer.effect(LanguageModel.LanguageModel, make(input))
/** @experimental */
export const classifyFailure: FailureClassifier = classify
/** @experimental */
export const toolJsonSchemaCompiler: ToolJsonSchemaCompiler = (tool) =>
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
export const layer = (input: Options & { readonly client?: ClientOptions }): Layer.Layer<ModelRegistry, never, never> =>
  modelRegistryLayer([registration(registrationOptions(input))]).pipe(Layer.provide(layerClient(input.client)))
