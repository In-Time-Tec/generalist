import {
  PermissionError as Permissions_PermissionError,
  Permissions as Permissions_Permissions,
  RuleStore as Permissions_RuleStore,
  matches as Permissions_matches,
  matchRule as Permissions_matchRule,
  evaluate as Permissions_evaluate,
  evaluateWithRules as Permissions_evaluateWithRules,
  layerRuleset as Permissions_layerRuleset,
  layerAllowAll as Permissions_layerAllowAll,
  layerRuleStoreMemory as Permissions_layerRuleStoreMemory,
  layerRuleStoreTest as Permissions_layerRuleStoreTest,
  layerTest as Permissions_layerTest,
} from "./permissions.js"
export const Permissions = {
  PermissionError: Permissions_PermissionError,
  Permissions: Permissions_Permissions,
  RuleStore: Permissions_RuleStore,
  matches: Permissions_matches,
  matchRule: Permissions_matchRule,
  evaluate: Permissions_evaluate,
  evaluateWithRules: Permissions_evaluateWithRules,
  layerRuleset: Permissions_layerRuleset,
  layerAllowAll: Permissions_layerAllowAll,
  layerRuleStoreMemory: Permissions_layerRuleStoreMemory,
  layerRuleStoreTest: Permissions_layerRuleStoreTest,
  layerTest: Permissions_layerTest,
} as typeof import("./permissions.js")
export namespace Permissions {
  export type PermissionError = import("./permissions.js").PermissionError
  export type Permissions = import("./permissions.js").Permissions
  export type RuleStore = import("./permissions.js").RuleStore
  export type matches = typeof import("./permissions.js").matches
  export type matchRule = typeof import("./permissions.js").matchRule
  export type evaluate = typeof import("./permissions.js").evaluate
  export type evaluateWithRules = typeof import("./permissions.js").evaluateWithRules
  export type layerRuleset = typeof import("./permissions.js").layerRuleset
  export type layerAllowAll = typeof import("./permissions.js").layerAllowAll
  export type layerRuleStoreMemory = typeof import("./permissions.js").layerRuleStoreMemory
  export type layerRuleStoreTest = typeof import("./permissions.js").layerRuleStoreTest
  export type layerTest = typeof import("./permissions.js").layerTest
  export type Allow = import("./permissions.js").Allow
  export type Ask = import("./permissions.js").Ask
  export type Decision = import("./permissions.js").Decision
  export type Deny = import("./permissions.js").Deny
  export type Interface = import("./permissions.js").Interface
  export type Level = import("./permissions.js").Level
  export type Rule = import("./permissions.js").Rule
  export type RuleStoreInterface = import("./permissions.js").RuleStoreInterface
  export type Ruleset = import("./permissions.js").Ruleset
}
