import { Config, Effect, Option, type Types } from "effect"
import type { ConnectionOptions } from "generalist/durability/s3"

export interface CodingAgentConfig {
  readonly environment: string
  readonly tenant: string
  readonly partition: string
  readonly storage: ConnectionOptions
  readonly rivet: {
    readonly endpoint?: string
    readonly token?: string
    readonly namespace: string
    readonly poolName: string
    readonly startEngine: boolean
  }
}

export const loadConfig: Effect.Effect<CodingAgentConfig, Config.ConfigError> = Effect.gen(function* () {
  const environment = yield* Config.NonEmptyString("GENERALIST_ENVIRONMENT")
  const tenant = yield* Config.NonEmptyString("GENERALIST_TENANT")
  const partition = yield* Config.NonEmptyString("GENERALIST_PARTITION")
  const bucket = yield* Config.NonEmptyString("GENERALIST_BUCKET")
  const region = yield* Config.NonEmptyString("AWS_REGION")
  const accessKeyId = yield* Config.NonEmptyString("AWS_ACCESS_KEY_ID")
  const secretAccessKey = yield* Config.NonEmptyString("AWS_SECRET_ACCESS_KEY")
  const sessionToken = Option.getOrUndefined(yield* Config.option(Config.NonEmptyString("AWS_SESSION_TOKEN")))
  const storageEndpoint = Option.getOrUndefined(yield* Config.option(Config.NonEmptyString("GENERALIST_S3_ENDPOINT")))
  const capabilitiesConfirmed =
    storageEndpoint === undefined ? false : yield* Config.Boolean("GENERALIST_S3_CAPABILITIES_CONFIRMED")
  const storage: Types.Mutable<ConnectionOptions> = {
    bucket,
    region,
    credentials:
      sessionToken === undefined ? { accessKeyId, secretAccessKey } : { accessKeyId, secretAccessKey, sessionToken },
  }
  if (storageEndpoint !== undefined) {
    storage.endpoint = storageEndpoint
    storage.forcePathStyle = true
    storage.capabilities = {
      conditionalCreate: capabilitiesConfirmed,
      strongReadAfterWrite: capabilitiesConfirmed,
      consistentListing: capabilitiesConfirmed,
    }
  }

  const endpoint = Option.getOrUndefined(yield* Config.option(Config.NonEmptyString("RIVET_ENDPOINT")))
  const token = Option.getOrUndefined(yield* Config.option(Config.NonEmptyString("RIVET_TOKEN")))
  const namespace = yield* Config.NonEmptyString("RIVET_NAMESPACE")
  const poolName = yield* Config.NonEmptyString("RIVET_POOL_NAME")
  const startEngine = yield* Config.Boolean("RIVET_START_ENGINE").pipe(Config.withDefault(false))
  const rivet: Types.Mutable<CodingAgentConfig["rivet"]> = { namespace, poolName, startEngine }
  if (endpoint !== undefined) rivet.endpoint = endpoint
  if (token !== undefined) rivet.token = token
  return { environment, tenant, partition, storage, rivet }
})
