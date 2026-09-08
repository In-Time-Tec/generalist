import { Effect, Schema } from "effect"
import { TreePolicyInvalid } from "../errors.js"

/** Fixed upper bound for each recursive Run tree policy dimension. */
export const TREE_POLICY_MAX = 1024

const Bound = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0), Schema.isLessThanOrEqualTo(TREE_POLICY_MAX))

/** Root-pinned bounds for recursive child admission. Root depth is zero. */
export const TreePolicy = Schema.Struct({
  maxDepth: Bound,
  maxSessions: Bound.check(Schema.isGreaterThan(0)),
  concurrency: Schema.Struct({ agents: Bound, tools: Bound }),
})
export type TreePolicy = typeof TreePolicy.Type

export interface HostLimits {
  readonly tree: Pick<TreePolicy, "maxDepth" | "maxSessions">
  readonly concurrency: TreePolicy["concurrency"]
}

export const fromHostLimits = (limits: HostLimits | undefined): Effect.Effect<TreePolicy, TreePolicyInvalid> =>
  normalize(limits === undefined ? undefined : { ...limits.tree, concurrency: limits.concurrency })

/**
 * Policy used when a root admission does not specify one: unbounded within the
 * schema's fixed ceiling. A host that wants recursion limits pins them explicitly; an unspecified
 * policy must not invent one. `TREE_POLICY_MAX` is the representation because tree policy is
 * durable — it is stored in integer columns and feeds the root digest, so a non-finite sentinel
 * would not survive serialization or keep idempotency stable.
 */
export const defaultTreePolicy: TreePolicy = Object.freeze({
  maxDepth: TREE_POLICY_MAX,
  maxSessions: TREE_POLICY_MAX,
  concurrency: Object.freeze({ agents: TREE_POLICY_MAX, tools: TREE_POLICY_MAX }),
})

/** Decode and detach one root policy before its authoritative admission. */
export const normalize = (
  policy: typeof TreePolicy.Encoded = defaultTreePolicy,
): Effect.Effect<TreePolicy, TreePolicyInvalid> =>
  Schema.decodeEffect(TreePolicy)(policy).pipe(
    Effect.map(({ maxDepth, maxSessions, concurrency }) =>
      Object.freeze({ maxDepth, maxSessions, concurrency: Object.freeze({ ...concurrency }) }),
    ),
    Effect.mapError((error) => TreePolicyInvalid.make({ message: String(error) })),
  )

export const narrow = ({
  policy,
  ceiling,
}: {
  readonly policy: TreePolicy | undefined
  readonly ceiling: TreePolicy | null
}): Effect.Effect<TreePolicy, TreePolicyInvalid> =>
  Effect.gen(function* () {
    const selected = yield* normalize(policy ?? ceiling ?? defaultTreePolicy)
    if (
      ceiling !== null &&
      (selected.maxDepth > ceiling.maxDepth ||
        selected.maxSessions > ceiling.maxSessions ||
        selected.concurrency.agents > ceiling.concurrency.agents ||
        selected.concurrency.tools > ceiling.concurrency.tools)
    ) {
      return yield* TreePolicyInvalid.make({
        message: "Requested delegation limits exceed the canonical admitted policy",
      })
    }
    return selected
  })
