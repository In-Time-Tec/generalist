import {
  defaultReserveTokens as Compaction_defaultReserveTokens,
  defaultKeepRecentTokens as Compaction_defaultKeepRecentTokens,
  summaryTemplate as Compaction_summaryTemplate,
  AgentSummary as Compaction_AgentSummary,
  withLifecycle as Compaction_withLifecycle,
  CompactionError as Compaction_CompactionError,
  Compaction as Compaction_Compaction,
  defaultStrategy as Compaction_defaultStrategy,
  strategy as Compaction_strategy,
  toolOutputBound as Compaction_toolOutputBound,
  keepRecent as Compaction_keepRecent,
  structuredSummary as Compaction_structuredSummary,
  make as Compaction_make,
  layer as Compaction_layer,
  truncate as Compaction_truncate,
  layerTest as Compaction_layerTest,
} from "../compaction.js"
export const Compaction = {
  defaultReserveTokens: Compaction_defaultReserveTokens,
  defaultKeepRecentTokens: Compaction_defaultKeepRecentTokens,
  summaryTemplate: Compaction_summaryTemplate,
  AgentSummary: Compaction_AgentSummary,
  withLifecycle: Compaction_withLifecycle,
  CompactionError: Compaction_CompactionError,
  Compaction: Compaction_Compaction,
  defaultStrategy: Compaction_defaultStrategy,
  strategy: Compaction_strategy,
  toolOutputBound: Compaction_toolOutputBound,
  keepRecent: Compaction_keepRecent,
  structuredSummary: Compaction_structuredSummary,
  make: Compaction_make,
  layer: Compaction_layer,
  truncate: Compaction_truncate,
  layerTest: Compaction_layerTest,
}
export namespace Compaction {
  export type defaultReserveTokens = typeof import("../compaction.js").defaultReserveTokens
  export type defaultKeepRecentTokens = typeof import("../compaction.js").defaultKeepRecentTokens
  export type summaryTemplate = typeof import("../compaction.js").summaryTemplate
  export type AgentSummary = import("../compaction.js").AgentSummary
  export type withLifecycle = typeof import("../compaction.js").withLifecycle
  export type CompactionError = import("../compaction.js").CompactionError
  export type Compaction = import("../compaction.js").Compaction
  export type defaultStrategy = typeof import("../compaction.js").defaultStrategy
  export type strategy = typeof import("../compaction.js").strategy
  export type toolOutputBound = typeof import("../compaction.js").toolOutputBound
  export type keepRecent = typeof import("../compaction.js").keepRecent
  export type structuredSummary = typeof import("../compaction.js").structuredSummary
  export type make = typeof import("../compaction.js").make
  export type layer = typeof import("../compaction.js").layer
  export type truncate = typeof import("../compaction.js").truncate
  export type layerTest = typeof import("../compaction.js").layerTest
  export type DefaultOptions = import("../compaction.js").DefaultOptions
  export type Service = import("../compaction.js").Service
  export type KeepRecentOptions = import("../compaction.js").KeepRecentOptions
  export type LayerOptions = import("../compaction.js").LayerOptions
  export type MicrocompactResult = import("../compaction.js").MicrocompactResult
  export type Plan = import("../compaction.js").Plan
  export type Request = import("../compaction.js").Request
  export type Result = import("../compaction.js").Result
  export type Strategy = import("../compaction.js").Strategy
  export type StrategyPart = import("../compaction.js").StrategyPart
  export type StructuredSummaryOptions = import("../compaction.js").StructuredSummaryOptions
  export type SummarizeResult = import("../compaction.js").SummarizeResult
  export type ToolOutputBoundOptions = import("../compaction.js").ToolOutputBoundOptions
  export type Usage = import("../compaction.js").Usage
}
