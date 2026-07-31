import { Cause, Option } from "effect"
import { Response } from "effect/unstable/ai"
import type { ModelFirstOutputKind } from "./model-telemetry.js"

export const memoized = <Result>(compute: (error: unknown) => Result): ((error: unknown) => Result) => {
  const cache = new Map<unknown, Result>()
  return (error: unknown): Result => {
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
