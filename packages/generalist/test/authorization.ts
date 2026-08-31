import { Layer } from "effect"
import { Approvals, Permissions } from "../src/index.js"

/**
 * Tests that run tooled agents without exercising a specific authorization
 * behavior declare the explicit allow-all policy. Tests that exercise
 * Permissions/Approvals semantics provide their own layers instead.
 */
export const allowAllAuthorization: Layer.Layer<Permissions.Permissions | Approvals.Approvals> = Layer.mergeAll(
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
)
