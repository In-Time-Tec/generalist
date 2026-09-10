import { BunCrypto } from "@effect/platform-bun"
import { Layer, Schema } from "effect"
import { layer as layerS3 } from "generalist/durability/s3"
import { makeRuntimeActor, type RuntimeActorIdentity } from "generalist/unstable/rivet"
import type { CodingAgentConfig } from "./config.js"
import { addressBindings, resolverLayer } from "./executable.js"

const ActorKey = Schema.Tuple([Schema.String.check(Schema.isNonEmpty()), Schema.String.check(Schema.isNonEmpty())])

export const key = (config: Pick<CodingAgentConfig, "tenant" | "partition">): Array<string> => {
  const [tenant, partition] = Schema.decodeSync(ActorKey)([config.tenant, config.partition])
  return [tenant, partition]
}

export const namespaceFromActorKey =
  (config: Pick<CodingAgentConfig, "environment" | "tenant" | "partition">) =>
  ({ key: actorKey }: RuntimeActorIdentity) => {
    const [tenant, partition] = Schema.decodeUnknownSync(ActorKey)(actorKey)
    if (tenant !== config.tenant || partition !== config.partition) {
      throw new Error("The actor key is outside this host's authorized Runtime namespace")
    }
    return { environment: config.environment, tenant, partition }
  }

export const make = (config: CodingAgentConfig) =>
  makeRuntimeActor({
    namespace: namespaceFromActorKey(config),
    storage: Layer.merge(layerS3(config.storage), BunCrypto.layer).pipe(Layer.orDie),
    resolver: resolverLayer,
    addresses: addressBindings,
    drainFuel: 16,
    recoveryIntervalMillis: 5_000,
    actorOptions: { sleepTimeout: 30_000 },
  })
