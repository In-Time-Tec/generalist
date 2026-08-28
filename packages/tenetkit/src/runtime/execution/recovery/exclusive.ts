import type { Effect } from "effect"
import type { RuntimeUnavailable } from "../../errors.js"

/** @experimental Exclusive-host recovery, intentionally separate from universal RunStore claims. */
export interface ExclusiveExecutionRecovery {
  readonly recoverClaims: (input: {
    readonly newOwnerId: string
    readonly limit?: number
    readonly afterRunId?: string
  }) => Effect.Effect<
    {
      readonly recovered: number
      readonly continuation?: string
    },
    RuntimeUnavailable
  >
}
