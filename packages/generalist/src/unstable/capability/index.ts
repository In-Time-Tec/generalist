/** @experimental Capability-secure tool handles and taint declarations. */
export { CapabilityId, Scope, Source } from "../../core/capability/state.js"

/** @experimental */
export { AttenuationWidened, Denied, Invalid } from "../../core/capability/errors.js"

/** @experimental */
export { requireUntainted } from "../../core/capability/annotation.js"

/** @experimental */
export { attenuate, check, grant, revoke } from "../../core/capability/internal.js"

/** @experimental */
export type { Handle } from "../../core/capability/internal.js"
