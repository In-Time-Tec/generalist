import { Schema } from "effect"

/** Durable direct-child capacity state owned by the parent Run. */
export const ChildReadiness = Schema.Literals(["queued", "ready", "settled"])
export type ChildReadiness = typeof ChildReadiness.Type
