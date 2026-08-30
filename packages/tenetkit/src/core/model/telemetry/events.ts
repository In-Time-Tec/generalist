import { Schema, Cause } from "effect"
import { AiError, Response } from "effect/unstable/ai"
import {
  ProviderUsage as ProviderUsageSchema,
  type ProviderUsage as ProviderUsageValue,
} from "../attempt/observation.js"
import { isTimeout, isTerminationFailure } from "../stream-termination.js"
import { isInvalidToolCallParameters } from "../tool-call-validation.js"
export {
  Delivery,
  DeliveryFailed,
  InvocationCoordinationFailed,
  InvocationCoordinator,
  generateId,
  isInvocationCoordinationFailed,
  layerInvocationCoordinatorNoop,
  layerNoop,
  type DeliveryService,
  type InvocationCoordinatorService,
} from "./services.js"
export {
  CurrentCompactionId,
  CurrentInstrumentation,
  CurrentPurpose,
  CurrentSummaryCall,
  type Instrumentation,
  type SummaryCallCell,
} from "./context.js"

/** @experimental */
export const ProviderUsage = ProviderUsageSchema

/** @experimental */
export type ProviderUsage = ProviderUsageValue

/** @experimental Bounded purpose of one model call issued by the loop. */
export const CallPurpose = Schema.Literals(["conversation", "structured-output", "compaction-summary"])

/** @experimental */
export type CallPurpose = typeof CallPurpose.Type

/** @experimental Bounded provider-neutral model failure category. */
export const FailureCategory = Schema.Literals([
  "authentication",
  "rate-limit",
  "transport",
  "provider-response",
  "stream-decode",
  "truncated-stream",
  "context-overflow",
  "invalid-tool-call",
  "token-budget",
  "timeout",
  "cancellation",
  "unknown",
])

/** @experimental */
export type FailureCategory = typeof FailureCategory.Type

/** @experimental Classification a retry decision was based on. */
export const FailureClassification = Schema.Literals(["transient", "terminal"])

/** @experimental */
export type FailureClassification = typeof FailureClassification.Type

/** @experimental Decision taken after a provider attempt failed. */
export const FailureDisposition = Schema.Literals(["retry", "fallback", "terminal"])

/** @experimental */
export type FailureDisposition = typeof FailureDisposition.Type

/**
 * @experimental Bounded reason a model attempt retry was scheduled.
 */
export const RetryReason = Schema.Literals(["provider-resilience", "invalid-tool-call-correction"])

/** @experimental */
export type RetryReason = typeof RetryReason.Type

/** @experimental Kind of the first output part produced by a model attempt. */
export const FirstOutputKind = Schema.Literals(["reasoning", "text", "tool-call"])

/** @experimental */
export type FirstOutputKind = typeof FirstOutputKind.Type

/** @experimental What caused a compaction pass to run. */
export const CompactionTrigger = Schema.Literals(["threshold", "overflow"])

/** @experimental */
export type CompactionTrigger = typeof CompactionTrigger.Type

/** @experimental How a completed compaction pass reduced context. */
export const CompactionKind = Schema.Literals(["microcompact", "summarize", "unchanged"])

/** @experimental */
export type CompactionKind = typeof CompactionKind.Type

const attemptOrdinal = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))

export const ModelInvocationMethod = Schema.Literals(["generateText", "generateObject", "streamText"])
export type ModelInvocationMethod = typeof ModelInvocationMethod.Type

export const ModelInvocationStarted = Schema.Struct({
  logicalOperationId: Schema.String,
  modelCallId: Schema.String,
  modelAttemptId: Schema.String,
  callOrdinal: attemptOrdinal,
  attempt: attemptOrdinal,
  turn: Schema.Finite,
  purpose: CallPurpose,
  method: ModelInvocationMethod,
  provider: Schema.optionalKey(Schema.String),
  model: Schema.optionalKey(Schema.String),
  registrationKey: Schema.optionalKey(Schema.String),
  candidate: Schema.optionalKey(attemptOrdinal),
  startedAt: Schema.Finite,
})
export type ModelInvocationStarted = typeof ModelInvocationStarted.Type

export const ModelInvocationCompleted = Schema.Struct({
  logicalOperationId: Schema.String,
  modelCallId: Schema.String,
  modelAttemptId: Schema.String,
  attempt: attemptOrdinal,
  completedAt: Schema.Finite,
  usage: Response.Usage,
  finishReason: Response.FinishReason,
  providerMetadata: Schema.optionalKey(Response.ProviderMetadata),
  requestId: Schema.optionalKey(Schema.String),
  responseModel: Schema.optionalKey(Schema.String),
  provider: Schema.optionalKey(Schema.String),
  model: Schema.optionalKey(Schema.String),
  registrationKey: Schema.optionalKey(Schema.String),
  candidate: Schema.optionalKey(attemptOrdinal),
})
export type ModelInvocationCompleted = typeof ModelInvocationCompleted.Type

export const ModelInvocationFailed = Schema.Struct({
  logicalOperationId: Schema.String,
  modelCallId: Schema.String,
  modelAttemptId: Schema.String,
  attempt: attemptOrdinal,
  failedAt: Schema.Finite,
  category: FailureCategory,
  classification: FailureClassification,
  disposition: FailureDisposition,
  provider: Schema.optionalKey(Schema.String),
  model: Schema.optionalKey(Schema.String),
  registrationKey: Schema.optionalKey(Schema.String),
  candidate: Schema.optionalKey(attemptOrdinal),
})
export type ModelInvocationFailed = typeof ModelInvocationFailed.Type

/**
 * @experimental A model call began. One call spans every provider attempt made
 * for one prepared input. All timestamps are epoch milliseconds sampled from
 * the Effect Clock at the operation boundary.
 */
export const CallStarted = Schema.Struct({
  _tag: Schema.tag("ModelCallStarted"),
  deliveryId: Schema.String,
  turn: Schema.Finite,
  modelCallId: Schema.String,
  purpose: CallPurpose,
  provider: Schema.optionalKey(Schema.String),
  model: Schema.optionalKey(Schema.String),
  compactionId: Schema.optionalKey(Schema.String),
  startedAt: Schema.Finite,
})

/** @experimental */
export type CallStarted = typeof CallStarted.Type

/** @experimental One provider invocation within a model call began. `attempt` is 0-based. */
export const AttemptStarted = Schema.Struct({
  _tag: Schema.tag("ModelAttemptStarted"),
  deliveryId: Schema.String,
  turn: Schema.Finite,
  modelCallId: Schema.String,
  modelAttemptId: Schema.String,
  attempt: attemptOrdinal,
  provider: Schema.optionalKey(Schema.String),
  model: Schema.optionalKey(Schema.String),
  registrationKey: Schema.optionalKey(Schema.String),
  candidate: Schema.optionalKey(attemptOrdinal),
  startedAt: Schema.Finite,
})

/** @experimental */
export type AttemptStarted = typeof AttemptStarted.Type

/** @experimental The first reasoning, text, or tool-call output of one attempt; at most one event per kind. */
export const AttemptFirstOutput = Schema.Struct({
  _tag: Schema.tag("ModelAttemptFirstOutput"),
  deliveryId: Schema.String,
  turn: Schema.Finite,
  modelCallId: Schema.String,
  modelAttemptId: Schema.String,
  attempt: attemptOrdinal,
  kind: FirstOutputKind,
  at: Schema.Finite,
})

/** @experimental */
export type AttemptFirstOutput = typeof AttemptFirstOutput.Type

/**
 * @experimental A provider invocation finished. A completed attempt always
 * carries the provider's terminal `finish` part, so usage, `usageAt`, and
 * `finishReason` are required; an attempt whose stream ended without one is
 * reported as `AttemptFailed` with category `truncated-stream`. Absent
 * request correlation and service tier fields mean unknown, never zero.
 * `usageAt` is sampled when provider-reported usage was received, which can
 * precede stream completion.
 */
export const AttemptCompleted = Schema.Struct({
  _tag: Schema.tag("ModelAttemptCompleted"),
  deliveryId: Schema.String,
  turn: Schema.Finite,
  modelCallId: Schema.String,
  modelAttemptId: Schema.String,
  attempt: attemptOrdinal,
  completedAt: Schema.Finite,
  usage: Response.Usage,
  usageAt: Schema.Finite,
  finishReason: Response.FinishReason,
  providerMetadata: Schema.optionalKey(Response.ProviderMetadata),
  provider: Schema.optionalKey(Schema.String),
  model: Schema.optionalKey(Schema.String),
  registrationKey: Schema.optionalKey(Schema.String),
  candidate: Schema.optionalKey(attemptOrdinal),
  requestId: Schema.optionalKey(Schema.String),
  responseModel: Schema.optionalKey(Schema.String),
  serviceTier: Schema.optionalKey(Schema.String),
})

/** @experimental */
export type AttemptCompleted = typeof AttemptCompleted.Type

/** @experimental A provider invocation failed with a bounded category. */
export const AttemptFailed = Schema.Struct({
  _tag: Schema.tag("ModelAttemptFailed"),
  deliveryId: Schema.String,
  turn: Schema.Finite,
  modelCallId: Schema.String,
  modelAttemptId: Schema.String,
  attempt: attemptOrdinal,
  failedAt: Schema.Finite,
  category: FailureCategory,
  classification: FailureClassification,
  disposition: FailureDisposition,
  provider: Schema.optionalKey(Schema.String),
  model: Schema.optionalKey(Schema.String),
  registrationKey: Schema.optionalKey(Schema.String),
  candidate: Schema.optionalKey(attemptOrdinal),
  providerUsage: Schema.optionalKey(ProviderUsage),
})

/** @experimental */
export type AttemptFailed = typeof AttemptFailed.Type

/** @experimental An unavailable candidate was exhausted before any replay-sensitive output escaped. */
export const FallbackScheduled = Schema.Struct({
  _tag: Schema.tag("ModelFallbackScheduled"),
  deliveryId: Schema.String,
  turn: Schema.Finite,
  modelCallId: Schema.String,
  attempt: attemptOrdinal,
  fromCandidate: attemptOrdinal,
  fromProvider: Schema.String,
  fromModel: Schema.String,
  fromRegistrationKey: Schema.optionalKey(Schema.String),
  toCandidate: attemptOrdinal,
  toProvider: Schema.String,
  toModel: Schema.String,
  toRegistrationKey: Schema.optionalKey(Schema.String),
  category: FailureCategory,
  at: Schema.Finite,
})

/** @experimental */
export type FallbackScheduled = typeof FallbackScheduled.Type

/** @experimental Atomic checkpoint record joining a compaction pass to its telemetry and projection. */
export const CompactionCommit = Schema.Struct({
  compactionId: Schema.String,
  checkpointId: Schema.String,
  summaryModelCallId: Schema.optionalKey(Schema.String),
  contextTokensBefore: Schema.optionalKey(Schema.Finite),
  contextTokensAfter: Schema.optionalKey(Schema.Finite),
  entriesBefore: Schema.optionalKey(Schema.Finite),
  entriesAfter: Schema.optionalKey(Schema.Finite),
})

/** @experimental */
export type CompactionCommit = typeof CompactionCommit.Type

/**
 * @experimental A retry of the model call was accepted. `attempt` is the
 * 0-based ordinal of the attempt that failed; emitted before the backoff
 * sleep. `delayMillis` is the accepted backoff delay.
 */
export const RetryScheduled = Schema.Struct({
  _tag: Schema.tag("ModelRetryScheduled"),
  deliveryId: Schema.String,
  turn: Schema.Finite,
  modelCallId: Schema.String,
  attempt: attemptOrdinal,
  reason: RetryReason,
  category: FailureCategory,
  delayMillis: Schema.Finite,
  at: Schema.Finite,
})

/** @experimental */
export type RetryScheduled = typeof RetryScheduled.Type

/** @experimental The model call reached a successful terminal outcome. */
export const CallCompleted = Schema.Struct({
  _tag: Schema.tag("ModelCallCompleted"),
  deliveryId: Schema.String,
  turn: Schema.Finite,
  modelCallId: Schema.String,
  purpose: CallPurpose,
  attempts: attemptOrdinal,
  completedAt: Schema.Finite,
  usage: Schema.optionalKey(Response.Usage),
  failedAttemptUsage: Schema.optionalKey(ProviderUsage),
  finishReason: Schema.optionalKey(Response.FinishReason),
})

/** @experimental */
export type CallCompleted = typeof CallCompleted.Type

/**
 * @experimental The model call reached a failed terminal outcome. `category`
 * and `classification` are decided the same way as on `AttemptFailed`, so
 * a consumer never has to infer retryability from an absent field. The two
 * levels differ only when resilience refuses to replay a retryable failure
 * because output already escaped: the attempt reports the failure's own
 * classification while the call reports `terminal`.
 */
export const CallFailed = Schema.Struct({
  _tag: Schema.tag("ModelCallFailed"),
  deliveryId: Schema.String,
  turn: Schema.Finite,
  modelCallId: Schema.String,
  purpose: CallPurpose,
  attempts: attemptOrdinal,
  failedAt: Schema.Finite,
  category: FailureCategory,
  classification: FailureClassification,
  failedAttemptUsage: Schema.optionalKey(ProviderUsage),
})

/** @experimental */
export type CallFailed = typeof CallFailed.Type

/** @experimental A compaction pass that decided to do work began. */
export const CompactionStarted = Schema.Struct({
  _tag: Schema.tag("CompactionStarted"),
  deliveryId: Schema.String,
  turn: Schema.Finite,
  compactionId: Schema.String,
  trigger: CompactionTrigger,
  startedAt: Schema.Finite,
  contextTokensBefore: Schema.optionalKey(Schema.Finite),
  entriesBefore: Schema.optionalKey(Schema.Finite),
})

/** @experimental */
export type CompactionStarted = typeof CompactionStarted.Type

/** @experimental A started compaction pass found no projection change to apply. */
export const CompactionSkipped = Schema.Struct({
  _tag: Schema.tag("CompactionSkipped"),
  deliveryId: Schema.String,
  turn: Schema.Finite,
  compactionId: Schema.String,
  skippedAt: Schema.Finite,
})

/** @experimental */
export type CompactionSkipped = typeof CompactionSkipped.Type

/**
 * @experimental A compaction pass produced its result. Session checkpoint and
 * projection application follow, and their failure fails the run typed.
 * `summaryModelCallId` names the summary model call when one ran; that call
 * also carries this pass's `compactionId` on its `CallStarted` event.
 */
export const CompactionApplied = Schema.Struct({
  _tag: Schema.tag("CompactionApplied"),
  deliveryId: Schema.String,
  turn: Schema.Finite,
  compactionId: Schema.String,
  checkpointId: Schema.String,
  kind: Schema.Literals(["microcompact", "summarize"]),
  appliedAt: Schema.Finite,
  commit: CompactionCommit,
})

/** @experimental */
export type CompactionApplied = typeof CompactionApplied.Type

/** @experimental A compaction pass failed or was interrupted after work began. */
export const CompactionFailed = Schema.Struct({
  _tag: Schema.tag("CompactionFailed"),
  deliveryId: Schema.String,
  turn: Schema.Finite,
  compactionId: Schema.String,
  failedAt: Schema.Finite,
})

/** @experimental */
export type CompactionFailed = typeof CompactionFailed.Type

/**
 * @experimental Closed union of model-call, retry, and compaction telemetry
 * events. Events carry timestamps sampled at their real operation boundary and
 * are delivered in causal order within the agent event stream, flushed at the
 * next event boundary or at stream end.
 */
export const Event = Schema.Union([
  CallStarted,
  AttemptStarted,
  AttemptFirstOutput,
  AttemptCompleted,
  AttemptFailed,
  RetryScheduled,
  FallbackScheduled,
  CallCompleted,
  CallFailed,
  CompactionStarted,
  CompactionSkipped,
  CompactionApplied,
  CompactionFailed,
])

/** @experimental */
export type Event = typeof Event.Type

/** @experimental One ordered telemetry delivery batch scoped to its agent session. */
export const DeliveryBatch = Schema.Struct({
  sessionId: Schema.String,
  events: Schema.Array(Event),
})

/** @experimental */
export type DeliveryBatch = typeof DeliveryBatch.Type

type WithoutDeliveryId<T> = T extends Event ? Omit<T, "deliveryId"> : never

/** @experimental Lifecycle payload before the run assigns its stable delivery identifier. */
export type EventPayload = WithoutDeliveryId<Event>

const failureCategoryByReason = {
  AuthenticationError: "authentication",
  RateLimitError: "rate-limit",
  QuotaExhaustedError: "token-budget",
  NetworkError: "transport",
  ContentPolicyError: "provider-response",
  InternalProviderError: "provider-response",
  InvalidRequestError: "provider-response",
  InvalidUserInputError: "provider-response",
  UnsupportedSchemaError: "provider-response",
  InvalidOutputError: "stream-decode",
  StructuredOutputError: "stream-decode",
  InvalidToolResultError: "invalid-tool-call",
  ToolConfigurationError: "invalid-tool-call",
  ToolNotFoundError: "invalid-tool-call",
  ToolParameterValidationError: "invalid-tool-call",
  ToolResultEncodingError: "invalid-tool-call",
  ToolkitRequiredError: "invalid-tool-call",
  UnknownError: "unknown",
} satisfies Record<AiError.AiError["reason"]["_tag"], FailureCategory>

/** @experimental Map a model failure onto the bounded cross-provider category. */
export const classifyFailureCategory = <E>(error: E): FailureCategory => {
  if (isTimeout(error) || Cause.isTimeoutError(error)) return "timeout"
  if (isTerminationFailure(error)) return "truncated-stream"
  if (isInvalidToolCallParameters(error)) return "invalid-tool-call"
  if (!AiError.isAiError(error)) return "unknown"
  return failureCategoryByReason[error.reason._tag]
}
