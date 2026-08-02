import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai"
import { ContextOverflow, ModelRegistry } from "@batonfx/core"
import type { ModelRegistryFacade } from "@batonfx/core"
import { Config, Effect, Function, Layer, Option, Redacted, Schema, Stream } from "effect"
import { AiError, OpenAiStructuredOutput, Tool } from "effect/unstable/ai"
import type { Credential, ServiceInterface } from "./openai-account-auth.js"
import { layerImageSources } from "../model/image-source.js"
import { type FailureInput, layerModelFailures } from "../model/model-failure.js"
import {
  FetchHttpClient,
  Headers,
  HttpClient,
  HttpClientError,
  HttpClientRequest,
  HttpClientResponse,
} from "effect/unstable/http"

const openAiAccountApiUrl = "https://chatgpt.com/backend-api/codex"
const openAiAccountResponsesUrl = `${openAiAccountApiUrl}/responses`
const openAiAccountIdHeader = "ChatGPT-Account-ID"

/** @experimental */
export interface RegistrationOptions {
  readonly registrationKey?: string
  readonly metadata?: ModelRegistry.Metadata
}

/** @experimental */
export interface OpenAiInput extends RegistrationOptions {
  readonly model: (string & {}) | OpenAiLanguageModel.Model
  readonly config?: Omit<typeof OpenAiLanguageModel.Config.Service, "model">
}

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const boundedDescription = (value: unknown, fallback: string): string =>
  typeof value === "string" && value.length > 0 ? value.slice(0, 2_048) : fallback

const boundedMetadata = (value: unknown): string | null => (typeof value === "string" ? value.slice(0, 256) : null)

const openAiRequestId = (metadata: FailureInput["metadata"]): string | null => {
  const openai = metadata.openai
  return isRecord(openai) ? boundedMetadata(openai.requestId) : null
}

const resolveOpenAiFailure = ({ error, metadata: partMetadata, method }: FailureInput): AiError.AiError => {
  if (AiError.isAiError(error)) return error
  const event = isRecord(error) ? error : undefined
  const code = boundedMetadata(event?.code)
  const message = boundedDescription(event?.message, "OpenAI response failed")
  const parameter = boundedMetadata(event?.param)
  const metadata = {
    openai: {
      errorCode: code,
      errorType: event?.type === "error" ? null : boundedMetadata(event?.type),
      requestId: openAiRequestId(partMetadata),
    },
  }
  const make = (reason: AiError.AiErrorReason) => AiError.make({ module: "OpenAiLanguageModel", method, reason })
  if (code !== null && serverFailureCodes.has(code)) {
    return make(AiError.InternalProviderError.make({ description: message, metadata }))
  }
  if (code !== null && rateLimitCodes.has(code)) {
    return make(
      AiError.RateLimitError.make({
        metadata: {
          openai: {
            ...metadata.openai,
            limit: null,
            remaining: null,
            resetRequests: null,
            resetTokens: null,
          },
        },
      }),
    )
  }
  if (code !== null && quotaCodes.has(code)) {
    return make(AiError.QuotaExhaustedError.make({ metadata }))
  }
  if (code !== null && authenticationCodes.has(code)) {
    return make(AiError.AuthenticationError.make({ kind: "InvalidKey", metadata }))
  }
  if (code !== null && permissionCodes.has(code)) {
    return make(AiError.AuthenticationError.make({ kind: "InsufficientPermissions", metadata }))
  }
  if (code !== null && contentPolicyCodes.has(code)) {
    return make(AiError.ContentPolicyError.make({ description: message, metadata }))
  }
  if (code === "context_length_exceeded" || (code !== null && invalidRequestCodes.has(code))) {
    return make(
      AiError.InvalidRequestError.make({
        description: message,
        ...(parameter === null ? {} : { parameter }),
        metadata,
      }),
    )
  }
  return make(AiError.UnknownError.make({ description: message, metadata }))
}

const openAiLanguageModelLayer = (input: OpenAiInput) =>
  layerModelFailures(
    layerImageSources(
      OpenAiLanguageModel.layer({
        model: input.model,
        ...(input.config === undefined ? {} : { config: input.config }),
      }),
    ),
    resolveOpenAiFailure,
  )

/** @experimental */
export const classifyFailure: ModelRegistry.FailureClassifier = ContextOverflow.classify

/** @experimental */
export const toolJsonSchemaCompiler: ModelRegistry.ToolJsonSchemaCompiler = (tool) =>
  Effect.try({
    try: () => Tool.getJsonSchema(tool, { transformer: OpenAiStructuredOutput.toCodecOpenAI }),
    catch: (error) =>
      AiError.make({
        module: "OpenAiLanguageModel",
        method: "prepareTools",
        reason: AiError.UnsupportedSchemaError.make({
          description: error instanceof Error ? error.message : String(error),
        }),
      }),
  })

/** @experimental */
export interface LayerOptions extends OpenAiInput {
  readonly apiKey: Config.Config<Redacted.Redacted<string>>
  readonly clientConfig?: Omit<NonNullable<Parameters<typeof OpenAiClient.layerConfig>[0]>, "apiKey">
}

/** @experimental */
export const layer = (
  input: LayerOptions,
): Layer.Layer<ModelRegistry.ModelRegistry, Config.ConfigError, HttpClient.HttpClient> =>
  ModelRegistry.layer([
    ModelRegistry.registration({
      provider: "openai",
      model: input.model,
      layer: openAiLanguageModelLayer(input),
      classifyFailure,
      toolJsonSchemaCompiler,
      ...(input.registrationKey === undefined ? {} : { registrationKey: input.registrationKey }),
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
    }),
  ]).pipe(Layer.provide(layerConfig({ ...input.clientConfig, apiKey: input.apiKey })))

/** @experimental Bare registration effect; the consumer provides the OpenAi client (see layerConfig). */
export const registration = (input: OpenAiInput): ReturnType<ModelRegistryFacade["registration"]> =>
  ModelRegistry.registration({
    provider: "openai",
    model: input.model,
    layer: openAiLanguageModelLayer(input),
    classifyFailure,
    toolJsonSchemaCompiler,
    ...(input.registrationKey === undefined ? {} : { registrationKey: input.registrationKey }),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  })

const stringifyJson = Schema.encodeSync(Schema.UnknownFromJsonString)
const parseJsonOption = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)
const dataLinePrefix = /^data: ?/
const frameSeparator = /(\r?\n\r?\n)/
const lineSeparator = /(\r?\n)/

const isResponsesUrl = (url: string) => url.split(/[?#]/)[0]!.replace(/\/+$/, "").endsWith("/responses")

const flattenErrorPayload = (payload: string): string | undefined => {
  const decoded = parseJsonOption(payload)
  if (Option.isNone(decoded) || !isRecord(decoded.value)) return undefined
  const record = decoded.value
  if (record.type === "error" && typeof record.message === "string" && "code" in record) return undefined
  const response = record.type === "response.failed" && isRecord(record.response) ? record.response : undefined
  if (record.type !== "error" && response === undefined) return undefined
  const details = response?.error ?? record.error
  if (!isRecord(details)) {
    if (response === undefined) return undefined
    return stringifyJson({
      type: "error",
      code: null,
      message: "OpenAI response failed",
      param: null,
      sequence_number: typeof record.sequence_number === "number" ? record.sequence_number : 0,
    })
  }
  const message = typeof details.message === "string" ? details.message : record.message
  return stringifyJson({
    type: "error",
    code: boundedMetadata(details.code) ?? boundedMetadata(details.type),
    message: boundedDescription(message, "OpenAI response failed"),
    param: boundedMetadata(details.param),
    sequence_number: typeof record.sequence_number === "number" ? record.sequence_number : 0,
  })
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
export const normalizeResponsesSse = (client: HttpClient.HttpClient): HttpClient.HttpClient =>
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
export const layerConfig = (options?: Parameters<typeof OpenAiClient.layerConfig>[0]) =>
  OpenAiClient.layerConfig({
    ...options,
    transformClient: (client) =>
      options?.transformClient === undefined
        ? normalizeResponsesSse(client)
        : client.pipe(normalizeResponsesSse, options.transformClient),
  })

/** @experimental */
export interface OpenAiAccountCredential {
  readonly accessToken: Redacted.Redacted<string>
  readonly accountId: string
  readonly generation: string
}

/** @experimental */
export class OpenAiAccountCredentialError extends Schema.TaggedErrorClass<OpenAiAccountCredentialError>()(
  "@batonfx/providers/OpenAiAccountCredentialError",
  {
    operation: Schema.Literals(["acquire", "refreshRejected"]),
  },
) {}

/** @experimental */
export interface OpenAiAccountCredentials {
  readonly acquire: Effect.Effect<OpenAiAccountCredential, OpenAiAccountCredentialError>
  readonly refreshRejected: (generation: string) => Effect.Effect<OpenAiAccountCredential, OpenAiAccountCredentialError>
}

/** @experimental */
const credentialsFromAccountAuthImpl = (
  service: ServiceInterface,
  expectedFingerprint: string,
): OpenAiAccountCredentials => {
  const mapCredential = (operation: OpenAiAccountCredentialError["operation"]) =>
    Effect.mapError(() => OpenAiAccountCredentialError.make({ operation }))
  const accountCredential = (operation: OpenAiAccountCredentialError["operation"]) =>
    Effect.flatMap((credential: Credential) =>
      credential.fingerprint === expectedFingerprint
        ? Effect.succeed({
            accessToken: credential.accessToken,
            accountId: Redacted.value(credential.accountId),
            generation: credential.generation,
          })
        : Effect.fail(OpenAiAccountCredentialError.make({ operation })),
    )
  return {
    acquire: service.acquire.pipe(accountCredential("acquire"), mapCredential("acquire")),
    refreshRejected: (generation) =>
      service.refreshRejected(generation).pipe(accountCredential("refreshRejected"), mapCredential("refreshRejected")),
  }
}

/** @experimental */
export const credentialsFromAccountAuth: {
  (service: ServiceInterface, expectedFingerprint: string): OpenAiAccountCredentials
  (expectedFingerprint: string): (service: ServiceInterface) => OpenAiAccountCredentials
} = Function.dual(2, credentialsFromAccountAuthImpl)

/** @experimental */
export interface OpenAiAccountInput extends RegistrationOptions {
  readonly model: (string & {}) | OpenAiLanguageModel.Model
  readonly credentials: OpenAiAccountCredentials
  readonly config?: Omit<typeof OpenAiLanguageModel.Config.Service, "model">
}

const credentialFailure = (request: HttpClientRequest.HttpClientRequest, error: OpenAiAccountCredentialError) =>
  new HttpClientError.HttpClientError({
    reason: new HttpClientError.TransportError({
      request,
      cause: error,
      description: `OpenAI account credential ${error.operation} failed`,
    }),
  })

const withCredential = (request: HttpClientRequest.HttpClientRequest, credential: OpenAiAccountCredential) => {
  const body = request.body
  const streaming =
    body._tag === "Uint8Array" &&
    body.contentType === "application/json" &&
    new TextDecoder().decode(body.body).includes('"stream":true')

  return request.pipe(
    HttpClientRequest.setUrl(openAiAccountResponsesUrl),
    HttpClientRequest.bearerToken(credential.accessToken),
    HttpClientRequest.setHeader(openAiAccountIdHeader, credential.accountId),
    HttpClientRequest.accept(streaming ? "text/event-stream" : "application/json"),
  )
}

const executeWithCredential = (
  client: HttpClient.HttpClient,
  request: HttpClientRequest.HttpClientRequest,
  credential: OpenAiAccountCredential,
): Effect.Effect<HttpClientResponse.HttpClientResponse, HttpClientError.HttpClientError> =>
  client.postprocess(Effect.succeed(withCredential(request, credential))).pipe(
    Effect.provideService(FetchHttpClient.RequestInit, { redirect: "error" }),
    Effect.updateService(Headers.CurrentRedactedNames, (names) => [...names, openAiAccountIdHeader]),
  )

const accountClientTransform = (credentials: OpenAiAccountCredentials) => (client: HttpClient.HttpClient) =>
  HttpClient.transform(client, (_, request) =>
    credentials.acquire.pipe(
      Effect.mapError((error) => credentialFailure(request, error)),
      Effect.flatMap((credential) =>
        executeWithCredential(client, request, credential).pipe(
          Effect.catchIf(
            (error) => error.reason._tag === "StatusCodeError" && error.reason.response.status === 401,
            (error) => {
              if (error.reason._tag !== "StatusCodeError") return Effect.fail(error)
              return Stream.runDrain(error.reason.response.stream).pipe(
                Effect.ignore,
                Effect.andThen(credentials.refreshRejected(credential.generation)),
                Effect.mapError((credentialError) => credentialFailure(request, credentialError)),
                Effect.flatMap((refreshed) => executeWithCredential(client, request, refreshed)),
              )
            },
          ),
        ),
      ),
    ),
  )

const withAccountHeaderRedaction = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.updateService(Headers.CurrentRedactedNames, (names) => [...names, openAiAccountIdHeader]))

const withoutOpenAiSocket = <A, E>(effect: Effect.Effect<A, E>) =>
  effect.pipe(Effect.provideService(OpenAiClient.OpenAiSocket, null as never))

const openAiAccountClientLayer = (credentials: OpenAiAccountCredentials) =>
  Layer.effect(
    OpenAiClient.OpenAiClient,
    OpenAiClient.make({
      apiUrl: openAiAccountApiUrl,
      transformClient: (client) => client.pipe(normalizeResponsesSse, accountClientTransform(credentials)),
    }).pipe(
      Effect.map((client) =>
        OpenAiClient.OpenAiClient.of({
          client: client.client,
          createResponse: (options) => withAccountHeaderRedaction(client.createResponse(options)),
          createResponseStream: (options) =>
            client.createResponseStream(options).pipe(
              withoutOpenAiSocket,
              withAccountHeaderRedaction,
              Effect.map(
                ([response, stream]) =>
                  [
                    response,
                    stream.pipe(
                      Stream.updateService(Headers.CurrentRedactedNames, (names) => [...names, openAiAccountIdHeader]),
                    ),
                  ] as const,
              ),
            ),
          createEmbedding: (options) => withAccountHeaderRedaction(client.createEmbedding(options)),
        }),
      ),
    ),
  )

/** @experimental */
/** @experimental Bare registration effect with the account-credential client bundled into the model layer. */
export const registrationAccount = (input: OpenAiAccountInput): ReturnType<ModelRegistryFacade["registration"]> =>
  ModelRegistry.registration({
    provider: "openai",
    model: input.model,
    layer: openAiLanguageModelLayer(input).pipe(Layer.provide(openAiAccountClientLayer(input.credentials))),
    classifyFailure,
    toolJsonSchemaCompiler,
    ...(input.registrationKey === undefined ? {} : { registrationKey: input.registrationKey }),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  })

export const layerAccount = (
  input: OpenAiAccountInput,
): Layer.Layer<ModelRegistry.ModelRegistry, Config.ConfigError, HttpClient.HttpClient> =>
  ModelRegistry.layer([registrationAccount(input)]) as Layer.Layer<
    ModelRegistry.ModelRegistry,
    Config.ConfigError,
    HttpClient.HttpClient
  >
