import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai"
import { ModelRegistry } from "@batonfx/core"
import { Config, Effect, Layer, Redacted, Schema, Stream } from "effect"
import { AiError } from "effect/unstable/ai"
import {
  FetchHttpClient,
  Headers,
  HttpClient,
  HttpClientError,
  HttpClientRequest,
  type HttpClientResponse,
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

const contextOverflowCodes = new Set(["context_length_exceeded", "context_window_exceeded", "input_too_long"])

/** @experimental */
export const classifyFailure: ModelRegistry.FailureClassifier = (error) => {
  if (!AiError.isAiError(error)) return "other"
  const reason = error.reason
  if (reason._tag !== "InvalidRequestError" && reason._tag !== "UnknownError") return "other"
  const metadata = reason.metadata.openai
  if (metadata !== null && metadata !== undefined) {
    if (
      (metadata.errorCode !== null && contextOverflowCodes.has(metadata.errorCode)) ||
      (metadata.errorType !== null && contextOverflowCodes.has(metadata.errorType))
    ) {
      return "context-overflow"
    }
  }
  return reason._tag === "InvalidRequestError" &&
    /maximum context length|context length exceeded|input exceeds (?:the )?context window/i.test(
      reason.description ?? "",
    )
    ? "context-overflow"
    : "other"
}

/** @experimental */
export const openAi = (input: OpenAiInput) =>
  ModelRegistry.registrationFromLayer({
    provider: "openai",
    model: input.model,
    layer: OpenAiLanguageModel.layer({
      model: input.model,
      ...(input.config === undefined ? {} : { config: input.config }),
    }),
    classifyFailure,
    ...(input.registrationKey === undefined ? {} : { registrationKey: input.registrationKey }),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  })

/** @experimental */
export const openAiClientLayerConfig = OpenAiClient.layerConfig

/** @experimental */
export interface WithOpenAiOptions extends OpenAiInput {
  readonly apiKey: Config.Config<Redacted.Redacted<string>>
  readonly clientConfig?: Omit<NonNullable<Parameters<typeof OpenAiClient.layerConfig>[0]>, "apiKey">
}

/** @experimental */
export const withOpenAi = (options: WithOpenAiOptions) =>
  ModelRegistry.layerFromRegistrationEffects([openAi(options)]).pipe(
    Layer.provide(OpenAiClient.layerConfig({ ...options.clientConfig, apiKey: options.apiKey })),
  )

/** @experimental */
export const withOpenAiFetch = (options: WithOpenAiOptions) =>
  withOpenAi(options).pipe(Layer.provide(FetchHttpClient.layer))

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
      transformClient: accountClientTransform(credentials),
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
export const openAiAccount = (input: OpenAiAccountInput) =>
  ModelRegistry.registrationFromLayer({
    provider: "openai",
    model: input.model,
    layer: OpenAiLanguageModel.layer({
      model: input.model,
      ...(input.config === undefined ? {} : { config: input.config }),
    }).pipe(Layer.provide(openAiAccountClientLayer(input.credentials))),
    classifyFailure,
    ...(input.registrationKey === undefined ? {} : { registrationKey: input.registrationKey }),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  })

/** @experimental */
export const withOpenAiAccount = (input: OpenAiAccountInput) =>
  ModelRegistry.layerFromRegistrationEffects([openAiAccount(input)])

/** @experimental */
export const withOpenAiAccountFetch = (input: OpenAiAccountInput) =>
  withOpenAiAccount(input).pipe(Layer.provide(FetchHttpClient.layer))
