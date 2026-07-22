import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai"
import { ModelRegistry } from "@batonfx/core"
import { Config, Effect, Function, Layer, Option, Redacted, Schema, Stream } from "effect"
import { AiError } from "effect/unstable/ai"
import type { Credential, ServiceInterface } from "./openai-account-auth.js"
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

const contextOverflowCodes = new Set(["context_length_exceeded", "context_window_exceeded", "input_too_long"])

const responseErrorCode = (error: unknown): string | undefined => {
  if (typeof error !== "object" || error === null || Array.isArray(error)) return undefined
  const event = error as Record<string, unknown>
  if (event.type !== "error") return undefined
  if (typeof event.code === "string") return event.code
  const details = event.error
  if (typeof details !== "object" || details === null || Array.isArray(details)) return undefined
  const code = (details as Record<string, unknown>).code
  return typeof code === "string" ? code : undefined
}

/** @experimental */
export const classifyFailure: ModelRegistry.FailureClassifier = (error) => {
  const eventCode = responseErrorCode(error)
  if (eventCode !== undefined && contextOverflowCodes.has(eventCode)) return "context-overflow"
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
export interface LayerOptions extends OpenAiInput {
  readonly apiKey: Config.Config<Redacted.Redacted<string>>
  readonly clientConfig?: Omit<NonNullable<Parameters<typeof OpenAiClient.layerConfig>[0]>, "apiKey">
}

/** @experimental */
export const layer = (input: LayerOptions) =>
  ModelRegistry.layer([
    ModelRegistry.registration({
      provider: "openai",
      model: input.model,
      layer: OpenAiLanguageModel.layer({
        model: input.model,
        ...(input.config === undefined ? {} : { config: input.config }),
      }),
      classifyFailure,
      ...(input.registrationKey === undefined ? {} : { registrationKey: input.registrationKey }),
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
    }),
  ]).pipe(Layer.provide(layerConfig({ ...input.clientConfig, apiKey: input.apiKey })))

/** @experimental Bare registration effect; the consumer provides the OpenAi client (see layerConfig). */
export const registration = (input: OpenAiInput) =>
  ModelRegistry.registration({
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

const stringifyJson = Schema.encodeSync(Schema.UnknownFromJsonString)
const parseJsonOption = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)
const dataLinePrefix = /^data: ?/
const frameSeparator = /(\r?\n\r?\n)/
const lineSeparator = /(\r?\n)/

const isResponsesUrl = (url: string) => url.split(/[?#]/)[0]!.replace(/\/+$/, "").endsWith("/responses")

const flattenErrorPayload = (payload: string): string | undefined => {
  const decoded = parseJsonOption(payload)
  if (Option.isNone(decoded) || typeof decoded.value !== "object" || decoded.value === null) return undefined
  const record = decoded.value as Record<string, unknown>
  if (record.type !== "error" || record.message !== undefined) return undefined
  const details = record.error
  if (typeof details !== "object" || details === null || Array.isArray(details)) return undefined
  const nested = details as Record<string, unknown>
  return stringifyJson({
    type: "error",
    code: typeof nested.code === "string" ? nested.code : null,
    message: typeof nested.message === "string" ? nested.message : stringifyJson(nested),
    param: typeof nested.param === "string" ? nested.param : null,
    sequence_number: typeof record.sequence_number === "number" ? record.sequence_number : 0,
  })
}

const rewriteFrame = (frame: string): string => {
  const segments = frame.split(lineSeparator)
  const dataIndexes: Array<number> = []
  for (let index = 0; index < segments.length; index += 2) {
    if (dataLinePrefix.test(segments[index] ?? "")) dataIndexes.push(index)
  }
  if (dataIndexes.length !== 1) return frame
  const line = segments[dataIndexes[0]!]!
  const prefix = line.match(dataLinePrefix)![0]
  const flattened = flattenErrorPayload(line.slice(prefix.length))
  if (flattened === undefined) return frame
  segments[dataIndexes[0]!] = `${prefix}${flattened}`
  return segments.join("")
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
      const contentType = String(response.headers["content-type"] ?? "")
      if (!contentType.includes("text/event-stream") || !isResponsesUrl(response.request.url)) return response
      return HttpClientResponse.fromWeb(
        response.request,
        new Response(Stream.toReadableStream(normalizeSseErrorFrames(response.stream)), {
          status: response.status,
          headers: { "content-type": contentType },
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
export const registrationAccount = (input: OpenAiAccountInput) =>
  ModelRegistry.registration({
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

export const layerAccount = (input: OpenAiAccountInput) => ModelRegistry.layer([registrationAccount(input)])
