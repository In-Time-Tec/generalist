import { Cause, Clock, Duration, Effect, Option, Schedule, Schema } from "effect"
import { AiError, Response, ResponseIdTracker } from "effect/unstable/ai"
import type { Classification, Interface as Resilience } from "../resilience.js"
import type { EventPayload, ModelFailureCategory, ModelFirstOutputKind } from "../telemetry/events.js"

export const disabledResponseIdTracker: ResponseIdTracker.Service = {
  clearUnsafe: () => undefined,
  markParts: () => undefined,
  prepareUnsafe: () => Option.none(),
}

const ProviderTokenCount = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(0),
  Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
)

export const ModelProviderUsage = Schema.Struct({
  inputTokens: Schema.optionalKey(ProviderTokenCount),
  outputTokens: Schema.optionalKey(ProviderTokenCount),
  totalTokens: Schema.optionalKey(ProviderTokenCount),
})

export type ModelProviderUsage = typeof ModelProviderUsage.Type

type ObservedFailure = Parameters<Resilience["classify"]>[0]

const InvalidToolCallUsage = Schema.TaggedStruct("tenetkit/core/InvalidToolCallParameters", {
  providerUsage: ModelProviderUsage,
})

const tokenCount = (value: number | undefined): number | undefined =>
  value !== undefined && Number.isSafeInteger(value) && value >= 0 ? value : undefined

const makeProviderUsage = (
  input: number | undefined,
  output: number | undefined,
  total: number | undefined,
): ModelProviderUsage | undefined => {
  const inputTokens = tokenCount(input)
  const outputTokens = tokenCount(output)
  const totalTokens = tokenCount(total)
  if (inputTokens === undefined && outputTokens === undefined && totalTokens === undefined) return undefined
  let usage: ModelProviderUsage = {}
  if (inputTokens !== undefined) usage = { ...usage, inputTokens }
  if (outputTokens !== undefined) usage = { ...usage, outputTokens }
  if (totalTokens !== undefined) usage = { ...usage, totalTokens }
  return usage
}

const responseUsageToProviderUsage = (usage: Response.Usage): ModelProviderUsage | undefined =>
  makeProviderUsage(usage.inputTokens.total, usage.outputTokens.total, undefined)

const providerUsageFromError = (error: ObservedFailure): ModelProviderUsage | undefined => {
  if (Schema.is(InvalidToolCallUsage)(error)) return error.providerUsage
  if (!AiError.isAiError(error)) return undefined
  if (error.reason._tag !== "InvalidOutputError" && error.reason._tag !== "StructuredOutputError") return undefined
  const usage = error.reason.usage
  return usage === undefined
    ? undefined
    : makeProviderUsage(usage.promptTokens, usage.completionTokens, usage.totalTokens)
}

const addTokenCount = (left: number | undefined, right: number | undefined): number | undefined => {
  if (left === undefined) return right
  if (right === undefined) return left
  const total = left + right
  return Number.isSafeInteger(total) ? total : undefined
}

const addProviderUsage = (
  left: ModelProviderUsage | undefined,
  right: ModelProviderUsage | undefined,
): ModelProviderUsage | undefined => {
  if (left === undefined) return right
  if (right === undefined) return left
  const inputTokens = addTokenCount(left.inputTokens, right.inputTokens)
  const outputTokens = addTokenCount(left.outputTokens, right.outputTokens)
  const totalTokens = addTokenCount(left.totalTokens, right.totalTokens)
  let usage: ModelProviderUsage = {}
  if (inputTokens !== undefined) usage = { ...usage, inputTokens }
  if (outputTokens !== undefined) usage = { ...usage, outputTokens }
  if (totalTokens !== undefined) usage = { ...usage, totalTokens }
  return usage
}

export const providerUsage = {
  add: addProviderUsage,
  fromError: providerUsageFromError,
  fromResponse: responseUsageToProviderUsage,
}

export const memoized = <Result>(compute: (error: ObservedFailure) => Result): ((error: ObservedFailure) => Result) => {
  const cache = new Map<ObservedFailure, Result>()
  return (error: ObservedFailure): Result => {
    const cached = cache.get(error)
    if (cached !== undefined) return cached
    const result = compute(error)
    cache.set(error, result)
    return result
  }
}

export const singleFailure = (cause: Cause.Cause<unknown>): Option.Option<unknown> => {
  const reason = cause.reasons.length === 1 ? cause.reasons[0] : undefined
  return reason !== undefined && Cause.isFailReason(reason) ? Option.some(reason.error) : Option.none()
}

export const firstOutputKind = (part: Response.AnyPart): ModelFirstOutputKind | undefined => {
  switch (part.type) {
    case "reasoning-start":
    case "reasoning-delta":
    case "reasoning":
      return "reasoning"
    case "text-start":
    case "text-delta":
    case "text":
      return "text"
    case "tool-params-start":
    case "tool-call":
      return "tool-call"
    default:
      return undefined
  }
}

interface RetryContext {
  readonly resilience: Resilience
  readonly classify: (error: ObservedFailure) => Classification
  readonly categorize: (error: ObservedFailure) => ModelFailureCategory
  readonly attempt: () => number
  readonly turn: number
  readonly modelCallId: string
  readonly emit: (event: EventPayload) => Effect.Effect<void>
  readonly settleFailure: Effect.Effect<void>
}

export const tapRetryTelemetry = (context: RetryContext): Resilience => {
  const policy: Resilience = {
    classify: context.classify,
    resolve: context.resilience.resolve,
    invalidToolCallCorrectionLimit: context.resilience.invalidToolCallCorrectionLimit,
    retrySchedule: context.resilience.retrySchedule.pipe(
      Schedule.while(({ input }) => context.classify(input) === "transient"),
      Schedule.tap((metadata) =>
        context.settleFailure.pipe(
          Effect.andThen(Clock.currentTimeMillis),
          Effect.flatMap((at) =>
            context.emit({
              _tag: "ModelRetryScheduled",
              turn: context.turn,
              modelCallId: context.modelCallId,
              attempt: context.attempt(),
              reason: "provider-resilience",
              category: context.categorize(metadata.input),
              delayMillis: Duration.toMillis(metadata.duration),
              at,
            }),
          ),
        ),
      ),
    ),
  }
  const streamIdleTimeout = context.resilience.streamIdleTimeout
  return streamIdleTimeout === undefined ? policy : { ...policy, streamIdleTimeout }
}
