import type { ConverseCommandOutput, ConverseStreamOutput, TokenUsage } from "@aws-sdk/client-bedrock-runtime"
import { Effect, Encoding, Option, Schema, Stream } from "effect"
import { AiError, Response, Tool } from "effect/unstable/ai"

const invalidOutput = (description: string) =>
  AiError.AiError.make({
    module: "AmazonBedrock",
    method: "converseStream",
    reason: AiError.InvalidOutputError.make({ description }),
  })

const finishReason = (reason: string | undefined): "stop" | "length" | "tool-calls" | "content-filter" | "unknown" =>
  reason === "max_tokens"
    ? "length"
    : reason === "tool_use"
      ? "tool-calls"
      : reason === "guardrail_intervened" || reason === "content_filtered"
        ? "content-filter"
        : reason === "end_turn" || reason === "stop_sequence"
          ? "stop"
          : "unknown"

const usage = (value: TokenUsage | undefined) => ({
  inputTokens: {
    total: value?.inputTokens,
    uncached:
      value?.inputTokens === undefined ? undefined : Math.max(0, value.inputTokens - (value.cacheReadInputTokens ?? 0)),
    cacheRead: value?.cacheReadInputTokens,
    cacheWrite: value?.cacheWriteInputTokens,
  },
  outputTokens: { total: value?.outputTokens, text: undefined, reasoning: undefined },
})

const json = (value: unknown): Schema.Json | undefined =>
  Option.getOrUndefined(Schema.decodeUnknownOption(Schema.Json)(value))

const bedrockMetadata = Schema.Struct({
  metrics: Schema.optionalKey(Schema.Struct({ latencyMs: Schema.optionalKey(Schema.Number) })),
  trace: Schema.optionalKey(Schema.Json),
  additionalModelResponseFields: Schema.optionalKey(Schema.Json),
  performanceConfig: Schema.optionalKey(Schema.Json),
})

const decodeBedrockMetadata = (value: unknown): typeof bedrockMetadata.Type | undefined =>
  Option.getOrUndefined(Schema.decodeUnknownOption(bedrockMetadata)(value))

const finishMetadata = (response: ConverseCommandOutput) => {
  const trace = json(response.trace)
  const additionalModelResponseFields = json(response.additionalModelResponseFields)
  const performanceConfig = json(response.performanceConfig)
  return {
    amazonBedrock: {
      ...(response.metrics?.latencyMs === undefined ? {} : { metrics: { latencyMs: response.metrics.latencyMs } }),
      ...(trace === undefined ? {} : { trace }),
      ...(additionalModelResponseFields === undefined ? {} : { additionalModelResponseFields }),
      ...(performanceConfig === undefined ? {} : { performanceConfig }),
    },
  }
}

/** @experimental */
export const responseParts = (
  response: ConverseCommandOutput,
  model: string,
  structuredOutputName: string | undefined,
): Array<Response.PartEncoded> => {
  const parts: Array<Response.PartEncoded> = [
    { type: "response-metadata", id: undefined, modelId: model, timestamp: undefined, request: undefined },
  ]
  for (const block of response.output?.message?.content ?? []) {
    if (block.text !== undefined) parts.push({ type: "text", text: block.text })
    else if (block.toolUse !== undefined) {
      if (structuredOutputName === block.toolUse.name) {
        parts.push({ type: "text", text: JSON.stringify(block.toolUse.input) })
      } else {
        parts.push({
          type: "tool-call",
          id: block.toolUse.toolUseId ?? "",
          name: block.toolUse.name ?? "",
          params: block.toolUse.input,
          providerExecuted: false,
        })
      }
    } else if (block.reasoningContent?.reasoningText !== undefined) {
      parts.push({
        type: "reasoning",
        text: block.reasoningContent.reasoningText.text ?? "",
        ...(block.reasoningContent.reasoningText.signature === undefined
          ? {}
          : { metadata: { amazonBedrock: { signature: block.reasoningContent.reasoningText.signature } } }),
      })
    } else if (block.reasoningContent?.redactedContent !== undefined) {
      parts.push({
        type: "reasoning",
        text: "",
        metadata: {
          amazonBedrock: { redactedData: Encoding.encodeBase64(block.reasoningContent.redactedContent) },
        },
      })
    }
  }
  parts.push({
    type: "finish",
    reason: finishReason(response.stopReason),
    usage: usage(response.usage),
    response: undefined,
    metadata: finishMetadata(response),
  })
  return parts
}

type Block =
  | { readonly type: "text"; readonly id: string }
  | { readonly type: "reasoning"; readonly id: string }
  | { readonly type: "tool"; readonly id: string; readonly name: string; params: string }

/** @experimental */
export const streamParts = (
  events: Stream.Stream<ConverseStreamOutput, AiError.AiError>,
  model: string,
  structuredOutputName: string | undefined,
): Stream.Stream<Response.StreamPartEncoded, AiError.AiError> => {
  const blocks = new Map<number, Block>()
  let stop: { reason: string | undefined; additional?: Schema.Json } | undefined
  let finished = false

  const mapEvent = (event: ConverseStreamOutput): Array<Response.StreamPartEncoded> => {
    if (event.messageStart !== undefined)
      return [{ type: "response-metadata", id: undefined, modelId: model, timestamp: undefined, request: undefined }]
    if (event.contentBlockStart !== undefined) {
      const index = event.contentBlockStart.contentBlockIndex
      const tool = event.contentBlockStart.start?.toolUse
      if (index === undefined || tool?.toolUseId === undefined || tool.name === undefined) {
        throw invalidOutput("Bedrock sent an invalid content block start")
      }
      blocks.set(index, { type: "tool", id: tool.toolUseId, name: tool.name, params: "" })
      return structuredOutputName === tool.name
        ? [{ type: "text-start", id: tool.toolUseId }]
        : [{ type: "tool-params-start", id: tool.toolUseId, name: tool.name, providerExecuted: false }]
    }
    if (event.contentBlockDelta !== undefined) {
      const index = event.contentBlockDelta.contentBlockIndex
      const delta = event.contentBlockDelta.delta
      if (index === undefined || delta === undefined) throw invalidOutput("Bedrock sent an invalid content block delta")
      if (delta.text !== undefined) {
        const existing = blocks.get(index)
        const id = existing?.type === "text" ? existing.id : `text-${index}`
        if (existing === undefined) blocks.set(index, { type: "text", id })
        return [
          ...(existing === undefined ? [{ type: "text-start" as const, id }] : []),
          { type: "text-delta", id, delta: delta.text },
        ]
      }
      if (delta.reasoningContent !== undefined) {
        const existing = blocks.get(index)
        const id = existing?.type === "reasoning" ? existing.id : `reasoning-${index}`
        if (existing === undefined) blocks.set(index, { type: "reasoning", id })
        const metadata =
          delta.reasoningContent.signature !== undefined
            ? { amazonBedrock: { signature: delta.reasoningContent.signature } }
            : delta.reasoningContent.redactedContent !== undefined
              ? { amazonBedrock: { redactedData: Encoding.encodeBase64(delta.reasoningContent.redactedContent) } }
              : undefined
        return [
          ...(existing === undefined ? [{ type: "reasoning-start" as const, id }] : []),
          {
            type: "reasoning-delta",
            id,
            delta: delta.reasoningContent.text ?? "",
            ...(metadata === undefined ? {} : { metadata }),
          },
        ]
      }
      if (delta.toolUse?.input !== undefined) {
        const block = blocks.get(index)
        if (block?.type !== "tool") throw invalidOutput("Bedrock sent tool arguments before tool start")
        block.params += delta.toolUse.input
        return structuredOutputName === block.name
          ? [{ type: "text-delta", id: block.id, delta: delta.toolUse.input }]
          : [{ type: "tool-params-delta", id: block.id, delta: delta.toolUse.input }]
      }
      return []
    }
    if (event.contentBlockStop !== undefined) {
      const index = event.contentBlockStop.contentBlockIndex
      if (index === undefined) throw invalidOutput("Bedrock stopped an unknown content block")
      const block = blocks.get(index)
      if (block === undefined) throw invalidOutput("Bedrock stopped an unknown content block")
      blocks.delete(index)
      if (block.type === "text") return [{ type: "text-end", id: block.id }]
      if (block.type === "reasoning") return [{ type: "reasoning-end", id: block.id }]
      if (structuredOutputName === block.name) return [{ type: "text-end", id: block.id }]
      let params: unknown
      try {
        params = Tool.unsafeSecureJsonParse(block.params)
      } catch {
        throw invalidOutput(`Bedrock returned malformed arguments for tool '${block.name}'`)
      }
      return [
        { type: "tool-params-end", id: block.id },
        { type: "tool-call", id: block.id, name: block.name, params, providerExecuted: false },
      ]
    }
    if (event.messageStop !== undefined) {
      const additional = json(event.messageStop.additionalModelResponseFields)
      stop =
        additional === undefined
          ? { reason: event.messageStop.stopReason }
          : { reason: event.messageStop.stopReason, additional }
      return []
    }
    if (event.metadata !== undefined) {
      if (stop === undefined) throw invalidOutput("Bedrock sent metadata before message stop")
      finished = true
      const trace = json(event.metadata.trace)
      const performanceConfig = json(event.metadata.performanceConfig)
      const amazonBedrock = decodeBedrockMetadata({
        ...(event.metadata.metrics?.latencyMs === undefined
          ? {}
          : { metrics: { latencyMs: event.metadata.metrics.latencyMs } }),
        ...(trace === undefined ? {} : { trace }),
        ...(performanceConfig === undefined ? {} : { performanceConfig }),
        ...(stop.additional === undefined ? {} : { additionalModelResponseFields: stop.additional }),
      })
      return [
        {
          type: "finish",
          reason: finishReason(stop.reason),
          usage: usage(event.metadata.usage),
          response: undefined,
          ...(amazonBedrock === undefined ? {} : { metadata: { amazonBedrock } }),
        },
      ]
    }
    const exception =
      event.internalServerException ??
      event.modelStreamErrorException ??
      event.serviceUnavailableException ??
      event.throttlingException ??
      event.validationException
    return exception === undefined
      ? []
      : [{ type: "error", error: { name: exception.name, message: exception.message } }]
  }

  return events.pipe(
    Stream.mapEffect((event) =>
      Effect.try({
        try: () => mapEvent(event),
        catch: (cause) => (AiError.isAiError(cause) ? cause : invalidOutput("Bedrock stream event was invalid")),
      }),
    ),
    Stream.flatMap(Stream.fromIterable),
    Stream.concat(
      Stream.suspend(() =>
        finished ? Stream.empty : Stream.fail(invalidOutput("Bedrock stream ended before terminal metadata")),
      ),
    ),
  )
}
