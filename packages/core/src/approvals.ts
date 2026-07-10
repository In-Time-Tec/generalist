import { Context, Effect, Layer } from "effect"
import { type Request } from "./tool-executor.js"
/** @experimental */
export interface Approved {
  readonly _tag: "Approved"
}

/** @experimental Denied: the model receives a failed tool result with `reason`. */
export interface Denied {
  readonly _tag: "Denied"
  readonly reason?: string
}

/** @experimental Pending: the run suspends with `AgentSuspended{ reason: "approval" }`. */
export interface Pending {
  readonly _tag: "Pending"
  readonly token: string
}

/** @experimental */
export type Decision = Approved | Denied | Pending

/** @experimental */
export interface Interface {
  readonly check: (request: Request) => Effect.Effect<Decision>
}

/** @experimental Enforcement point for `Ai.Tool.needsApproval`, which
 * `effect/unstable/ai` declares but never enforces. */
export class Approvals extends Context.Service<Approvals, Interface>()("@batonfx/core/Approvals") {}

/** @experimental Default: every check returns Approved. */
export const autoApprove: Layer.Layer<Approvals> = Layer.succeed(
  Approvals,
  Approvals.of({ check: () => Effect.succeed({ _tag: "Approved" }) }),
)

/** @experimental Every check returns Denied (useful in tests/lockdown). */
export const denyAll: Layer.Layer<Approvals> = Layer.succeed(
  Approvals,
  Approvals.of({ check: () => Effect.succeed({ _tag: "Denied" }) }),
)

/** @experimental */
export const testLayer = (implementation: Interface): Layer.Layer<Approvals> =>
  Layer.succeed(Approvals, Approvals.of(implementation))
