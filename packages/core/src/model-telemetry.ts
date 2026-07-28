import { Cause, Context, Effect, Layer, Option, Schema } from "effect"
import { AiError, IdGenerator, LanguageModel, Response } from "effect/unstable/ai"
import { isTerminationFailure } from "./model-stream-termination.js"

/** @experimental Bounded purpose of one model call issued by the loop. */
export const ModelCallPurpose = Schema.Literals(["conversation", "structured-output", "compaction-summary"])

/** @experimental */
export type ModelCallPurpose = typeof ModelCallPurpose.Type

/** @experimental Bounded provider-neutral model failure category. */
export const ModelFailureCategory = Schema.Literals([
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
export type ModelFailureCategory = typeof ModelFailureCategory.Type

/** @experimental Classification a retry decision was based on. */
export const ModelFailureClassification = Schema.Literals(["transient", "terminal"])

/** @experimental */
export type ModelFailureClassification = typeof ModelFailureClassification.Type

/**
 * @experimental Bounded reason a model attempt retry was scheduled. Baton
 * currently emits only `provider-resilience`; `invalid-tool-call-correction`
 * is reserved for a retry path that changes the request before retrying.
 */
export const ModelRetryReason = Schema.Literals(["provider-resilience", "invalid-tool-call-correction"])

/** @experimental */
export type ModelRetryReason = typeof ModelRetryReason.Type

/** @experimental Kind of the first output part produced by a model attempt. */
export const ModelFirstOutputKind = Schema.Literals(["reasoning", "text", "tool-call"])

/** @experimental */
export type ModelFirstOutputKind = typeof ModelFirstOutputKind.Type

/** @experimental Provider-reported cost. Absent means unknown; Baton never estimates. */
export const ModelCost = Schema.Struct({
  amount: Schema.Finite,
  currency: Schema.String,
})

/** @experimental */
export type ModelCost = typeof ModelCost.Type

/** @experimental What caused a compaction pass to run. */
export const CompactionTrigger = Schema.Literals(["threshold", "overflow"])

/** @experimental */
export type CompactionTrigger = typeof CompactionTrigger.Type

/** @experimental How a completed compaction pass reduced context. */
export const CompactionKind = Schema.Literals(["microcompact", "summarize", "unchanged"])

/** @experimental */
export type CompactionKind = typeof CompactionKind.Type

const attemptOrdinal = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))

/**
 * @experimental A model call began. One call spans every provider attempt made
 * for one prepared input. All timestamps are epoch milliseconds sampled from
 * the Effect Clock at the operation boundary.
 */
export const ModelCallStarted = Schema.Struct({
  _tag: Schema.tag("ModelCallStarted"),
  deliveryId: Schema.String,
  turn: Schema.Finite,
  modelCallId: Schema.String,
  purpose: ModelCallPurpose,
  provider: Schema.optionalKey(Schema.String),
  model: Schema.optionalKey(Schema.String),
  compactionId: Schema.optionalKey(Schema.String),
  startedAt: Schema.Finite,
})

/** @experimental */
export type ModelCallStarted = typeof ModelCallStarted.Type

/** @experimental One provider invocation within a model call began. `attempt` is 0-based. */
export const ModelAttemptStarted = Schema.Struct({
  _tag: Schema.tag("ModelAttemptStarted"),
  deliveryId: Schema.String,
  turn: Schema.Finite,
  modelCallId: Schema.String,
  modelAttemptId: Schema.String,
  attempt: attemptOrdinal,
  startedAt: Schema.Finite,
})

/** @experimental */
export type ModelAttemptStarted = typeof ModelAttemptStarted.Type

/** @experimental The first reasoning, text, or tool-call output of one attempt; at most one event per kind. */
export const ModelAttemptFirstOutput = Schema.Struct({
  _tag: Schema.tag("ModelAttemptFirstOutput"),
  deliveryId: Schema.String,
  turn: Schema.Finite,
  modelCallId: Schema.String,
  modelAttemptId: Schema.String,
  attempt: attemptOrdinal,
  kind: ModelFirstOutputKind,
  at: Schema.Finite,
})

/** @experimental */
export type ModelAttemptFirstOutput = typeof ModelAttemptFirstOutput.Type

/**
 * @experimental A provider invocation finished. A completed attempt always
 * carries the provider's terminal `finish` part, so usage, `usageAt`, and
 * `finishReason` are required; an attempt whose stream ended without one is
 * reported as `ModelAttemptFailed` with category `truncated-stream`. Absent
 * request correlation, service tier, and cost fields mean unknown, never zero.
 * `usageAt` is sampled when provider-reported usage was received, which can
 * precede stream completion.
 */
export const ModelAttemptCompleted = Schema.Struct({
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
  requestId: Schema.optionalKey(Schema.String),
  responseModel: Schema.optionalKey(Schema.String),
  serviceTier: Schema.optionalKey(Schema.String),
  cost: Schema.optionalKey(ModelCost),
})

/** @experimental */
export type ModelAttemptCompleted = typeof ModelAttemptCompleted.Type

/** @experimental A provider invocation failed with a bounded category. */
export const ModelAttemptFailed = Schema.Struct({
  _tag: Schema.tag("ModelAttemptFailed"),
  deliveryId: Schema.String,
  turn: Schema.Finite,
  modelCallId: Schema.String,
  modelAttemptId: Schema.String,
  attempt: attemptOrdinal,
  failedAt: Schema.Finite,
  category: ModelFailureCategory,
  classification: ModelFailureClassification,
})

/** @experimental */
export type ModelAttemptFailed = typeof ModelAttemptFailed.Type

/**
 * @experimental A retry of the model call was accepted. `attempt` is the
 * 0-based ordinal of the attempt that failed; emitted before the backoff
 * sleep. `delayMillis` is the accepted backoff delay.
 */
export const ModelRetryScheduled = Schema.Struct({
  _tag: Schema.tag("ModelRetryScheduled"),
  deliveryId: Schema.String,
  turn: Schema.Finite,
  modelCallId: Schema.String,
  attempt: attemptOrdinal,
  reason: ModelRetryReason,
  category: ModelFailureCategory,
  delayMillis: Schema.Finite,
  at: Schema.Finite,
})

/** @experimental */
export type ModelRetryScheduled = typeof ModelRetryScheduled.Type

/** @experimental The model call reached a successful terminal outcome. */
export const ModelCallCompleted = Schema.Struct({
  _tag: Schema.tag("ModelCallCompleted"),
  deliveryId: Schema.String,
  turn: Schema.Finite,
  modelCallId: Schema.String,
  purpose: ModelCallPurpose,
  attempts: attemptOrdinal,
  completedAt: Schema.Finite,
  usage: Schema.optionalKey(Response.Usage),
  finishReason: Schema.optionalKey(Response.FinishReason),
})

/** @experimental */
export type ModelCallCompleted = typeof ModelCallCompleted.Type

/**
 * @experimental The model call reached a failed terminal outcome. `category`
 * and `classification` are decided the same way as on `ModelAttemptFailed`, so
 * a consumer never has to infer retryability from an absent field. The two
 * levels differ only when resilience refuses to replay a retryable failure
 * because output already escaped: the attempt reports the failure's own
 * classification while the call reports `terminal`.
 */
export const ModelCallFailed = Schema.Struct({
  _tag: Schema.tag("ModelCallFailed"),
  deliveryId: Schema.String,
  turn: Schema.Finite,
  modelCallId: Schema.String,
  purpose: ModelCallPurpose,
  attempts: attemptOrdinal,
  failedAt: Schema.Finite,
  category: ModelFailureCategory,
  classification: ModelFailureClassification,
})

/** @experimental */
export type ModelCallFailed = typeof ModelCallFailed.Type

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

/**
 * @experimental A compaction pass produced its result. Session checkpoint and
 * projection application follow, and their failure fails the run typed.
 * `summaryModelCallId` names the summary model call when one ran; that call
 * also carries this pass's `compactionId` on its `ModelCallStarted` event.
 */
export const CompactionCompleted = Schema.Struct({
  _tag: Schema.tag("CompactionCompleted"),
  deliveryId: Schema.String,
  turn: Schema.Finite,
  compactionId: Schema.String,
  kind: CompactionKind,
  completedAt: Schema.Finite,
  summaryModelCallId: Schema.optionalKey(Schema.String),
})

/** @experimental */
export type CompactionCompleted = typeof CompactionCompleted.Type

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
  ModelCallStarted,
  ModelAttemptStarted,
  ModelAttemptFirstOutput,
  ModelAttemptCompleted,
  ModelAttemptFailed,
  ModelRetryScheduled,
  ModelCallCompleted,
  ModelCallFailed,
  CompactionStarted,
  CompactionCompleted,
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

/** @experimental Host telemetry delivery failure. A remote failure can be ambiguous; reconcile with the sink. */
export class DeliveryFailed extends Schema.TaggedErrorClass<DeliveryFailed>()("@batonfx/core/DeliveryFailed", {
  message: Schema.String,
  cause: Schema.optionalKey(Schema.Defect()),
}) {}

/** @experimental Host sink for ordered, backpressured lifecycle delivery. Deduplicate by `(sessionId, deliveryId)`. */
export interface DeliveryInterface {
  readonly deliver: (batch: DeliveryBatch) => Effect.Effect<void, DeliveryFailed>
}

/** @experimental */
export class Delivery extends Context.Service<Delivery, DeliveryInterface>()("@batonfx/core/Delivery") {}

/** @experimental No-op host delivery sink. */
export const layerNoop: Layer.Layer<Delivery> = Layer.succeed(Delivery, Delivery.of({ deliver: () => Effect.void }))

/** @experimental Map a model failure onto the bounded cross-provider category. */
export const classifyFailureCategory = (error: unknown): ModelFailureCategory => {
  if (isTerminationFailure(error)) return "truncated-stream"
  if (Cause.isTimeoutError(error)) return "timeout"
  if (!AiError.isAiError(error)) return "unknown"
  switch (error.reason._tag) {
    case "AuthenticationError":
      return "authentication"
    case "RateLimitError":
      return "rate-limit"
    case "QuotaExhaustedError":
      return "token-budget"
    case "NetworkError":
      return "transport"
    case "ContentPolicyError":
    case "InternalProviderError":
    case "InvalidRequestError":
    case "InvalidUserInputError":
    case "UnsupportedSchemaError":
      return "provider-response"
    case "InvalidOutputError":
    case "StructuredOutputError":
      return "stream-decode"
    case "InvalidToolResultError":
    case "ToolConfigurationError":
    case "ToolNotFoundError":
    case "ToolParameterValidationError":
    case "ToolResultEncodingError":
    case "ToolkitRequiredError":
      return "invalid-tool-call"
    case "UnknownError":
      return "unknown"
  }
}

/** @experimental The active loop's model-call telemetry seam. */
export interface Instrumentation {
  readonly emit: (event: EventPayload) => Effect.Effect<void>
  readonly wrap: (model: LanguageModel.Service) => LanguageModel.Service
}

/** @experimental The instrumentation of the enclosing agent run, when present. */
export const CurrentInstrumentation: Context.Reference<Instrumentation | undefined> = Context.Reference<
  Instrumentation | undefined
>("@batonfx/core/ModelTelemetry/CurrentInstrumentation", { defaultValue: () => undefined })

/** @experimental Purpose stamped onto model calls issued within the current region. */
export const CurrentPurpose: Context.Reference<ModelCallPurpose> = Context.Reference<ModelCallPurpose>(
  "@batonfx/core/ModelTelemetry/CurrentPurpose",
  { defaultValue: () => "conversation" },
)

/** @experimental Compaction pass identifier stamped onto model calls it issues. */
export const CurrentCompactionId: Context.Reference<string | undefined> = Context.Reference<string | undefined>(
  "@batonfx/core/ModelTelemetry/CurrentCompactionId",
  { defaultValue: () => undefined },
)

/** @experimental Mutable cell recording the model call a compaction pass issued for its summary. */
export interface SummaryCallCell {
  current: string | undefined
}

/** @experimental Cell a compaction pass provides to learn its summary model-call id. */
export const CurrentSummaryCall: Context.Reference<SummaryCallCell | undefined> = Context.Reference<
  SummaryCallCell | undefined
>("@batonfx/core/ModelTelemetry/CurrentSummaryCall", { defaultValue: () => undefined })

/** @experimental Generate one telemetry identifier via `IdGenerator`, defaulting when absent. */
export const generateId: Effect.Effect<string> = Effect.flatMap(
  Effect.serviceOption(IdGenerator.IdGenerator),
  (service) => Option.getOrElse(service, () => IdGenerator.defaultIdGenerator).generateId(),
)
