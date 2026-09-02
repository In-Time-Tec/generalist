import { Context, Effect, Layer } from "effect"
import type { Rule } from "./permissions.js"
import type { AccessRequest } from "../tools/tool-authorization.js"
export interface Approved {
  readonly _tag: "Approved"
  readonly remember?: Rule
}
export interface Denied {
  readonly _tag: "Denied"
  readonly reason?: string
}
/** An unresolved authorization request. */
export interface Pending extends AccessRequest {
  readonly _tag: "Pending"
  readonly token: string
}
export type Resolution = Approved | Denied | Pending
export interface Service {
  readonly resolve: (pending: Pending) => Effect.Effect<Resolution>
}
/** Enforcement point for policy asks and `Ai.Tool.needsApproval`. */
export class Approvals extends Context.Service<Approvals, Service>()("generalist/core/policy/approvals") {}
/** Default: every request resolves Approved. */
export const layerAutoApprove: Layer.Layer<Approvals> = Layer.succeed(
  Approvals,
  Approvals.of({ resolve: () => Effect.succeed({ _tag: "Approved" }) }),
)
/** Every request resolves Denied. */
export const layerDenyAll: Layer.Layer<Approvals> = Layer.succeed(
  Approvals,
  Approvals.of({ resolve: () => Effect.succeed({ _tag: "Denied" }) }),
)
export const layerTest = (implementation: Service): Layer.Layer<Approvals> =>
  Layer.succeed(Approvals, Approvals.of(implementation))
