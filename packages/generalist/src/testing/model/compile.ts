import { Duration, Effect, Stream } from "effect"
import { AiError, Response } from "effect/unstable/ai"
import type { Operation, Part, ToolCallPart, TruncatedStep, TruncationPoint, TurnStep } from "./service.js"
export const emptyUsage = (): Response.Usage =>
  Response.Usage.make({
    inputTokens: { uncached: undefined, total: undefined, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: undefined, text: undefined, reasoning: undefined },
  })

const invalidRequest = (method: Operation, description: string): AiError.AiError =>
  AiError.make({
    module: "generalist/testing/TestModel",
    method,
    reason: AiError.InvalidRequestError.make({ description }),
  })

const finishReason = (step: TurnStep): Response.FinishReason =>
  step.finishReason ?? (step.parts.some((part) => part._tag === "ToolCall") ? "tool-calls" : "stop")

const finish = (reason: Response.FinishReason, usage: Response.Usage): Response.FinishPartEncoded => ({
  type: "finish",
  reason,
  usage,
  response: undefined,
})

const compileToolCall = (
  part: ToolCallPart,
  requestIndex: number,
  partIndex: number,
): Response.ToolCallPartEncoded => ({
  type: "tool-call",
  id: part.id ?? `test-call-${requestIndex}-${partIndex}`,
  name: part.name,
  params: part.params,
  providerExecuted: part.providerExecuted,
})

const compilePart = (part: Part, requestIndex: number, partIndex: number): Response.PartEncoded => {
  if (part._tag === "Text") return { type: "text", text: part.text }
  if (part._tag === "Reasoning") return { type: "reasoning", text: part.text }
  return compileToolCall(part, requestIndex, partIndex)
}

const compileGenerate = (step: TurnStep, requestIndex: number): Array<Response.PartEncoded> => [
  ...step.parts.map((part, partIndex) => compilePart(part, requestIndex, partIndex)),
  finish(finishReason(step), step.usage ?? emptyUsage()),
]

const compileStream = (step: TurnStep, requestIndex: number): Array<Response.StreamPartEncoded> => {
  const output: Array<Response.StreamPartEncoded> = []
  for (const [partIndex, part] of step.parts.entries()) {
    if (part._tag === "ToolCall") {
      output.push(compileToolCall(part, requestIndex, partIndex))
      continue
    }
    const kind = part._tag === "Text" ? "text" : "reasoning"
    const id = `test-${kind}-${requestIndex}-${partIndex}`
    output.push({ type: `${kind}-start`, id })
    output.push({ type: `${kind}-delta`, id, delta: part.text })
    output.push({ type: `${kind}-end`, id })
  }
  output.push(finish(finishReason(step), step.usage ?? emptyUsage()))
  return output
}

const truncationInvalid = (stopAfter: TruncationPoint, expected: string): AiError.AiError =>
  invalidRequest("streamText", `Truncated step stopping after ${stopAfter} requires a final ${expected} part`)

const compileTruncated = (
  step: TruncatedStep,
  requestIndex: number,
): Array<Response.StreamPartEncoded> | AiError.AiError => {
  const output: Array<Response.StreamPartEncoded> = [
    {
      type: "response-metadata",
      id: `test-response-${requestIndex}`,
      modelId: "scripted",
      timestamp: undefined,
      request: undefined,
    },
  ]
  if (step.stopAfter === "response-metadata") return output
  const lastIndex = step.parts.length - 1
  const last = step.parts[lastIndex]
  if (last === undefined) return truncationInvalid(step.stopAfter, "content")
  for (const [partIndex, part] of step.parts.slice(0, lastIndex).entries()) {
    if (part._tag === "ToolCall") {
      output.push(compileToolCall(part, requestIndex, partIndex))
      continue
    }
    const kind = part._tag === "Text" ? "text" : "reasoning"
    const id = `test-${kind}-${requestIndex}-${partIndex}`
    output.push({ type: `${kind}-start`, id })
    output.push({ type: `${kind}-delta`, id, delta: part.text })
    output.push({ type: `${kind}-end`, id })
  }
  if (step.stopAfter === "tool-params-delta") {
    if (last._tag !== "ToolCall") return truncationInvalid(step.stopAfter, "ToolCall")
    const id = last.id ?? `test-call-${requestIndex}-${lastIndex}`
    output.push({ type: "tool-params-start", id, name: last.name, providerExecuted: last.providerExecuted })
    output.push({ type: "tool-params-delta", id, delta: JSON.stringify(last.params).slice(0, -1) })
    return output
  }
  const kind = step.stopAfter === "text-delta" ? "text" : "reasoning"
  const expected = kind === "text" ? "Text" : "Reasoning"
  if (last._tag !== expected) return truncationInvalid(step.stopAfter, expected)
  const id = `test-${kind}-${requestIndex}-${lastIndex}`
  output.push({ type: `${kind}-start`, id })
  output.push({ type: `${kind}-delta`, id, delta: last.text })
  return output
}

/** A compiled provider stream plus the per-part pacing delay, when scripted. */
export interface CompiledStream {
  readonly parts: ReadonlyArray<Response.StreamPartEncoded>
  readonly partDelay?: Duration.Input
}

interface MutableCompiledStream {
  parts: ReadonlyArray<Response.StreamPartEncoded>
  partDelay?: Duration.Input
}
const compileStreamFor = (step: TurnStep | TruncatedStep, requestIndex: number): CompiledStream | AiError.AiError => {
  if (step._tag === "Turn") {
    const stream: MutableCompiledStream = {
      parts: compileStream(step, requestIndex),
    }
    if (step.streamPartDelay !== undefined) stream.partDelay = step.streamPartDelay
    return stream
  }
  const compiled = compileTruncated(step, requestIndex)
  if (!Array.isArray(compiled)) return compiled
  const stream: MutableCompiledStream = { parts: compiled }
  if (step.streamPartDelay !== undefined) stream.partDelay = step.streamPartDelay
  return stream
}
const paceParts = (
  parts: ReadonlyArray<Response.StreamPartEncoded>,
  partDelay: Duration.Input,
): Stream.Stream<Response.StreamPartEncoded> =>
  Stream.fromIterable(parts).pipe(Stream.mapEffect((part) => Effect.sleep(partDelay).pipe(Effect.as(part))))
export const compile = {
  emptyUsage,
  finish,
  compileGenerate,
  compileStreamFor,
  paceParts,
}
