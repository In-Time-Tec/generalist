import { Schema } from "effect"
import type { ConnectionOptions } from "../../durability/s3.js"

export const providers = ["aws-s3", "r2-s3"] as const
export type Provider = (typeof providers)[number]

const Identity = Schema.String.check(Schema.isPattern(/^[a-z0-9][a-z0-9_-]{0,47}$/))
const RunId = Schema.String.check(Schema.isPattern(/^[a-z0-9][a-z0-9-]{15,79}$/))
const isIdentity = Schema.is(Identity)
export const isRunId = Schema.is(RunId)

export interface Configuration {
  readonly provider: Provider
  readonly connection: ConnectionOptions
  readonly environment: string
  readonly tenant: string
  readonly seed: number
  readonly concurrency: number
  readonly cleanup: boolean
}

export type ConfigurationResult =
  | { readonly status: "configured"; readonly configuration: Configuration }
  | { readonly status: "unmet"; readonly provider: Provider; readonly reasons: ReadonlyArray<string> }

const buildConnection = ({
  bucket,
  region,
  accessKeyId,
  secretAccessKey,
  sessionToken,
  endpoint,
}: {
  readonly bucket: string
  readonly region: string
  readonly accessKeyId: string
  readonly secretAccessKey: string
  readonly sessionToken: string | undefined
  readonly endpoint: string | undefined
}): import("../../durability/s3.js").ConnectionOptions => {
  const credentials: import("../../durability/s3.js").ConnectionOptions["credentials"] =
    sessionToken !== undefined ? { accessKeyId, secretAccessKey, sessionToken } : { accessKeyId, secretAccessKey }
  if (endpoint === undefined) return { bucket, region, credentials, requestTimeoutMs: 30_000 }
  return {
    bucket,
    region,
    credentials,
    requestTimeoutMs: 30_000,
    endpoint,
    forcePathStyle: true,
    capabilities: { conditionalCreate: true, strongReadAfterWrite: true, consistentListing: true },
  }
}

const required = (env: Readonly<Record<string, string | undefined>>, name: string, reasons: Array<string>): string => {
  const value = env[name]
  if (value === undefined || value.trim() === "") reasons.push(`${name} is required`)
  return value ?? ""
}

const validateIdentity = (name: string, value: string, reasons: Array<string>): void => {
  if (value !== "" && !isIdentity(value)) reasons.push(`${name} must match [a-z0-9][a-z0-9_-]{0,47}`)
}

const validateR2Endpoint = (endpoint: string | undefined, reasons: Array<string>): void => {
  if (endpoint === undefined || endpoint === "") return
  try {
    const url = new URL(endpoint)
    const valid =
      url.protocol === "https:" &&
      /^[a-f0-9]{32}(?:\.(?:eu|fedramp))?\.r2\.cloudflarestorage\.com$/.test(url.hostname) &&
      url.port === "" &&
      url.username === "" &&
      url.password === "" &&
      url.search === "" &&
      url.hash === "" &&
      url.pathname === "/"
    if (!valid)
      reasons.push(
        "GENERALIST_DURABILITY_R2_ENDPOINT must be the HTTPS Cloudflare account S3 API origin, not a cached public or custom endpoint",
      )
  } catch {
    reasons.push("GENERALIST_DURABILITY_R2_ENDPOINT must be a valid HTTPS Cloudflare account S3 API origin")
  }
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

const validateCleanup = (value: string | undefined, reasons: Array<string>): void => {
  if (value !== undefined && value !== "0" && value !== "1")
    reasons.push("GENERALIST_DURABILITY_CLEANUP must be 0 or 1")
}

/** Explicit credentials only: never reads the AWS default chain, profiles, or ambient endpoints. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- configuration consumes its required provider and explicit environment record directly.
export const configuration = (
  provider: Provider,
  env: Readonly<Record<string, string | undefined>>,
): ConfigurationResult => {
  const reasons: Array<string> = []
  if (env.GENERALIST_DURABILITY_REMOTE !== "1")
    reasons.push("GENERALIST_DURABILITY_REMOTE=1 is required to authorize remote test writes")
  const environment = required(env, "GENERALIST_DURABILITY_ENVIRONMENT", reasons)
  const tenant = required(env, "GENERALIST_DURABILITY_TENANT", reasons)
  validateIdentity("GENERALIST_DURABILITY_ENVIRONMENT", environment, reasons)
  validateIdentity("GENERALIST_DURABILITY_TENANT", tenant, reasons)
  const prefix = provider === "aws-s3" ? "GENERALIST_DURABILITY_AWS" : "GENERALIST_DURABILITY_R2"
  const bucket = required(env, `${prefix}_BUCKET`, reasons)
  const accessKeyId = required(env, `${prefix}_ACCESS_KEY_ID`, reasons)
  const secretAccessKey = required(env, `${prefix}_SECRET_ACCESS_KEY`, reasons)
  const sessionToken = env[`${prefix}_SESSION_TOKEN`]
  const region = provider === "aws-s3" ? required(env, `${prefix}_REGION`, reasons) : "auto"
  const endpoint = provider === "r2-s3" ? required(env, `${prefix}_ENDPOINT`, reasons) : undefined
  validateR2Endpoint(endpoint, reasons)
  const seed = boundedNumber(env, "GENERALIST_DURABILITY_SEED", 1, 0, 0xffff_ffff, reasons)
  const concurrency = boundedNumber(env, "GENERALIST_DURABILITY_CONCURRENCY", 4, 2, 16, reasons)
  validateCleanup(env.GENERALIST_DURABILITY_CLEANUP, reasons)
  if (reasons.length > 0) return { status: "unmet", provider, reasons }
  return {
    status: "configured",
    configuration: {
      provider,
      environment,
      tenant,
      seed,
      concurrency,
      cleanup: env.GENERALIST_DURABILITY_CLEANUP === "1",
      connection: buildConnection({ bucket, region, accessKeyId, secretAccessKey, sessionToken, endpoint }),
    },
  }
}
