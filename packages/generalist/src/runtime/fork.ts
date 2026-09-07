import type { BudgetLimits } from "../core/durable/run-budget.js"
import type { ProgramBudget } from "../core/durable/manifest/program-manifest.js"

/** One completed tool result replaced before a counterfactual branch resumes. */
export interface Substitution {
  readonly operationId: string
  readonly result: unknown
}

/** Select one committed journal prefix for a new Run. */
export interface ForkOptions {
  readonly commandId: string
  readonly atSequence: number
  /** New allocation reserved from the current budget owner; required for a bounded source. */
  readonly budget?: BudgetLimits
  /** Separately reserved additive Program resources; a fork never copies its source's allowance. */
  readonly programBudget?: ProgramBudget
  readonly substitute?: Substitution
}

/** Select one committed journal prefix for in-place continuation. */
export interface RewindOptions {
  readonly commandId: string
  readonly toSequence: number
  /** Required when a settled child must reserve new capacity from its current ancestor budget owner. */
  readonly budget?: BudgetLimits
}
