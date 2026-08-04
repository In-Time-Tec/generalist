import { Effect, Equal, Schema } from "effect"
import type { Agent } from "../agent/agent.js"
import type { ModelSelection } from "../model/model-registry.js"
import type { Snapshot } from "../turn/turn-policy.js"
import { of as canonicalDigest } from "./canonical-digest.js"

/** @experimental Pinned agent identity for durable runs. */
export const AgentRef = Schema.Struct({
  id: Schema.String,
  version: Schema.String,
  digest: Schema.String,
})

/** @experimental */
export type AgentRef = typeof AgentRef.Type

/** @experimental Canonical manifest projection pinned by a durable run. */
export const AgentManifest = Schema.Struct({
  name: Schema.String,
  instructions: Schema.optionalKey(Schema.String),
  toolNames: Schema.Array(Schema.String),
  policySnapshot: Schema.optionalKey(Schema.Unknown),
  model: Schema.optionalKey(
    Schema.Struct({
      provider: Schema.String,
      model: Schema.String,
      registrationKey: Schema.optionalKey(Schema.String),
    }),
  ),
  metadata: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown)),
})

/** @experimental */
export type AgentManifest = typeof AgentManifest.Type

/** @experimental */
export class AgentRefVersionMismatch extends Schema.TaggedErrorClass<AgentRefVersionMismatch>()(
  "@batonfx/core/AgentRefVersionMismatch",
  {
    expected: AgentRef,
    actual: AgentRef,
  },
) {}

/** @experimental */
export const digestManifest = (manifest: AgentManifest): string => canonicalDigest(manifest)

/** @experimental */
export const make = (input: {
  readonly id: string
  readonly version: string
  readonly manifest: AgentManifest
}): AgentRef => ({
  id: input.id,
  version: input.version,
  digest: digestManifest(input.manifest),
})

/** @experimental */
export const manifestFromAgent = <
  Tools extends Record<string, import("effect/unstable/ai").Tool.Any>,
  R,
  PolicyServices,
  AuthorizationServices,
>(
  agent: Agent<Tools, R, PolicyServices, AuthorizationServices>,
): AgentManifest => ({
  name: agent.name,
  ...(agent.instructions === undefined ? {} : { instructions: agent.instructions }),
  toolNames: Object.keys(agent.toolkit.tools).toSorted(),
  ...(agent.policy.snapshot === undefined ? {} : { policySnapshot: agent.policy.snapshot as Snapshot }),
  ...(agent.model === undefined
    ? {}
    : {
        model: {
          provider: agent.model.provider,
          model: agent.model.model,
          ...(agent.model.registrationKey === undefined ? {} : { registrationKey: agent.model.registrationKey }),
        } satisfies ModelSelection,
      }),
  ...(agent.metadata === undefined ? {} : { metadata: agent.metadata }),
})

/** @experimental */
export const fromAgent = <
  Tools extends Record<string, import("effect/unstable/ai").Tool.Any>,
  R,
  PolicyServices,
  AuthorizationServices,
>(
  agent: Agent<Tools, R, PolicyServices, AuthorizationServices>,
  version: string,
): AgentRef => make({ id: agent.name, version, manifest: manifestFromAgent(agent) })

/** @experimental */
export const matches = (expected: AgentRef, actual: AgentRef): boolean =>
  expected.id === actual.id && expected.version === actual.version && expected.digest === actual.digest

/** @experimental */
export const requireMatch = (expected: AgentRef, actual: AgentRef): Effect.Effect<void, AgentRefVersionMismatch> =>
  matches(expected, actual) ? Effect.void : Effect.fail(AgentRefVersionMismatch.make({ expected, actual }))

/** @experimental */
export const encode = Schema.encodeEffect(AgentRef)

/** @experimental */
export const decode = Schema.decodeEffect(AgentRef)

/** @experimental */
export const encodeManifest = Schema.encodeEffect(AgentManifest)

/** @experimental */
export const decodeManifest = Schema.decodeEffect(AgentManifest)

/** @experimental */
export const equivalentManifests = (left: AgentManifest, right: AgentManifest): boolean =>
  Equal.equals(canonicalDigest(left), canonicalDigest(right))
