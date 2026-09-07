import { Effect } from "effect"
import { Activation } from "./internal/runtime.js"

/** Explicit environment, tenant, and partition identity plus bounded host options. */
export type { Options } from "./internal/runtime.js"
export type { RuntimeServices } from "../runtime/state/layer.js"
export { Activation } from "./internal/runtime.js"
export { DurabilityFailure } from "./errors.js"
export { layer } from "../runtime/state/layer.js"
export { layerRunStore } from "../runtime/state/store.js"

/**
 * Acquire fresh host authority and start scoped recovery/execution.
 * Layer construction is read-only; call this only from an authorized host scope.
 * The returned fiber fails if ownership is lost; closing the scope interrupts and awaits owned work.
 */
export const activate = Effect.flatMap(Activation, (activation) => activation.activate)
