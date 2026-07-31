import { Function } from "effect"
import { AiError } from "effect/unstable/ai"
import type { ModelProviderUsage } from "./model-telemetry.js"

const tokenCount = (value: number | undefined): number | undefined =>
  value !== undefined && Number.isSafeInteger(value) && value >= 0 ? value : undefined

export const providerUsageFromAiError = (error: unknown): ModelProviderUsage | undefined => {
  if (!AiError.isAiError(error)) return undefined
  if (error.reason._tag !== "InvalidOutputError" && error.reason._tag !== "StructuredOutputError") return undefined
  const usage = error.reason.usage
  if (usage === undefined) return undefined
  const inputTokens = tokenCount(usage.promptTokens)
  const outputTokens = tokenCount(usage.completionTokens)
  const totalTokens = tokenCount(usage.totalTokens)
  if (inputTokens === undefined && outputTokens === undefined && totalTokens === undefined) return undefined
  return {
    ...(inputTokens === undefined ? {} : { inputTokens }),
    ...(outputTokens === undefined ? {} : { outputTokens }),
    ...(totalTokens === undefined ? {} : { totalTokens }),
  }
}

const addTokenCount = (left: number | undefined, right: number | undefined): number | undefined => {
  if (left === undefined) return right
  if (right === undefined) return left
  const total = left + right
  return Number.isSafeInteger(total) ? total : undefined
}

export const addProviderUsage: {
  (right: ModelProviderUsage | undefined): (left: ModelProviderUsage | undefined) => ModelProviderUsage | undefined
  (left: ModelProviderUsage | undefined, right: ModelProviderUsage | undefined): ModelProviderUsage | undefined
} = Function.dual(
  2,
  (left: ModelProviderUsage | undefined, right: ModelProviderUsage | undefined): ModelProviderUsage | undefined => {
    if (left === undefined) return right
    if (right === undefined) return left
    const inputTokens = addTokenCount(left.inputTokens, right.inputTokens)
    const outputTokens = addTokenCount(left.outputTokens, right.outputTokens)
    const totalTokens = addTokenCount(left.totalTokens, right.totalTokens)
    return {
      ...(inputTokens === undefined ? {} : { inputTokens }),
      ...(outputTokens === undefined ? {} : { outputTokens }),
      ...(totalTokens === undefined ? {} : { totalTokens }),
    }
  },
)
