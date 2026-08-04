type ModelTelemetryFacade = typeof import("./model-telemetry.js")

import {
  ModelProviderUsage as ModelTelemetry_ModelProviderUsage,
  ModelCallPurpose as ModelTelemetry_ModelCallPurpose,
  ModelFailureCategory as ModelTelemetry_ModelFailureCategory,
  ModelFailureClassification as ModelTelemetry_ModelFailureClassification,
  ModelRetryReason as ModelTelemetry_ModelRetryReason,
  ModelFirstOutputKind as ModelTelemetry_ModelFirstOutputKind,
  CompactionTrigger as ModelTelemetry_CompactionTrigger,
  CompactionKind as ModelTelemetry_CompactionKind,
  ModelInvocationMethod as ModelTelemetry_ModelInvocationMethod,
  ModelInvocationStarted as ModelTelemetry_ModelInvocationStarted,
  ModelInvocationCompleted as ModelTelemetry_ModelInvocationCompleted,
  ModelInvocationFailed as ModelTelemetry_ModelInvocationFailed,
  InvocationCoordinationFailed as ModelTelemetry_InvocationCoordinationFailed,
  InvocationCoordinator as ModelTelemetry_InvocationCoordinator,
  layerInvocationCoordinatorNoop as ModelTelemetry_layerInvocationCoordinatorNoop,
  isInvocationCoordinationFailed as ModelTelemetry_isInvocationCoordinationFailed,
  ModelCallStarted as ModelTelemetry_ModelCallStarted,
  ModelAttemptStarted as ModelTelemetry_ModelAttemptStarted,
  ModelAttemptFirstOutput as ModelTelemetry_ModelAttemptFirstOutput,
  ModelAttemptCompleted as ModelTelemetry_ModelAttemptCompleted,
  ModelAttemptFailed as ModelTelemetry_ModelAttemptFailed,
  ModelRetryScheduled as ModelTelemetry_ModelRetryScheduled,
  ModelCallCompleted as ModelTelemetry_ModelCallCompleted,
  ModelCallFailed as ModelTelemetry_ModelCallFailed,
  CompactionStarted as ModelTelemetry_CompactionStarted,
  CompactionSkipped as ModelTelemetry_CompactionSkipped,
  CompactionApplied as ModelTelemetry_CompactionApplied,
  CompactionFailed as ModelTelemetry_CompactionFailed,
  Event as ModelTelemetry_Event,
  DeliveryBatch as ModelTelemetry_DeliveryBatch,
  CompactionCommit as ModelTelemetry_CompactionCommit,
  DeliveryFailed as ModelTelemetry_DeliveryFailed,
  Delivery as ModelTelemetry_Delivery,
  layerNoop as ModelTelemetry_layerNoop,
  classifyFailureCategory as ModelTelemetry_classifyFailureCategory,
  CurrentInstrumentation as ModelTelemetry_CurrentInstrumentation,
  CurrentPurpose as ModelTelemetry_CurrentPurpose,
  CurrentCompactionId as ModelTelemetry_CurrentCompactionId,
  CurrentSummaryCall as ModelTelemetry_CurrentSummaryCall,
  generateId as ModelTelemetry_generateId,
} from "./model-telemetry.js"
export const ModelTelemetry = {
  ModelProviderUsage: ModelTelemetry_ModelProviderUsage,
  ModelCallPurpose: ModelTelemetry_ModelCallPurpose,
  ModelFailureCategory: ModelTelemetry_ModelFailureCategory,
  ModelFailureClassification: ModelTelemetry_ModelFailureClassification,
  ModelRetryReason: ModelTelemetry_ModelRetryReason,
  ModelFirstOutputKind: ModelTelemetry_ModelFirstOutputKind,
  CompactionTrigger: ModelTelemetry_CompactionTrigger,
  CompactionKind: ModelTelemetry_CompactionKind,
  ModelInvocationMethod: ModelTelemetry_ModelInvocationMethod,
  ModelInvocationStarted: ModelTelemetry_ModelInvocationStarted,
  ModelInvocationCompleted: ModelTelemetry_ModelInvocationCompleted,
  ModelInvocationFailed: ModelTelemetry_ModelInvocationFailed,
  InvocationCoordinationFailed: ModelTelemetry_InvocationCoordinationFailed,
  InvocationCoordinator: ModelTelemetry_InvocationCoordinator,
  layerInvocationCoordinatorNoop: ModelTelemetry_layerInvocationCoordinatorNoop,
  isInvocationCoordinationFailed: ModelTelemetry_isInvocationCoordinationFailed,
  ModelCallStarted: ModelTelemetry_ModelCallStarted,
  ModelAttemptStarted: ModelTelemetry_ModelAttemptStarted,
  ModelAttemptFirstOutput: ModelTelemetry_ModelAttemptFirstOutput,
  ModelAttemptCompleted: ModelTelemetry_ModelAttemptCompleted,
  ModelAttemptFailed: ModelTelemetry_ModelAttemptFailed,
  ModelRetryScheduled: ModelTelemetry_ModelRetryScheduled,
  ModelCallCompleted: ModelTelemetry_ModelCallCompleted,
  ModelCallFailed: ModelTelemetry_ModelCallFailed,
  CompactionStarted: ModelTelemetry_CompactionStarted,
  CompactionSkipped: ModelTelemetry_CompactionSkipped,
  CompactionApplied: ModelTelemetry_CompactionApplied,
  CompactionFailed: ModelTelemetry_CompactionFailed,
  Event: ModelTelemetry_Event,
  DeliveryBatch: ModelTelemetry_DeliveryBatch,
  CompactionCommit: ModelTelemetry_CompactionCommit,
  DeliveryFailed: ModelTelemetry_DeliveryFailed,
  Delivery: ModelTelemetry_Delivery,
  layerNoop: ModelTelemetry_layerNoop,
  classifyFailureCategory: ModelTelemetry_classifyFailureCategory,
  CurrentInstrumentation: ModelTelemetry_CurrentInstrumentation,
  CurrentPurpose: ModelTelemetry_CurrentPurpose,
  CurrentCompactionId: ModelTelemetry_CurrentCompactionId,
  CurrentSummaryCall: ModelTelemetry_CurrentSummaryCall,
  generateId: ModelTelemetry_generateId,
} as ModelTelemetryFacade
export namespace ModelTelemetry {
  export type ModelProviderUsage = import("./model-telemetry.js").ModelProviderUsage
  export type ModelCallPurpose = import("./model-telemetry.js").ModelCallPurpose
  export type ModelFailureCategory = import("./model-telemetry.js").ModelFailureCategory
  export type ModelFailureClassification = import("./model-telemetry.js").ModelFailureClassification
  export type ModelRetryReason = import("./model-telemetry.js").ModelRetryReason
  export type ModelFirstOutputKind = import("./model-telemetry.js").ModelFirstOutputKind
  export type CompactionTrigger = import("./model-telemetry.js").CompactionTrigger
  export type CompactionKind = import("./model-telemetry.js").CompactionKind
  export type ModelInvocationMethod = import("./model-telemetry.js").ModelInvocationMethod
  export type ModelInvocationStarted = import("./model-telemetry.js").ModelInvocationStarted
  export type ModelInvocationCompleted = import("./model-telemetry.js").ModelInvocationCompleted
  export type ModelInvocationFailed = import("./model-telemetry.js").ModelInvocationFailed
  export type InvocationCoordinationFailed = import("./model-telemetry.js").InvocationCoordinationFailed
  export type InvocationCoordinator = import("./model-telemetry.js").InvocationCoordinator
  export type layerInvocationCoordinatorNoop = typeof import("./model-telemetry.js").layerInvocationCoordinatorNoop
  export type isInvocationCoordinationFailed = typeof import("./model-telemetry.js").isInvocationCoordinationFailed
  export type ModelCallStarted = import("./model-telemetry.js").ModelCallStarted
  export type ModelAttemptStarted = import("./model-telemetry.js").ModelAttemptStarted
  export type ModelAttemptFirstOutput = import("./model-telemetry.js").ModelAttemptFirstOutput
  export type ModelAttemptCompleted = import("./model-telemetry.js").ModelAttemptCompleted
  export type ModelAttemptFailed = import("./model-telemetry.js").ModelAttemptFailed
  export type ModelRetryScheduled = import("./model-telemetry.js").ModelRetryScheduled
  export type ModelCallCompleted = import("./model-telemetry.js").ModelCallCompleted
  export type ModelCallFailed = import("./model-telemetry.js").ModelCallFailed
  export type CompactionStarted = import("./model-telemetry.js").CompactionStarted
  export type CompactionSkipped = import("./model-telemetry.js").CompactionSkipped
  export type CompactionApplied = import("./model-telemetry.js").CompactionApplied
  export type CompactionFailed = import("./model-telemetry.js").CompactionFailed
  export type Event = import("./model-telemetry.js").Event
  export type DeliveryBatch = import("./model-telemetry.js").DeliveryBatch
  export type CompactionCommit = import("./model-telemetry.js").CompactionCommit
  export type DeliveryFailed = import("./model-telemetry.js").DeliveryFailed
  export type Delivery = import("./model-telemetry.js").Delivery
  export type layerNoop = typeof import("./model-telemetry.js").layerNoop
  export type classifyFailureCategory = typeof import("./model-telemetry.js").classifyFailureCategory
  export type CurrentInstrumentation = typeof import("./model-telemetry.js").CurrentInstrumentation
  export type CurrentPurpose = typeof import("./model-telemetry.js").CurrentPurpose
  export type CurrentCompactionId = typeof import("./model-telemetry.js").CurrentCompactionId
  export type CurrentSummaryCall = typeof import("./model-telemetry.js").CurrentSummaryCall
  export type generateId = typeof import("./model-telemetry.js").generateId
  export type DeliveryInterface = import("./model-telemetry.js").DeliveryInterface
  export type EventPayload = import("./model-telemetry.js").EventPayload
  export type Instrumentation = import("./model-telemetry.js").Instrumentation
  export type InvocationCoordinatorInterface = import("./model-telemetry.js").InvocationCoordinatorInterface
  export type SummaryCallCell = import("./model-telemetry.js").SummaryCallCell
}
