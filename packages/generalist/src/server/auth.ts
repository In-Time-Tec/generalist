import { Config, Effect, Layer, Redacted } from "effect"
import { HttpApiMiddleware, HttpApiSecurity } from "effect/unstable/httpapi"
import { Unauthorized } from "./errors.js"

/** Pluggable authentication middleware used by every declared Server endpoint. */
export class Authentication extends HttpApiMiddleware.Service<Authentication>()("generalist/server/Authentication", {
  security: { bearer: HttpApiSecurity.bearer },
  error: Unauthorized,
}) {}

/** Authenticate requests against one redacted bearer-token Config value. */
export const layerBearer = (token: Config.Config<Redacted.Redacted>): Layer.Layer<Authentication, Config.ConfigError> =>
  Layer.effect(
    Authentication,
    Effect.gen(function* () {
      const expected = Redacted.value(yield* token)
      return Authentication.of({
        bearer: (httpEffect, { credential }) =>
          Redacted.value(credential) === expected ? httpEffect : Effect.fail(Unauthorized.make({})),
      })
    }),
  )
