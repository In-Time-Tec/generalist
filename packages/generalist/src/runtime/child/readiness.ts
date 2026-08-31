import { Schema } from "effect"

/** @experimental Durable direct-child capacity state owned by the parent Run. */
export const ChildReadiness = Schema.Literals(["queued", "ready", "settled"])
/** @experimental */
export type ChildReadiness = typeof ChildReadiness.Type
