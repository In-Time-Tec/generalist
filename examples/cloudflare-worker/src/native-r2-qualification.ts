import { Crypto, Effect, Layer, PlatformError } from "effect"
import type { Bucket } from "generalist/durability/r2"
import { nativeR2Worker } from "../../../packages/generalist/src/testing/durability/native-r2-worker.js"

interface Environment {
  readonly NATIVE_R2_QUALIFICATION_BUCKET: Bucket
  readonly NATIVE_R2_QUALIFICATION_TOKEN: string
  readonly NATIVE_R2_QUALIFICATION_ENABLED: string
  readonly NATIVE_R2_QUALIFICATION_ENVIRONMENT: string
  readonly NATIVE_R2_QUALIFICATION_TENANT: string
}

const cryptoLayer = Layer.succeed(
  Crypto.Crypto,
  Crypto.make({
    randomBytes: (size) => crypto.getRandomValues(new Uint8Array(size)),
    digest: (algorithm, data) =>
      Effect.tryPromise({
        try: () => crypto.subtle.digest(algorithm, new Uint8Array(data)),
        catch: (cause) =>
          PlatformError.systemError({
            module: "Crypto",
            method: "digest",
            _tag: "Unknown",
            cause,
          }),
      }).pipe(Effect.map((buffer) => new Uint8Array(buffer))),
  }),
)

export default {
  fetch: (request: Request, environment: Environment): Promise<Response> =>
    nativeR2Worker(
      request,
      {
        bucket: environment.NATIVE_R2_QUALIFICATION_BUCKET,
        token: environment.NATIVE_R2_QUALIFICATION_TOKEN,
        enabled: environment.NATIVE_R2_QUALIFICATION_ENABLED,
        configuredEnvironment: environment.NATIVE_R2_QUALIFICATION_ENVIRONMENT,
        configuredTenant: environment.NATIVE_R2_QUALIFICATION_TENANT,
      },
      cryptoLayer,
    ),
}
