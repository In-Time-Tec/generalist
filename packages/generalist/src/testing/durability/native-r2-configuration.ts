import type { ConnectionOptions } from "../../durability/s3.js"
import { maxCommandCount, nativeR2Provider, type NativeR2Provider } from "./native-r2-worker.js"
import { configuration as s3Configuration, type Configuration as S3Configuration } from "./remote.js"

const endpointPattern = /^https:\/\//
/** Native qualification host configuration. S3 credentials are reused for the exact same bucket. */
export interface NativeR2Configuration {
  readonly provider: NativeR2Provider
  readonly connection: ConnectionOptions
  readonly endpoint: string
  readonly token: string
  readonly environment: string
  readonly tenant: string
  readonly seed: number
  readonly concurrency: number
  readonly cleanup: boolean
  readonly s3: S3Configuration
}

export type NativeR2ConfigurationResult =
  | { readonly status: "configured"; readonly configuration: NativeR2Configuration }
  | { readonly status: "unmet"; readonly provider: NativeR2Provider; readonly reasons: ReadonlyArray<string> }

const required = (env: Readonly<Record<string, string | undefined>>, name: string, reasons: Array<string>): string => {
  const value = env[name]
  if (value === undefined || value.trim() === "") reasons.push(`${name} is required`)
  return value ?? ""
}

const boundedNumber = (
  env: Readonly<Record<string, string | undefined>>,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
  reasons: Array<string>,
): number => {
  const raw = env[name]
  const value = raw === undefined ? fallback : Number(raw)
  if (raw === "" || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    reasons.push(`${name} must be an integer between ${minimum} and ${maximum}`)
  }
  return value
}

const validateEndpoint = (endpoint: string, reasons: Array<string>): void => {
  if (endpoint !== "") {
    try {
      const url = new URL(endpoint)
      if (
        !endpointPattern.test(endpoint) ||
        url.protocol !== "https:" ||
        url.username !== "" ||
        url.password !== "" ||
        url.port !== "" ||
        url.pathname !== "/" ||
        url.search !== "" ||
        url.hash !== ""
      ) {
        reasons.push(
          "GENERALIST_DURABILITY_NATIVE_R2_ENDPOINT must be an HTTPS Worker origin without credentials, a path, query, or fragment",
        )
      }
    } catch {
      reasons.push("GENERALIST_DURABILITY_NATIVE_R2_ENDPOINT must be a valid HTTPS Worker origin")
    }
  }
}

/**
 * Configuration is intentionally stricter than a generic HTTP client: only a TLS
 * origin and an explicitly supplied bearer token can authorize the Worker.
 */
export const nativeR2Configuration = (
  env: Readonly<Record<string, string | undefined>>,
): NativeR2ConfigurationResult => {
  const reasons: Array<string> = []
  const s3 = s3Configuration("r2-s3", env)
  if (s3.status === "unmet") reasons.push(...s3.reasons.map((reason) => `r2-s3: ${reason}`))
  const endpoint = required(env, "GENERALIST_DURABILITY_NATIVE_R2_ENDPOINT", reasons)
  const token = required(env, "GENERALIST_DURABILITY_NATIVE_R2_TOKEN", reasons)
  validateEndpoint(endpoint, reasons)
  if (token !== "" && (token.length > 512 || /[\r\n]/.test(token))) {
    reasons.push("GENERALIST_DURABILITY_NATIVE_R2_TOKEN must be at most 512 characters without line breaks")
  }
  const seed = boundedNumber(env, "GENERALIST_DURABILITY_SEED", 1, 0, 0xffff_ffff, reasons)
  const concurrency = boundedNumber(env, "GENERALIST_DURABILITY_CONCURRENCY", 4, 2, maxCommandCount, reasons)
  if (
    env.GENERALIST_DURABILITY_CLEANUP !== undefined &&
    env.GENERALIST_DURABILITY_CLEANUP !== "0" &&
    env.GENERALIST_DURABILITY_CLEANUP !== "1"
  ) {
    reasons.push("GENERALIST_DURABILITY_CLEANUP must be 0 or 1")
  }
  if (s3.status === "unmet" || reasons.length > 0) return { status: "unmet", provider: nativeR2Provider, reasons }
  const configuration = s3.configuration
  return {
    status: "configured",
    configuration: {
      provider: nativeR2Provider,
      connection: configuration.connection,
      endpoint,
      token,
      environment: configuration.environment,
      tenant: configuration.tenant,
      seed,
      concurrency,
      cleanup: configuration.cleanup,
      s3: configuration,
    },
  }
}
