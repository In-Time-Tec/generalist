import type { Effect } from "effect"
import type { RuntimeUnavailable } from "./errors.js"

/** @experimental Final executable disposition of a Run at a transaction boundary. */
export type RunActivation =
  | {
      readonly runId: string
      readonly intent: "execute" | "cancel"
      readonly attemptFence: number
      readonly runStatus: string
    }
  | { readonly runId: string; readonly intent: "inactive" }

/** @experimental Transaction-local projection of final Run activation state. */
export interface RunActivationProjection {
  readonly applyInTransaction: (changes: ReadonlyArray<RunActivation>) => Effect.Effect<void, RuntimeUnavailable>
}
