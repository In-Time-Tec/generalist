import { Schema } from "effect"

/** Stable identity of one Agent execution. */
export const RunId = Schema.String.check(Schema.isNonEmpty())

/** Stable identity of one Agent execution. */
export type RunId = typeof RunId.Type
