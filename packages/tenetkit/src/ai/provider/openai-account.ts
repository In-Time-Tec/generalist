import { OpenAiClient as OpenAIClient, type OpenAiSchema as OpenAISchema } from "@effect/ai-openai"
import { ModelRegistry } from "../../core/index.js"
import { Effect, Function, Layer, Redacted, Schema, Stream } from "effect"
import { AiError } from "effect/unstable/ai"
import type { Credential, AuthService } from "./openai-account-auth.js"
import {
  type Config,
  type RegistrationOptions,
  classifyFailure,
  normalizeResponsesSSE,
  openAiFailureReason,
  openAiLanguageModelLayer,
  toolJsonSchemaCompiler,
} from "./openai.js"
import { isAvailabilityFailure } from "../model/failure.js"
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
export interface OpenAIAccountCredential {
  readonly accessToken: Redacted.Redacted<string>
  readonly accountId: string
  readonly generation: string
}

/** @experimental */
export class OpenAIAccountCredentialError extends Schema.TaggedError<OpenAIAccountCredentialError>()(
  "tenetkit/ai/OpenAIAccountCredentialError",
  {
    operation: Schema.Literals(["acquire", "refreshRejected"]),
  },
) {}

/** @experimental */
export interface OpenAIAccountCredentials {
  readonly acquire: Effect.Effect<OpenAIAccountCredential, OpenAIAccountCredentialError>
  readonly refreshRejected: (generation: string) => Effect.Effect<OpenAIAccountCredential, OpenAIAccountCredentialError>
}

const credentialsFromAccountAuthImpl = (
  service: AuthService,
  expectedFingerprint: string,
): OpenAIAccountCredentials => {
  const mapCredential = (operation: OpenAIAccountCredentialError["operation"]) =>
    Effect.mapError(() => OpenAIAccountCredentialError.make({ operation }))
  const accountCredential = (operation: OpenAIAccountCredentialError["operation"]) =>
    Effect.flatMap((credential: Credential) =>
      credential.fingerprint === expectedFingerprint
        ? Effect.succeed({
            accessToken: credential.accessToken,
            accountId: Redacted.value(credential.accountId),
            generation: credential.generation,
          })
        : Effect.fail(OpenAIAccountCredentialError.make({ operation })),
    )
  return {
    acquire: service.acquire.pipe(accountCredential("acquire"), mapCredential("acquire")),
    refreshRejected: (generation) =>
      service.refreshRejected(generation).pipe(accountCredential("refreshRejected"), mapCredential("refreshRejected")),
  }
}

/** @experimental */
export const credentialsFromAccountAuth: {
  (service: AuthService, expectedFingerprint: string): OpenAIAccountCredentials
  (expectedFingerprint: string): (service: AuthService) => OpenAIAccountCredentials
} = Function.dual(2, credentialsFromAccountAuthImpl)

/** @experimental */
export interface AccountOptions extends RegistrationOptions {
  readonly model: (string & {}) | OpenAILanguageModelModel
  readonly credentials: OpenAIAccountCredentials
  readonly config?: Config
}

type OpenAILanguageModelModel = Parameters<typeof openAiLanguageModelLayer>[0]["model"]

const credentialFailure = (request: HttpClientRequest.HttpClientRequest, error: OpenAIAccountCredentialError) =>
  new HttpClientError.HttpClientError({
    reason: new HttpClientError.TransportError({
      request,
      cause: error,
      description: `OpenAI account credential ${error.operation} failed`,
    }),
  })

const withCredential = (request: HttpClientRequest.HttpClientRequest, credential: OpenAIAccountCredential) =>
  request.pipe(
    HttpClientRequest.setUrl(openAiAccountResponsesUrl),
    HttpClientRequest.bearerToken(credential.accessToken),
    HttpClientRequest.setHeader(openAiAccountIdHeader, credential.accountId),
    HttpClientRequest.accept("text/event-stream"),
  )

const executeWithCredential = (
  client: HttpClient.HttpClient,
  request: HttpClientRequest.HttpClientRequest,
  credential: OpenAIAccountCredential,
): Effect.Effect<HttpClientResponse.HttpClientResponse, HttpClientError.HttpClientError> =>
  client.postprocess(Effect.succeed(withCredential(request, credential))).pipe(
    Effect.provideService(FetchHttpClient.RequestInit, { redirect: "error" }),
    Effect.updateService(Headers.CurrentRedactedNames, (names) => [...names, openAiAccountIdHeader]),
  )

const accountClientTransform = (credentials: OpenAIAccountCredentials) => (client: HttpClient.HttpClient) =>
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

const withoutOpenAISocket = <A, E>(effect: Effect.Effect<A, E>) =>
  effect.pipe(Effect.provideService(OpenAIClient.OpenAiSocket, undefined!))

const accountError = (method: string, reason: AiError.AiErrorReason) =>
  AiError.make({ module: "OpenAIClient", method, reason })

type ResponseStreamEvent = OpenAISchema.ResponseStreamEvent
type FoldedResponse = OpenAISchema.Response
type TerminalEvent = Extract<ResponseStreamEvent, { readonly type: "response.completed" | "response.incomplete" }>

const isTerminalEvent = (event: ResponseStreamEvent): event is TerminalEvent =>
  event.type === "response.completed" || event.type === "response.incomplete"

/**
 * `normalizeResponsesSSE` has already flattened nested `response.failed` payloads into flat `error`
 * frames by the time the stream is folded, so only `error` needs promotion here.
 */
const terminalResponse = (event: ResponseStreamEvent): FoldedResponse | undefined =>
  isTerminalEvent(event) ? event.response : undefined

/**
 * The account Responses endpoint rejects any request body without `stream: true`, so the
 * non-streaming `createResponse` contract is satisfied by folding the terminal stream event.
 * `response.completed` and `response.incomplete` carry a payload that is schema-identical to a
 * non-streaming `Response`.
 */
const foldedCreateResponse =
  (client: OpenAIClient.Service): OpenAIClient.Service["createResponse"] =>
  (options) => {
    const { stream: _stream, ...payload } = options
    return client.createResponseStream(payload).pipe(
      withoutOpenAISocket,
      Effect.flatMap(([response, events]) =>
        events.pipe(
          Stream.mapEffect(
            (event): Effect.Effect<FoldedResponse | undefined, AiError.AiError> =>
              event.type === "error"
                ? Effect.fail(accountError("createResponse", openAiFailureReason({ error: event, requestId: null })))
                : Effect.succeed(terminalResponse(event)),
          ),
          Stream.runFold(
            (): FoldedResponse | undefined => undefined,
            (found, current) => found ?? current,
          ),
          Effect.flatMap((folded) =>
            folded === undefined
              ? Effect.fail(
                  accountError(
                    "createResponse",
                    AiError.InvalidOutputError.make({
                      description: "OpenAI account response stream ended without a terminal event",
                    }),
                  ),
                )
              : Effect.succeed([folded, response] as const),
          ),
        ),
      ),
    )
  }

/** The account backend exposes no embeddings endpoint; every request URL is rewritten to Responses. */
const unsupportedCreateEmbedding: OpenAIClient.Service["createEmbedding"] = () =>
  Effect.fail(
    accountError(
      "createEmbedding",
      AiError.InvalidRequestError.make({
        description: "The OpenAI account endpoint does not support embeddings",
      }),
    ),
  )

/** @experimental */
export const layerAccountClient = (credentials: OpenAIAccountCredentials) =>
  Layer.effect(
    OpenAIClient.OpenAiClient,
    OpenAIClient.make({
      apiUrl: openAiAccountApiUrl,
      transformClient: (client) => client.pipe(normalizeResponsesSSE, accountClientTransform(credentials)),
    }).pipe(
      Effect.map((client) =>
        OpenAIClient.OpenAiClient.of({
          client: client.client,
          createResponse: (options) => withAccountHeaderRedaction(foldedCreateResponse(client)(options)),
          createResponseStream: (options) =>
            client.createResponseStream(options).pipe(
              withoutOpenAISocket,
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
          createEmbedding: unsupportedCreateEmbedding,
        }),
      ),
    ),
  )

/** @experimental Bare registration effect with the account-credential client bundled into the model layer. */
export const registrationAccount = (
  input: AccountOptions,
): Effect.Effect<ModelRegistry.Registration, never, HttpClient.HttpClient> =>
  ModelRegistry.registration(registrationOptions(input))

const registrationOptions = (input: AccountOptions) => {
  const required = {
    provider: "openai",
    model: input.model,
    layer: openAiLanguageModelLayer(input).pipe(Layer.provide(layerAccountClient(input.credentials))),
    classifyFailure,
    toolJsonSchemaCompiler,
    isAvailabilityFailure,
  } as const
  const registered =
    input.registrationKey === undefined ? required : { ...required, registrationKey: input.registrationKey }
  return input.metadata === undefined ? registered : { ...registered, metadata: input.metadata }
}

/** @experimental */
export const layerAccount = (
  input: AccountOptions,
): Layer.Layer<ModelRegistry.ModelRegistry, never, HttpClient.HttpClient> =>
  ModelRegistry.layer([registrationAccount(input)])
