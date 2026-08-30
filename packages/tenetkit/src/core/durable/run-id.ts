import { Schema } from "effect"

/** @experimental Stable identity of one Agent execution. */
export const RunId = Schema.String.check(Schema.isNonEmpty())

/** @experimental Stable identity of one Agent execution. */
export type RunId = typeof RunId.Type
