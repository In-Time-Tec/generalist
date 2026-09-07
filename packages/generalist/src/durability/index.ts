/** Explicit environment, tenant, and partition identity plus bounded host options. */
export type { Options } from "./internal/runtime.js"
export type { RuntimeServices } from "../runtime/state/layer.js"
export { Activation } from "./internal/runtime.js"
export { DurabilityFailure } from "./errors.js"
export { layer } from "../runtime/state/layer.js"
export { layerRunStore } from "../runtime/state/store.js"

export { activate } from "./activation.js"
