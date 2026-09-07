import { Effect } from "effect"
import { Activation } from "./internal/runtime.js"

/**
 * Acquire fresh host authority and start scoped recovery/execution.
 * Layer construction is read-only; call this only from an authorized host scope.
 * The returned fiber fails if ownership is lost; closing the scope interrupts and awaits owned work.
 */
export const activate = Effect.flatMap(Activation, (activation) => activation.activate)
