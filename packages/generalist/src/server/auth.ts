import { Config, Context, Effect, Layer, Redacted, Schema } from "effect"
import { HttpApiMiddleware, HttpApiSecurity } from "effect/unstable/httpapi"
import { Forbidden, Unauthorized } from "./errors.js"

/** Application-owned identity established at the authentication boundary. @experimental */
export const Principal = Schema.Struct({
  id: Schema.String.check(Schema.isNonEmpty()),
  tenantId: Schema.String.check(Schema.isNonEmpty()),
  role: Schema.Literals(["controller", "spectator"]),
})
export type Principal = typeof Principal.Type

/** The authenticated application identity for one request. @experimental */
export class CurrentPrincipal extends Context.Service<CurrentPrincipal, Principal>()(
  "generalist/server/auth/CurrentPrincipal",
) {}

export interface Resource {
  readonly type: "session" | "run" | "artifact" | "attachment"
  readonly id?: string
}

export interface Authorization {
  readonly tenantId: string
  readonly authorize: (input: {
    readonly principal: Principal
    readonly resource: Resource
    readonly action: "read" | "observe" | "mutate"
  }) => Effect.Effect<boolean>
}

/** Check tenant, role, and application resource policy before invoking the operation. @experimental */
export const authorize = ({
  policy,
  resource,
  action,
}: {
  readonly policy: Authorization
  readonly resource: Resource
  readonly action: "read" | "observe" | "mutate"
}) =>
  Effect.gen(function* () {
    const principal = yield* Schema.decodeEffect(Principal)(yield* CurrentPrincipal).pipe(
      Effect.mapError(() => Unauthorized.make({})),
    )
    if (principal.tenantId !== policy.tenantId || (action === "mutate" && principal.role !== "controller")) {
      return yield* Forbidden.make({})
    }
    if (!(yield* policy.authorize({ principal, resource, action }))) return yield* Forbidden.make({})
  })

/** Pluggable authentication middleware used by every declared Server endpoint. */
export class Authentication extends HttpApiMiddleware.Service<Authentication, { provides: CurrentPrincipal }>()(
  "generalist/server/Authentication",
  {
    security: { bearer: HttpApiSecurity.bearer },
    error: Unauthorized,
  },
) {}

/** Authenticate requests against one redacted bearer-token Config value. */
export const layerBearer = (options: {
  readonly token: Config.Config<Redacted.Redacted>
  readonly principal: Principal
}): Layer.Layer<Authentication, Config.ConfigError | Schema.SchemaError> =>
  Layer.effect(
    Authentication,
    Effect.gen(function* () {
      const expected = yield* Schema.decodeEffect(Schema.String.check(Schema.isNonEmpty()))(
        Redacted.value(yield* options.token),
      )
      const principal = yield* Schema.decodeEffect(Principal)(options.principal)
      return Authentication.of({
        bearer: (httpEffect, { credential }) =>
          Redacted.value(credential) === expected
            ? Effect.provideService(httpEffect, CurrentPrincipal, principal)
            : Effect.fail(Unauthorized.make({})),
      })
    }),
  )
