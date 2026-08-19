import type { ConverseCommandOutput, ConverseStreamOutput, TokenUsage } from "@aws-sdk/client-bedrock-runtime"
import { Effect, Encoding, Function, Option, Schema, Stream } from "effect"
import { AiError, Response, Tool } from "effect/unstable/ai"
import { bedrockFailure } from "./amazon-bedrock-error.js"

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
  requestId: Schema.optionalKey(Schema.String),
  stopReason: Schema.optionalKey(Schema.String),
  totalTokens: Schema.optionalKey(Schema.Finite),
  metrics: Schema.optionalKey(Schema.Struct({ latencyMs: Schema.optionalKey(Schema.Finite) })),
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
      ...(response.$metadata.requestId === undefined ? {} : { requestId: response.$metadata.requestId }),
      ...(response.stopReason === undefined ? {} : { stopReason: response.stopReason }),
      ...(response.usage?.totalTokens === undefined ? {} : { totalTokens: response.usage.totalTokens }),
      ...(response.metrics?.latencyMs === undefined ? {} : { metrics: { latencyMs: response.metrics.latencyMs } }),
      ...(trace === undefined ? {} : { trace }),
      ...(additionalModelResponseFields === undefined ? {} : { additionalModelResponseFields }),
      ...(performanceConfig === undefined ? {} : { performanceConfig }),
    },
  }
}

/** @internal */
export const responseParts: {
  (
    model: string,
    structuredOutputName: string | undefined,
  ): (response: ConverseCommandOutput) => Array<Response.PartEncoded>
  (
    response: ConverseCommandOutput,
    model: string,
    structuredOutputName: string | undefined,
  ): Array<Response.PartEncoded>
} = Function.dual(3, (response: ConverseCommandOutput, model: string, structuredOutputName: string | undefined) => {
  const parts: Array<Response.PartEncoded> = [
    {
      type: "response-metadata",
      id: response.$metadata.requestId,
      modelId: model,
      timestamp: undefined,
      request: undefined,
    },
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
    } else if (block.citationsContent !== undefined) {
      for (const content of block.citationsContent.content ?? []) {
        if (content.text !== undefined) parts.push({ type: "text", text: content.text })
      }
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
})

type Block =
  | { readonly type: "text"; readonly id: string }
  | { readonly type: "reasoning"; readonly id: string }
  | { readonly type: "tool"; readonly id: string; readonly name: string; params: string }
  | { readonly type: "unsupported" }

/** @internal */
export const streamParts: {
  (
    model: string,
    structuredOutputName: string | undefined,
    requestId: string | undefined,
  ): (
    events: Stream.Stream<ConverseStreamOutput, AiError.AiError>,
  ) => Stream.Stream<Response.StreamPartEncoded, AiError.AiError>
  (
    events: Stream.Stream<ConverseStreamOutput, AiError.AiError>,
    model: string,
    structuredOutputName: string | undefined,
    requestId: string | undefined,
  ): Stream.Stream<Response.StreamPartEncoded, AiError.AiError>
} = Function.dual(
  4,
  (
    events: Stream.Stream<ConverseStreamOutput, AiError.AiError>,
    model: string,
    structuredOutputName: string | undefined,
    requestId: string | undefined,
  ) => {
    const blocks = new Map<number, Block>()
    const completedBlocks = new Set<number>()
    let stop: { reason: string | undefined; additional?: Schema.Json } | undefined
    let started = false
    let finished = false

    const mapEvent = (event: ConverseStreamOutput): Array<Response.StreamPartEncoded> => {
      const exception =
        event.internalServerException ??
        event.modelStreamErrorException ??
        event.serviceUnavailableException ??
        event.throttlingException ??
        event.validationException
      if (exception !== undefined) {
        const errorName =
          event.internalServerException !== undefined
            ? "InternalServerException"
            : event.modelStreamErrorException !== undefined
              ? "ModelStreamErrorException"
              : event.serviceUnavailableException !== undefined
                ? "ServiceUnavailableException"
                : event.throttlingException !== undefined
                  ? "ThrottlingException"
                  : "ValidationException"
        const httpStatus =
          errorName === "InternalServerException"
            ? 500
            : errorName === "ModelStreamErrorException"
              ? 424
              : errorName === "ServiceUnavailableException"
                ? 503
                : errorName === "ThrottlingException"
                  ? 429
                  : 400
        const eventRequestId = exception.$metadata?.requestId ?? requestId
        throw bedrockFailure("converseStream", {
          description:
            event.modelStreamErrorException?.originalMessage ?? exception.message ?? `${errorName} during stream`,
          errorName,
          httpStatus: event.modelStreamErrorException?.originalStatusCode ?? httpStatus,
          ...(eventRequestId === undefined ? {} : { requestId: eventRequestId }),
        })
      }
      if (finished) throw invalidOutput("Bedrock sent an event after terminal metadata")
      if (event.$unknown !== undefined) return []
      if (event.messageStart !== undefined) {
        if (started) throw invalidOutput("Bedrock sent more than one message start")
        if (event.messageStart.role !== "assistant") throw invalidOutput("Bedrock sent an invalid message start")
        started = true
        return [{ type: "response-metadata", id: requestId, modelId: model, timestamp: undefined, request: undefined }]
      }
      if (!started) throw invalidOutput("Bedrock sent content before message start")
      if (stop !== undefined && event.metadata === undefined) {
        throw invalidOutput("Bedrock sent an event after message stop")
      }
      if (event.contentBlockStart !== undefined) {
        const index = event.contentBlockStart.contentBlockIndex
        const tool = event.contentBlockStart.start?.toolUse
        if (index === undefined) {
          throw invalidOutput("Bedrock sent an invalid content block start")
        }
        if (blocks.size > 0) throw invalidOutput("Bedrock interleaved content blocks")
        if (completedBlocks.has(index)) throw invalidOutput("Bedrock restarted a completed content block")
        if (tool === undefined && event.contentBlockStart.start?.$unknown !== undefined) {
          blocks.set(index, { type: "unsupported" })
          return []
        }
        if (tool?.toolUseId === undefined || tool.name === undefined) {
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
        if (index === undefined || delta === undefined)
          throw invalidOutput("Bedrock sent an invalid content block delta")
        if (completedBlocks.has(index)) throw invalidOutput("Bedrock updated a completed content block")
        if (delta.text !== undefined) {
          const existing = blocks.get(index)
          if (existing !== undefined && existing.type !== "text") {
            throw invalidOutput("Bedrock changed a content block from its original type")
          }
          const id = existing?.type === "text" ? existing.id : `text-${index}`
          if (existing === undefined) {
            if (blocks.size > 0) throw invalidOutput("Bedrock interleaved content blocks")
            blocks.set(index, { type: "text", id })
          }
          return [
            ...(existing === undefined ? [{ type: "text-start" as const, id }] : []),
            { type: "text-delta", id, delta: delta.text },
          ]
        }
        if (delta.reasoningContent !== undefined) {
          const existing = blocks.get(index)
          if (delta.reasoningContent.$unknown !== undefined) {
            if (existing === undefined) {
              if (blocks.size > 0) throw invalidOutput("Bedrock interleaved content blocks")
              blocks.set(index, { type: "unsupported" })
            }
            return []
          }
          if (existing !== undefined && existing.type !== "reasoning") {
            throw invalidOutput("Bedrock changed a content block from its original type")
          }
          if (
            delta.reasoningContent.text === undefined &&
            delta.reasoningContent.signature === undefined &&
            delta.reasoningContent.redactedContent === undefined
          ) {
            throw invalidOutput("Bedrock sent an empty reasoning delta")
          }
          const id = existing?.type === "reasoning" ? existing.id : `reasoning-${index}`
          if (existing === undefined) {
            if (blocks.size > 0) throw invalidOutput("Bedrock interleaved content blocks")
            blocks.set(index, { type: "reasoning", id })
          }
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
        if (delta.citation !== undefined || delta.$unknown !== undefined) {
          if (blocks.size > 0 && !blocks.has(index)) throw invalidOutput("Bedrock interleaved content blocks")
          if (!blocks.has(index)) blocks.set(index, { type: "unsupported" })
          return []
        }
        throw invalidOutput("Bedrock sent an empty content delta")
      }
      if (event.contentBlockStop !== undefined) {
        const index = event.contentBlockStop.contentBlockIndex
        if (index === undefined) throw invalidOutput("Bedrock stopped an unknown content block")
        const block = blocks.get(index)
        if (block === undefined) throw invalidOutput("Bedrock stopped an unknown content block")
        blocks.delete(index)
        completedBlocks.add(index)
        if (block.type === "text") return [{ type: "text-end", id: block.id }]
        if (block.type === "reasoning") return [{ type: "reasoning-end", id: block.id }]
        if (block.type === "unsupported") return []
        if (structuredOutputName === block.name) return [{ type: "text-end", id: block.id }]
        let params: unknown
        try {
          params = block.params.length === 0 ? {} : Tool.unsafeSecureJsonParse(block.params)
        } catch {
          throw invalidOutput(`Bedrock returned malformed arguments for tool '${block.name}'`)
        }
        return [
          { type: "tool-params-end", id: block.id },
          { type: "tool-call", id: block.id, name: block.name, params, providerExecuted: false },
        ]
      }
      if (event.messageStop !== undefined) {
        if (stop !== undefined) throw invalidOutput("Bedrock sent more than one message stop")
        if (blocks.size > 0) throw invalidOutput("Bedrock stopped the message before its content blocks")
        if (event.messageStop.stopReason === undefined) throw invalidOutput("Bedrock sent an invalid message stop")
        const additional = json(event.messageStop.additionalModelResponseFields)
        stop =
          additional === undefined
            ? { reason: event.messageStop.stopReason }
            : { reason: event.messageStop.stopReason, additional }
        return []
      }
      if (event.metadata !== undefined) {
        if (stop === undefined) throw invalidOutput("Bedrock sent metadata before message stop")
        if (blocks.size > 0) throw invalidOutput("Bedrock sent metadata before its content blocks ended")
        if (event.metadata.usage === undefined || event.metadata.metrics === undefined) {
          throw invalidOutput("Bedrock sent invalid terminal metadata")
        }
        finished = true
        const trace = json(event.metadata.trace)
        const performanceConfig = json(event.metadata.performanceConfig)
        const amazonBedrock = decodeBedrockMetadata({
          ...(requestId === undefined ? {} : { requestId }),
          ...(stop.reason === undefined ? {} : { stopReason: stop.reason }),
          ...(event.metadata.usage?.totalTokens === undefined ? {} : { totalTokens: event.metadata.usage.totalTokens }),
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
      throw invalidOutput("Bedrock sent an empty stream event")
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
  },
)
