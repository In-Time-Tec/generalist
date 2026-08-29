type ModelTelemetryFacade = typeof import("../telemetry/events.js")

import {
  ModelProviderUsage as ModelTelemetry_ModelProviderUsage,
  ModelCallPurpose as ModelTelemetry_ModelCallPurpose,
  ModelFailureCategory as ModelTelemetry_ModelFailureCategory,
  ModelFailureClassification as ModelTelemetry_ModelFailureClassification,
  ModelFailureDisposition as ModelTelemetry_ModelFailureDisposition,
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
  ModelFallbackScheduled as ModelTelemetry_ModelFallbackScheduled,
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
} from "../telemetry/events.js"
export const ModelTelemetry = {
  ModelProviderUsage: ModelTelemetry_ModelProviderUsage,
  ModelCallPurpose: ModelTelemetry_ModelCallPurpose,
  ModelFailureCategory: ModelTelemetry_ModelFailureCategory,
  ModelFailureClassification: ModelTelemetry_ModelFailureClassification,
  ModelFailureDisposition: ModelTelemetry_ModelFailureDisposition,
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
  ModelFallbackScheduled: ModelTelemetry_ModelFallbackScheduled,
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
} satisfies ModelTelemetryFacade
export namespace ModelTelemetry {
  export type ModelProviderUsage = import("../telemetry/events.js").ModelProviderUsage
  export type ModelCallPurpose = import("../telemetry/events.js").ModelCallPurpose
  export type ModelFailureCategory = import("../telemetry/events.js").ModelFailureCategory
  export type ModelFailureClassification = import("../telemetry/events.js").ModelFailureClassification
  export type ModelFailureDisposition = import("../telemetry/events.js").ModelFailureDisposition
  export type ModelRetryReason = import("../telemetry/events.js").ModelRetryReason
  export type ModelFirstOutputKind = import("../telemetry/events.js").ModelFirstOutputKind
  export type CompactionTrigger = import("../telemetry/events.js").CompactionTrigger
  export type CompactionKind = import("../telemetry/events.js").CompactionKind
  export type ModelInvocationMethod = import("../telemetry/events.js").ModelInvocationMethod
  export type ModelInvocationStarted = import("../telemetry/events.js").ModelInvocationStarted
  export type ModelInvocationCompleted = import("../telemetry/events.js").ModelInvocationCompleted
  export type ModelInvocationFailed = import("../telemetry/events.js").ModelInvocationFailed
  export type InvocationCoordinationFailed = import("../telemetry/events.js").InvocationCoordinationFailed
  export type InvocationCoordinator = import("../telemetry/events.js").InvocationCoordinator
  export type layerInvocationCoordinatorNoop = typeof import("../telemetry/events.js").layerInvocationCoordinatorNoop
  export type isInvocationCoordinationFailed = typeof import("../telemetry/events.js").isInvocationCoordinationFailed
  export type ModelCallStarted = import("../telemetry/events.js").ModelCallStarted
  export type ModelAttemptStarted = import("../telemetry/events.js").ModelAttemptStarted
  export type ModelAttemptFirstOutput = import("../telemetry/events.js").ModelAttemptFirstOutput
  export type ModelAttemptCompleted = import("../telemetry/events.js").ModelAttemptCompleted
  export type ModelAttemptFailed = import("../telemetry/events.js").ModelAttemptFailed
  export type ModelRetryScheduled = import("../telemetry/events.js").ModelRetryScheduled
  export type ModelFallbackScheduled = import("../telemetry/events.js").ModelFallbackScheduled
  export type ModelCallCompleted = import("../telemetry/events.js").ModelCallCompleted
  export type ModelCallFailed = import("../telemetry/events.js").ModelCallFailed
  export type CompactionStarted = import("../telemetry/events.js").CompactionStarted
  export type CompactionSkipped = import("../telemetry/events.js").CompactionSkipped
  export type CompactionApplied = import("../telemetry/events.js").CompactionApplied
  export type CompactionFailed = import("../telemetry/events.js").CompactionFailed
  export type Event = import("../telemetry/events.js").Event
  export type DeliveryBatch = import("../telemetry/events.js").DeliveryBatch
  export type CompactionCommit = import("../telemetry/events.js").CompactionCommit
  export type DeliveryFailed = import("../telemetry/events.js").DeliveryFailed
  export type Delivery = import("../telemetry/events.js").Delivery
  export type layerNoop = typeof import("../telemetry/events.js").layerNoop
  export type classifyFailureCategory = typeof import("../telemetry/events.js").classifyFailureCategory
  export type CurrentInstrumentation = typeof import("../telemetry/events.js").CurrentInstrumentation
  export type CurrentPurpose = typeof import("../telemetry/events.js").CurrentPurpose
  export type CurrentCompactionId = typeof import("../telemetry/events.js").CurrentCompactionId
  export type CurrentSummaryCall = typeof import("../telemetry/events.js").CurrentSummaryCall
  export type generateId = typeof import("../telemetry/events.js").generateId
  export type DeliveryService = import("../telemetry/events.js").DeliveryService
  export type EventPayload = import("../telemetry/events.js").EventPayload
  export type Instrumentation = import("../telemetry/events.js").Instrumentation
  export type InvocationCoordinatorService = import("../telemetry/events.js").InvocationCoordinatorService
  export type SummaryCallCell = import("../telemetry/events.js").SummaryCallCell
}
