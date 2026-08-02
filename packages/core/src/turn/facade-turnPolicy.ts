type TurnPolicyFacade = typeof import("./turn-policy.js")

import {
  StopReason as TurnPolicy_StopReason,
  TurnPolicyError as TurnPolicy_TurnPolicyError,
  decision as TurnPolicy_decision,
  make as TurnPolicy_make,
  forever as TurnPolicy_forever,
  recurs as TurnPolicy_recurs,
  untilToolCall as TurnPolicy_untilToolCall,
  both as TurnPolicy_both,
  defaultPolicy as TurnPolicy_defaultPolicy,
} from "./turn-policy.js"
export const TurnPolicy = {
  StopReason: TurnPolicy_StopReason,
  TurnPolicyError: TurnPolicy_TurnPolicyError,
  decision: TurnPolicy_decision,
  make: TurnPolicy_make,
  forever: TurnPolicy_forever,
  recurs: TurnPolicy_recurs,
  untilToolCall: TurnPolicy_untilToolCall,
  both: TurnPolicy_both,
  defaultPolicy: TurnPolicy_defaultPolicy,
} as TurnPolicyFacade
export namespace TurnPolicy {
  export type StopReason = import("./turn-policy.js").StopReason
  export type TurnPolicyError = import("./turn-policy.js").TurnPolicyError
  export type decision = typeof import("./turn-policy.js").decision
  export type make = typeof import("./turn-policy.js").make
  export type forever = typeof import("./turn-policy.js").forever
  export type recurs = typeof import("./turn-policy.js").recurs
  export type untilToolCall = typeof import("./turn-policy.js").untilToolCall
  export type both = typeof import("./turn-policy.js").both
  export type defaultPolicy = typeof import("./turn-policy.js").defaultPolicy
  export type BothSnapshot = import("./turn-policy.js").BothSnapshot
  export type BudgetExhausted = import("./turn-policy.js").BudgetExhausted
  export type Continue = import("./turn-policy.js").Continue
  export type Decision = import("./turn-policy.js").Decision
  export type ForeverSnapshot = import("./turn-policy.js").ForeverSnapshot
  export type GoalSatisfied = import("./turn-policy.js").GoalSatisfied
  export type Policy = import("./turn-policy.js").Policy
  export type RecursSnapshot = import("./turn-policy.js").RecursSnapshot
  export type Snapshot = import("./turn-policy.js").Snapshot
  export type Stop = import("./turn-policy.js").Stop
  export type TurnInfo = import("./turn-policy.js").TurnInfo
  export type TurnLimit = import("./turn-policy.js").TurnLimit
  export type TurnOverrides = import("./turn-policy.js").TurnOverrides
  export type TurnPolicy<R = never> = import("./turn-policy.js").TurnPolicy<R>
  export type UntilToolCallSnapshot = import("./turn-policy.js").UntilToolCallSnapshot
}
