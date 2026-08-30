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
} from "../policy.js"
export const TurnPolicy = {
  StopReason: TurnPolicy_StopReason,
  Error: TurnPolicy_TurnPolicyError,
  decision: TurnPolicy_decision,
  make: TurnPolicy_make,
  forever: TurnPolicy_forever,
  recurs: TurnPolicy_recurs,
  untilToolCall: TurnPolicy_untilToolCall,
  both: TurnPolicy_both,
  defaultPolicy: TurnPolicy_defaultPolicy,
}
export namespace TurnPolicy {
  export type StopReason = import("../policy.js").StopReason
  export type Error = import("../policy.js").TurnPolicyError
  export type decision = typeof import("../policy.js").decision
  export type make = typeof import("../policy.js").make
  export type forever = typeof import("../policy.js").forever
  export type recurs = typeof import("../policy.js").recurs
  export type untilToolCall = typeof import("../policy.js").untilToolCall
  export type both = typeof import("../policy.js").both
  export type defaultPolicy = typeof import("../policy.js").defaultPolicy
  export type BothSnapshot = import("../policy.js").BothSnapshot
  export type BudgetExhausted = import("../policy.js").BudgetExhausted
  export type Continue = import("../policy.js").Continue
  export type Decision = import("../policy.js").Decision
  export type ForeverSnapshot = import("../policy.js").ForeverSnapshot
  export type GoalSatisfied = import("../policy.js").GoalSatisfied
  export type CustomReason = import("../policy.js").Policy
  export type RecursSnapshot = import("../policy.js").RecursSnapshot
  export type Snapshot = import("../policy.js").Snapshot
  export type Stop = import("../policy.js").Stop
  export type TurnInfo = import("../policy.js").TurnInfo
  export type TurnLimit = import("../policy.js").TurnLimit
  export type TurnOverrides = import("../policy.js").TurnOverrides
  export type Policy<R = never> = import("../policy.js").TurnPolicy<R>
  export type UntilToolCallSnapshot = import("../policy.js").UntilToolCallSnapshot
}
