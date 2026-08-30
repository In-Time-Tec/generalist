import { Effect, Layer, Option, Redacted, Schema, Stream } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import {
  AuthError,
  clientId,
  DevicePollResponse,
  DeviceStartResponse,
  OAuthClient,
  issuer,
  TokenResponse,
} from "./openai-account-auth.js"

const failure = (kind: AuthError["kind"], message: string) => AuthError.make({ kind, message })
const PermanentRefreshError = Schema.Struct({
  error: Schema.optionalKey(Schema.Union([Schema.String, Schema.Struct({ code: Schema.optionalKey(Schema.String) })])),
  code: Schema.optionalKey(Schema.String),
})

const decode = <S extends Schema.Constraint>(response: HttpClientResponse.HttpClientResponse, schema: S) =>
  HttpClientResponse.schemaBodyJson(schema)(response).pipe(
    Effect.mapError(() => failure("protocol", "OpenAI authorization returned an invalid response")),
  )

const discard = (response: HttpClientResponse.HttpClientResponse) =>
  Stream.runDrain(response.stream).pipe(Effect.ignore)

/** @experimental */
export const layer: Layer.Layer<OAuthClient, never, HttpClient.HttpClient> = Layer.effect(
  OAuthClient,
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    const bounded = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      effect.pipe(
        Effect.timeoutOption("30 seconds"),
        Effect.flatMap((result) =>
          Option.isSome(result)
            ? Effect.succeed(result.value)
            : Effect.fail(failure("timeout", "OpenAI authorization request timed out")),
        ),
      )
    const execute = (request: HttpClientRequest.HttpClientRequest) =>
      client.execute(request).pipe(
        Effect.provideService(FetchHttpClient.RequestInit, { redirect: "error" }),
        Effect.mapError((error) =>
          Schema.is(AuthError)(error) ? error : failure("network", "OpenAI authorization request failed"),
        ),
      )
    const tokenRequest = (request: HttpClientRequest.HttpClientRequest) =>
      bounded(
        execute(request).pipe(
          Effect.flatMap((response) =>
            response.status >= 200 && response.status < 300
              ? decode(response, TokenResponse)
              : discard(response).pipe(
                  Effect.andThen(Effect.fail(failure("protocol", "OpenAI token exchange failed"))),
                ),
          ),
        ),
      )
    return OAuthClient.of({
      exchange: ({ code, verifier, redirectUri }) =>
        tokenRequest(
          HttpClientRequest.post(`${issuer}/oauth/token`).pipe(
            HttpClientRequest.bodyUrlParams({
              grant_type: "authorization_code",
              code: Redacted.value(code),
              redirect_uri: redirectUri,
              client_id: clientId,
              code_verifier: Redacted.value(verifier),
            }),
          ),
        ),
      refresh: (refreshToken) =>
        bounded(
          execute(
            HttpClientRequest.post(`${issuer}/oauth/token`).pipe(
              HttpClientRequest.bodyJsonUnsafe({
                client_id: clientId,
                grant_type: "refresh_token",
                refresh_token: Redacted.value(refreshToken),
              }),
            ),
          ).pipe(
            Effect.flatMap((response) => {
              if (response.status >= 200 && response.status < 300) return decode(response, TokenResponse)
              if (response.status === 401) {
                return discard(response).pipe(
                  Effect.andThen(
                    Effect.fail(failure("login-required", "OpenAI account refresh was rejected; login is required")),
                  ),
                )
              }
              return decode(response, PermanentRefreshError).pipe(
                Effect.flatMap((body) => {
                  const code = Schema.is(Schema.String)(body.error) ? body.error : (body.error?.code ?? body.code)
                  return Effect.fail(
                    code === "refresh_token_expired" ||
                      code === "refresh_token_reused" ||
                      code === "refresh_token_invalidated"
                      ? failure(
                          "login-required",
                          "OpenAI account refresh can no longer be recovered locally; login is required",
                        )
                      : failure("network", "OpenAI account refresh failed"),
                  )
                }),
                Effect.catch((error) =>
                  Schema.is(AuthError)(error) && error.kind === "login-required"
                    ? Effect.fail(error)
                    : Effect.fail(failure("network", "OpenAI account refresh failed")),
                ),
              )
            }),
          ),
        ),
      deviceStart: bounded(
        execute(
          HttpClientRequest.post(`${issuer}/api/accounts/deviceauth/usercode`).pipe(
            HttpClientRequest.bodyJsonUnsafe({ client_id: clientId }),
          ),
        ).pipe(
          Effect.flatMap((response) =>
            response.status >= 200 && response.status < 300
              ? decode(response, DeviceStartResponse)
              : discard(response).pipe(
                  Effect.andThen(
                    Effect.fail(
                      failure(
                        response.status === 404 ? "protocol" : "network",
                        response.status === 404
                          ? "OpenAI device-code login is not available"
                          : "OpenAI device-code login could not be started",
                      ),
                    ),
                  ),
                ),
          ),
        ),
      ),
      devicePoll: (deviceAuthId, userCode) =>
        bounded(
          execute(
            HttpClientRequest.post(`${issuer}/api/accounts/deviceauth/token`).pipe(
              HttpClientRequest.bodyJsonUnsafe({
                device_auth_id: Redacted.value(deviceAuthId),
                user_code: userCode,
              }),
            ),
          ).pipe(
            Effect.flatMap((response) => {
              if (response.status >= 200 && response.status < 300) {
                return decode(response, DevicePollResponse).pipe(Effect.map(Option.some))
              }
              if (response.status === 403 || response.status === 404) {
                return discard(response).pipe(Effect.as(Option.none()))
              }
              return discard(response).pipe(
                Effect.andThen(Effect.fail(failure("network", "OpenAI device authorization failed"))),
              )
            }),
          ),
        ),
    })
  }),
)
