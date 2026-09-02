import { Effect } from "effect"
import { childGrant, type BudgetLimits, type Remaining } from "../../../../core/durable/run-budget.js"
import { FanOutInvalid } from "../../../errors.js"
import type { AdmitFanOutInput, StoredFanOutMember } from "../../../child/fan-out-internal.js"
import { narrowGrant, split } from "../../../budget/state.js"

/** @internal Reserve and optionally narrow one equal budget share per durable fan-out member. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- transaction-internal operation with three required direct-style arguments.
export const allocateMemberBudgets = (
  available: Remaining,
  input: AdmitFanOutInput,
  members: ReadonlyArray<StoredFanOutMember>,
): Effect.Effect<ReadonlyMap<string, BudgetLimits>, FanOutInvalid> =>
  Effect.gen(function* () {
    const share = split(input.budgetDivisor ?? members.length)(childGrant(available, members.length))
    const budgets = new Map<string, BudgetLimits>()
    for (const member of members) {
      const narrowed = narrowGrant(share, member.inherit.budget)
      if (narrowed === undefined) {
        return yield* FanOutInvalid.make({
          message: `fan-out member '${member.key}' budget exceeds its reserved share`,
        })
      }
      budgets.set(member.key, narrowed)
    }
    return budgets
  })
