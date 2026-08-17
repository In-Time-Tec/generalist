import { Effect, Schema } from "effect"
import { TreePolicyInvalid } from "./errors.js"

/** @experimental Fixed upper bound for each recursive Run tree policy dimension. */
export const TREE_POLICY_MAX = 1024

const Bound = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0), Schema.isLessThanOrEqualTo(TREE_POLICY_MAX))

/** @experimental Root-pinned bounds for recursive child admission. Root depth is zero. */
export const TreePolicy = Schema.Struct({ maxDepth: Bound, maxSubagents: Bound })
/** @experimental */
export type TreePolicy = typeof TreePolicy.Type

/**
 * @experimental Policy used when a root admission does not specify one: unbounded within the
 * schema's fixed ceiling. A host that wants recursion limits pins them explicitly; an unspecified
 * policy must not invent one. `TREE_POLICY_MAX` is the representation because tree policy is
 * durable — it is stored in integer columns and feeds the root digest, so a non-finite sentinel
 * would not survive serialization or keep idempotency stable.
 */
export const defaultTreePolicy: TreePolicy = Object.freeze({
  maxDepth: TREE_POLICY_MAX,
  maxSubagents: TREE_POLICY_MAX,
})

/** @experimental Decode and detach one root policy before its authoritative admission. */
export const normalize = (policy: unknown = defaultTreePolicy): Effect.Effect<TreePolicy, TreePolicyInvalid> =>
  Schema.decodeUnknownEffect(TreePolicy)(policy).pipe(
    Effect.map(({ maxDepth, maxSubagents }) => Object.freeze({ maxDepth, maxSubagents })),
    Effect.mapError((error) => TreePolicyInvalid.make({ message: String(error) })),
  )
