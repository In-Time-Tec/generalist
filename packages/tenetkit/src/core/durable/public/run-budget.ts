import {
  BudgetLimits as RunBudget_BudgetLimits,
  RunBudget as RunBudget_RunBudget,
  RunBudgetExhausted as RunBudget_RunBudgetExhausted,
  RunBudgetGrantWidened as RunBudget_RunBudgetGrantWidened,
  make as RunBudget_make,
  unbounded as RunBudget_unbounded,
  charge as RunBudget_charge,
  reserveChild as RunBudget_reserveChild,
  narrowChild as RunBudget_narrowChild,
  refundUnused as RunBudget_refundUnused,
  resolve as RunBudget_resolve,
  narrowLimits as RunBudget_narrowLimits,
  isDeadlineExpired as RunBudget_isDeadlineExpired,
  assertNotExpired as RunBudget_assertNotExpired,
  encode as RunBudget_encode,
  decode as RunBudget_decode,
} from "../run-budget.js"
export const RunBudget = {
  BudgetLimits: RunBudget_BudgetLimits,
  RunBudget: RunBudget_RunBudget,
  Exhausted: RunBudget_RunBudgetExhausted,
  GrantWidened: RunBudget_RunBudgetGrantWidened,
  make: RunBudget_make,
  unbounded: RunBudget_unbounded,
  charge: RunBudget_charge,
  reserveChild: RunBudget_reserveChild,
  narrowChild: RunBudget_narrowChild,
  refundUnused: RunBudget_refundUnused,
  resolve: RunBudget_resolve,
  narrowLimits: RunBudget_narrowLimits,
  isDeadlineExpired: RunBudget_isDeadlineExpired,
  assertNotExpired: RunBudget_assertNotExpired,
  encode: RunBudget_encode,
  decode: RunBudget_decode,
}
export namespace RunBudget {
  export type BudgetLimits = import("../run-budget.js").BudgetLimits
  export type RunBudget = import("../run-budget.js").RunBudget
  export type Exhausted = import("../run-budget.js").RunBudgetExhausted
  export type GrantWidened = import("../run-budget.js").RunBudgetGrantWidened
  export type make = typeof import("../run-budget.js").make
  export type charge = typeof import("../run-budget.js").charge
  export type reserveChild = typeof import("../run-budget.js").reserveChild
  export type narrowChild = typeof import("../run-budget.js").narrowChild
  export type refundUnused = typeof import("../run-budget.js").refundUnused
  export type resolve = typeof import("../run-budget.js").resolve
  export type narrowLimits = typeof import("../run-budget.js").narrowLimits
  export type isDeadlineExpired = typeof import("../run-budget.js").isDeadlineExpired
  export type assertNotExpired = typeof import("../run-budget.js").assertNotExpired
  export type encode = typeof import("../run-budget.js").encode
  export type decode = typeof import("../run-budget.js").decode
}
