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
  const environment = yield* Config.nonEmptyString("GENERALIST_ENVIRONMENT")
  const tenant = yield* Config.nonEmptyString("GENERALIST_TENANT")
  const partition = yield* Config.nonEmptyString("GENERALIST_PARTITION")
  const bucket = yield* Config.nonEmptyString("GENERALIST_BUCKET")
  const region = yield* Config.nonEmptyString("AWS_REGION")
  const accessKeyId = yield* Config.nonEmptyString("AWS_ACCESS_KEY_ID")
  const secretAccessKey = yield* Config.nonEmptyString("AWS_SECRET_ACCESS_KEY")
  const sessionToken = Option.getOrUndefined(yield* Config.option(Config.nonEmptyString("AWS_SESSION_TOKEN")))
  const storageEndpoint = Option.getOrUndefined(yield* Config.option(Config.nonEmptyString("GENERALIST_S3_ENDPOINT")))
  const capabilitiesConfirmed =
    storageEndpoint === undefined ? false : yield* Config.boolean("GENERALIST_S3_CAPABILITIES_CONFIRMED")
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

  const endpoint = Option.getOrUndefined(yield* Config.option(Config.nonEmptyString("RIVET_ENDPOINT")))
  const token = Option.getOrUndefined(yield* Config.option(Config.nonEmptyString("RIVET_TOKEN")))
  const namespace = yield* Config.nonEmptyString("RIVET_NAMESPACE")
  const poolName = yield* Config.nonEmptyString("RIVET_POOL_NAME")
  const startEngine = yield* Config.boolean("RIVET_START_ENGINE").pipe(Config.withDefault(false))
  const rivet: Types.Mutable<CodingAgentConfig["rivet"]> = { namespace, poolName, startEngine }
  if (endpoint !== undefined) rivet.endpoint = endpoint
  if (token !== undefined) rivet.token = token
  return { environment, tenant, partition, storage, rivet }
})
