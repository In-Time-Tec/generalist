import {
  OpenAiClient as OpenAIClient,
  OpenAiLanguageModel as OpenAILanguageModel,
  OpenAiSchema as OpenAISchema,
} from "@effect/ai-openai"
import { classify } from "../../core/model/result/context-overflow.js"
import {
  type FailureClassifier,
  type ModelRegistry,
  type Registration,
  type ToolJsonSchemaCompiler,
  layer as modelRegistryLayer,
  registration as modelRegistration,
} from "../../core/model/registry.js"
import { Config, Effect, Layer, Option, Redacted, Schema, Stream } from "effect"
import { AiError, OpenAiStructuredOutput as OpenAIStructuredOutput, Tool } from "effect/unstable/ai"
import { layerImageSources } from "../model/image-source.js"
import { type FailureInput, isAvailabilityFailure, layerModelFailures } from "../model/failure.js"
import { HttpClient, HttpClientResponse } from "effect/unstable/http"
import type { RegistrationOptions } from "../model/registration.js"
import { registration as registerDeterministic } from "./deterministic.js"

/** @experimental */
export type { RegistrationOptions } from "../model/registration.js"

/** @experimental */
export interface Options extends RegistrationOptions {
  readonly model: (string & {}) | OpenAILanguageModel.Model
  readonly config?: Config
}

/** @experimental */
export type Config = Omit<typeof OpenAILanguageModel.Config.Service, "model">

const {
  input: _input,
  model: _model,
  stream: _stream,
  text: _text,
  tool_choice: _toolChoice,
  tools: _tools,
  ...openAiConfigFields
} = OpenAISchema.CreateResponse.fields

const ConfigSchema = Schema.Struct({
  ...openAiConfigFields,
  fileIdPrefixes: Schema.optionalKey(Schema.Array(Schema.String)),
  text: Schema.optionalKey(
    Schema.Struct({ verbosity: Schema.optionalKey(Schema.Literals(["low", "medium", "high"])) }),
  ),
  strictJsonSchema: Schema.optionalKey(Schema.Boolean),
})

/** @experimental Decodes persisted provider options into OpenAI request configuration. */
const decodeConfigInput = Schema.decodeUnknownEffect(Schema.NullOr(ConfigSchema), { onExcessProperty: "error" })
type ConfigInput = typeof Schema.Unknown.Type

export const decodeConfig = (options: ConfigInput): Effect.Effect<Config, Schema.SchemaError> =>
  decodeConfigInput(options ?? null).pipe(Effect.map((config) => config ?? {}))

const serverFailureCodes = new Set([
  "internal_server_error",
  "server_error",
  "server_is_overloaded",
  "service_unavailable",
  "service_unavailable_error",
  "vector_store_timeout",
])
const rateLimitCodes = new Set(["rate_limit_error", "rate_limit_exceeded", "requests_limit_exceeded"])
const quotaCodes = new Set(["billing_hard_limit_reached", "insufficient_quota", "quota_exceeded"])
const authenticationCodes = new Set(["authentication_error", "invalid_api_key", "invalid_api_key_error"])
const permissionCodes = new Set(["insufficient_permissions", "permission_denied", "permission_error"])
const contentPolicyCodes = new Set(["content_filter", "content_policy_violation", "image_content_policy_violation"])
const invalidRequestCodes = new Set([
  "empty_image_file",
  "failed_to_download_image",
  "image_file_not_found",
  "image_file_too_large",
  "image_parse_error",
  "image_too_large",
  "image_too_small",
  "invalid_base64_image",
  "invalid_image",
  "invalid_image_format",
  "invalid_image_mode",
  "invalid_image_url",
  "invalid_prompt",
  "invalid_request_error",
  "unsupported_image_media_type",
])

const NullableString = Schema.NullOr(Schema.String)
const OpenAIErrorPayload = Schema.Struct({
  code: Schema.optionalKey(NullableString),
  message: Schema.optionalKey(Schema.String),
  param: Schema.optionalKey(NullableString),
  type: Schema.optionalKey(NullableString),
})
const decodeOpenAIError = Schema.decodeUnknownOption(OpenAIErrorPayload)

type OpenAIErrorPayload = typeof OpenAIErrorPayload.Type

const boundedDescription = (value: string | undefined, fallback: string): string =>
  value !== undefined && value.length > 0 ? value.slice(0, 2_048) : fallback

const boundedMetadata = (value: string | null | undefined): string | null => value?.slice(0, 256) ?? null

const openAiRequestId = (metadata: FailureInput["metadata"]): string | null => {
  const decoded = Schema.decodeUnknownOption(Schema.Struct({ requestId: Schema.optionalKey(Schema.String) }))(
    metadata.openai,
  )
  return Option.isSome(decoded) ? boundedMetadata(decoded.value.requestId) : null
}

const openAiReasonForCode = (
  code: string,
  message: string,
  parameter: string | null,
  metadata: {
    readonly openai: {
      readonly errorCode: string
      readonly errorType: string | null
      readonly requestId: string | null
    }
  },
): AiError.AiErrorReason | undefined => {
  if (serverFailureCodes.has(code)) return AiError.InternalProviderError.make({ description: message, metadata })
  if (rateLimitCodes.has(code)) {
    return AiError.RateLimitError.make({
      metadata: {
        openai: { ...metadata.openai, limit: null, remaining: null, resetRequests: null, resetTokens: null },
      },
    })
  }
  if (quotaCodes.has(code)) return AiError.QuotaExhaustedError.make({ metadata })
  if (authenticationCodes.has(code)) return AiError.AuthenticationError.make({ kind: "InvalidKey", metadata })
  if (permissionCodes.has(code)) {
    return AiError.AuthenticationError.make({ kind: "InsufficientPermissions", metadata })
  }
  if (contentPolicyCodes.has(code)) return AiError.ContentPolicyError.make({ description: message, metadata })
  if (code === "context_length_exceeded" || invalidRequestCodes.has(code)) {
    return AiError.InvalidRequestError.make(
      parameter === null ? { description: message, metadata } : { description: message, parameter, metadata },
    )
  }
  return undefined
}

/** @internal Classify one decoded OpenAI error payload; shared by every OpenAI transport. */
export const openAiFailureReason = ({
  error,
  requestId,
}: {
  readonly error: FailureInput["error"]
  readonly requestId: string | null
}): AiError.AiErrorReason => {
  const decoded = decodeOpenAIError(error)
  const event: OpenAIErrorPayload = Option.isSome(decoded) ? decoded.value : {}
  const code = boundedMetadata(event?.code)
  const message = boundedDescription(event?.message, "OpenAI response failed")
  const parameter = boundedMetadata(event?.param)
  const metadata = {
    openai: {
      errorCode: code,
      errorType: event?.type === "error" ? null : boundedMetadata(event?.type),
      requestId,
    },
  }
  if (code !== null) {
    const classifiedMetadata = { openai: { ...metadata.openai, errorCode: code } }
    return (
      openAiReasonForCode(code, message, parameter, classifiedMetadata) ??
      AiError.UnknownError.make({ description: message, metadata: classifiedMetadata })
    )
  }
  return AiError.UnknownError.make({ description: message, metadata })
}

const resolveOpenAIFailure = ({ error, metadata: partMetadata, method }: FailureInput): AiError.AiError =>
  AiError.isAiError(error)
    ? error
    : AiError.make({
        module: "OpenAILanguageModel",
        method,
        reason: openAiFailureReason({ error, requestId: openAiRequestId(partMetadata) }),
      })

/** @internal Shared by the API-key and account registrations. */
export const openAiLanguageModelLayer = (input: Options) =>
  layerModelFailures(
    layerImageSources(
      OpenAILanguageModel.layer(
        input.config === undefined ? { model: input.model } : { model: input.model, config: input.config },
      ),
    ),
    resolveOpenAIFailure,
  )

/** @experimental */
export const classifyFailure: FailureClassifier = classify

/** @experimental */
export const toolJsonSchemaCompiler: ToolJsonSchemaCompiler = (tool) =>
  Effect.try({
    try: () => Tool.getJsonSchema(tool, { transformer: OpenAIStructuredOutput.toCodecOpenAI }),
    catch: (error) =>
      AiError.make({
        module: "OpenAILanguageModel",
        method: "prepareTools",
        reason: AiError.UnsupportedSchemaError.make({
          description: error instanceof Error ? error.message : String(error),
        }),
      }),
  })

/** @experimental */
export interface ClientOptions extends Options {
  readonly apiKey: Config.Config<Redacted.Redacted<string>>
  readonly clientConfig?: Omit<NonNullable<Parameters<typeof OpenAIClient.layerConfig>[0]>, "apiKey">
}

/** @experimental */
export const layer = (input: ClientOptions): Layer.Layer<ModelRegistry, Config.ConfigError, HttpClient.HttpClient> =>
  modelRegistryLayer([modelRegistration(registrationOptions(input))]).pipe(
    Layer.provide(layerConfig({ ...input.clientConfig, apiKey: input.apiKey })),
  )

/** @experimental Bare registration effect; the consumer provides the OpenAI client (see layerConfig). */
export const registration = (input: Options): Effect.Effect<Registration, never, OpenAIClient.OpenAiClient> =>
  modelRegistration(registrationOptions(input))

const registrationOptions = (input: Options) => {
  const required = {
    provider: "openai",
    model: input.model,
    layer: openAiLanguageModelLayer(input),
    classifyFailure,
    toolJsonSchemaCompiler,
    isAvailabilityFailure,
  } as const
  if (input.registrationKey === undefined) {
    return input.metadata === undefined ? required : { ...required, metadata: input.metadata }
  }
  return input.metadata === undefined
    ? { ...required, registrationKey: input.registrationKey }
    : { ...required, registrationKey: input.registrationKey, metadata: input.metadata }
}

const stringifyJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))
const parseJsonOption = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Unknown))
const SseErrorPayload = Schema.Struct({
  code: Schema.optionalKey(NullableString),
  error: Schema.optionalKey(OpenAIErrorPayload),
  message: Schema.optionalKey(Schema.String),
  response: Schema.optionalKey(Schema.Struct({ error: Schema.optionalKey(OpenAIErrorPayload) })),
  sequence_number: Schema.optionalKey(Schema.Finite),
  type: Schema.optionalKey(Schema.String),
})
const decodeSseErrorPayload = Schema.decodeUnknownOption(SseErrorPayload)
const dataLinePrefix = /^data: ?/
const frameSeparator = /(\r?\n\r?\n)/
const lineSeparator = /(\r?\n)/

const isResponsesUrl = (url: string) => url.split(/[?#]/)[0]!.replace(/\/+$/, "").endsWith("/responses")

const stringifyFlattenedError = (
  details: OpenAIErrorPayload,
  message: string | undefined,
  sequenceNumber: number,
): string =>
  stringifyJson({
    type: "error",
    code: boundedMetadata(details.code) ?? boundedMetadata(details.type),
    message: boundedDescription(details.message ?? message, "OpenAI response failed"),
    param: boundedMetadata(details.param),
    sequence_number: sequenceNumber,
  })

const flattenErrorPayload = (payload: string): string | undefined => {
  const decoded = parseJsonOption(payload)
  if (Option.isNone(decoded)) return undefined
  const parsed = decodeSseErrorPayload(decoded.value)
  if (Option.isNone(parsed)) return undefined
  const record = parsed.value
  if (record.type === "error" && record.message !== undefined && record.code !== undefined) return undefined
  const response = record.type === "response.failed" ? record.response : undefined
  if (record.type !== "error" && response === undefined) return undefined
  const details = response?.error ?? record.error
  if (details === undefined) {
    if (response === undefined) return undefined
    return stringifyJson({
      type: "error",
      code: null,
      message: "OpenAI response failed",
      param: null,
      sequence_number: record.sequence_number ?? 0,
    })
  }
  return stringifyFlattenedError(details, record.message, record.sequence_number ?? 0)
}

const rewriteFrame = (frame: string): string => {
  const segments = frame.split(lineSeparator)
  const dataIndexes: Array<number> = []
  for (let index = 0; index < segments.length; index += 2) {
    if (dataLinePrefix.test(segments[index] ?? "")) dataIndexes.push(index)
  }
  if (dataIndexes.length === 0) return frame
  const payload = dataIndexes.map((index) => segments[index]!.replace(dataLinePrefix, "")).join("\n")
  const flattened = flattenErrorPayload(payload)
  if (flattened === undefined) return frame
  const prefix = segments[dataIndexes[0]!]!.match(dataLinePrefix)![0]
  const separator = segments[1] ?? "\n"
  const rewritten: Array<string> = []
  for (let index = 0; index < segments.length; index += 2) {
    if (index === dataIndexes[0]) rewritten.push(`${prefix}${flattened}`)
    else if (!dataLinePrefix.test(segments[index] ?? "")) rewritten.push(segments[index]!)
  }
  return rewritten.join(separator)
}

const normalizeSseErrorFrames = <E>(body: Stream.Stream<Uint8Array, E>): Stream.Stream<Uint8Array, E> =>
  body.pipe(
    Stream.decodeText(),
    Stream.mapAccum(
      () => "",
      (buffer: string, chunk: string) => {
        const pieces = (buffer + chunk).split(frameSeparator)
        const tail = pieces.length % 2 === 1 ? pieces.pop()! : ""
        const output: Array<string> = []
        for (let index = 0; index < pieces.length; index += 2) {
          output.push(rewriteFrame(pieces[index]!) + pieces[index + 1]!)
        }
        return [tail, output] as const
      },
      { onHalt: (buffer) => (buffer.length === 0 ? [] : [rewriteFrame(buffer)]) },
    ),
    Stream.encodeText,
  )

/** @experimental */
export const normalizeResponsesSSE = (client: HttpClient.HttpClient): HttpClient.HttpClient =>
  HttpClient.transformResponse(client, (effect) =>
    Effect.map(effect, (response) => {
      if (!isResponsesUrl(response.request.url)) return response
      return HttpClientResponse.fromWeb(
        response.request,
        new Response(Stream.toReadableStream(normalizeSseErrorFrames(response.stream)), {
          status: response.status,
          headers: { ...response.headers },
        }),
      )
    }),
  )

/** @experimental */
export const layerConfig = (options?: Parameters<typeof OpenAIClient.layerConfig>[0]) =>
  OpenAIClient.layerConfig({
    ...options,
    transformClient: (client) =>
      options?.transformClient === undefined
        ? normalizeResponsesSSE(client)
        : client.pipe(normalizeResponsesSSE, options.transformClient),
  })

/** @experimental */
export interface DeterministicFallbackOptions extends ClientOptions {
  readonly fallbackModel: string
  readonly fallbackProvider?: string
}

const fallbackRegistrationOptions = (options: DeterministicFallbackOptions) => {
  const required = { model: options.model }
  const configured = options.config === undefined ? required : { ...required, config: options.config }
  const registered =
    options.registrationKey === undefined ? configured : { ...configured, registrationKey: options.registrationKey }
  return options.metadata === undefined ? registered : { ...registered, metadata: options.metadata }
}

/** @experimental Selects OpenAI when its configured API key is present, otherwise the deterministic model. */
export const layerOrDeterministic = (options: DeterministicFallbackOptions) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const deterministic = yield* registerDeterministic({
        provider: options.fallbackProvider ?? "deterministic",
        model: options.fallbackModel,
      })
      const configuredApiKey = yield* Config.option(options.apiKey)
      const openAiRegistration = yield* Option.match(configuredApiKey, {
        onNone: () => Effect.succeedNone,
        onSome: (apiKey) =>
          Layer.build(OpenAIClient.layerConfig({ ...options.clientConfig, apiKey: Config.succeed(apiKey) })).pipe(
            Effect.flatMap((context) =>
              registration(fallbackRegistrationOptions(options)).pipe(Effect.provide(context)),
            ),
            Effect.asSome,
          ),
      })
      return modelRegistryLayer([
        Effect.succeed(deterministic),
        ...(Option.isSome(openAiRegistration) ? [Effect.succeed(openAiRegistration.value)] : []),
      ])
    }),
  )
