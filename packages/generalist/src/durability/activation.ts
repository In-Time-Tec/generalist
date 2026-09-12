import { Effect } from "effect"
import { Activation } from "./internal/runtime.js"

/**
 * Acquire fresh host authority and start scoped recovery/execution.
 *
 * `Runtime.layer` performs this acquisition internally during Layer build; applications do not call
 * it. This remains the entrypoint for advanced hosts that own their wake delivery (see
 * `generalist/durability/host` and the platform compute hosts). The returned fiber fails if
 * ownership is lost; closing the scope interrupts and awaits owned work.
 */
export const activate = Effect.flatMap(Activation, (activation) => activation.activate)
