import { Context } from "effect"

/** @internal Persisted model-call ordinal for the operation currently being executed. */
export const CurrentModelCallOrdinal: Context.Reference<number | undefined> = Context.Reference<number | undefined>(
  "@batonfx/core/CurrentModelCallOrdinal",
  { defaultValue: () => undefined as number | undefined },
)
