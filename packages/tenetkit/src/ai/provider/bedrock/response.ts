import type { ConverseCommandOutput, ConverseStreamOutput, TokenUsage } from "@aws-sdk/client-bedrock-runtime"
import { Effect, Encoding, Function, Option, Schema, Stream } from "effect"
import { AiError, Response, Tool } from "effect/unstable/ai"
import { bedrockFailure } from "./error.js"

const invalidOutput = (description: string) =>
  AiError.AiError.make({
    module: "AmazonBedrock",
    method: "converseStream",
    reason: AiError.InvalidOutputError.make({ description }),
  })

const finishReason = (reason: string | undefined): "stop" | "length" | "tool-calls" | "content-filter" | "unknown" => {
  if (reason === "max_tokens") return "length"
  if (reason === "tool_use") return "tool-calls"
  if (reason === "guardrail_intervened" || reason === "content_filtered") return "content-filter"
  if (reason === "end_turn" || reason === "stop_sequence") return "stop"
  return "unknown"
}

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

type BedrockJson =
  | ConverseCommandOutput["trace"]
  | ConverseCommandOutput["additionalModelResponseFields"]
  | ConverseCommandOutput["performanceConfig"]

const json = (value: BedrockJson): Schema.Json | undefined =>
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

const decodeBedrockMetadata = (value: typeof bedrockMetadata.Encoded): typeof bedrockMetadata.Type | undefined =>
  Option.getOrUndefined(Schema.decodeOption(bedrockMetadata)(value))

type Mutable<T> = { -readonly [Key in keyof T]: T[Key] }

const finishMetadata = (response: ConverseCommandOutput) => {
  const trace = json(response.trace)
  const additionalModelResponseFields = json(response.additionalModelResponseFields)
  const performanceConfig = json(response.performanceConfig)
  const amazonBedrock: Mutable<typeof bedrockMetadata.Encoded> = {}
  if (response.$metadata.requestId !== undefined) amazonBedrock.requestId = response.$metadata.requestId
  if (response.stopReason !== undefined) amazonBedrock.stopReason = response.stopReason
  if (response.usage?.totalTokens !== undefined) amazonBedrock.totalTokens = response.usage.totalTokens
  if (response.metrics?.latencyMs !== undefined) amazonBedrock.metrics = { latencyMs: response.metrics.latencyMs }
  if (trace !== undefined) amazonBedrock.trace = trace
  if (additionalModelResponseFields !== undefined) {
    amazonBedrock.additionalModelResponseFields = additionalModelResponseFields
  }
  if (performanceConfig !== undefined) amazonBedrock.performanceConfig = performanceConfig
  return {
    amazonBedrock,
  }
}

type ResponseBlock = NonNullable<
  NonNullable<NonNullable<ConverseCommandOutput["output"]>["message"]>["content"]
>[number]

const parseCitations = (block: ResponseBlock): Array<Response.PartEncoded> => {
  const parts: Array<Response.PartEncoded> = []
  for (const content of block.citationsContent?.content ?? []) {
    if (content.text !== undefined) parts.push({ type: "text", text: content.text })
  }
  return parts
}

const parseResponseBlock = (
  block: ResponseBlock,
  structuredOutputName: string | undefined,
): Array<Response.PartEncoded> => {
  if (block.text !== undefined) return [{ type: "text", text: block.text }]
  if (block.toolUse !== undefined) {
    if (structuredOutputName === block.toolUse.name) {
      return [{ type: "text", text: JSON.stringify(block.toolUse.input) }]
    }
    return [
      {
        type: "tool-call",
        id: block.toolUse.toolUseId ?? "",
        name: block.toolUse.name ?? "",
        params: block.toolUse.input,
        providerExecuted: false,
      },
    ]
  }
  const reasoningText = block.reasoningContent?.reasoningText
  if (reasoningText !== undefined) {
    if (reasoningText.signature === undefined) return [{ type: "reasoning", text: reasoningText.text ?? "" }]
    return [
      {
        type: "reasoning",
        text: reasoningText.text ?? "",
        metadata: { amazonBedrock: { signature: reasoningText.signature } },
      },
    ]
  }
  const redactedContent = block.reasoningContent?.redactedContent
  if (redactedContent !== undefined) {
    return [
      {
        type: "reasoning",
        text: "",
        metadata: { amazonBedrock: { redactedData: Encoding.encodeBase64(redactedContent) } },
      },
    ]
  }
  return parseCitations(block)
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
    parts.push(...parseResponseBlock(block, structuredOutputName))
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

type ContentBlockStart = NonNullable<ConverseStreamOutput["contentBlockStart"]>
type ContentBlockDelta = NonNullable<ConverseStreamOutput["contentBlockDelta"]>
type ContentBlockStop = NonNullable<ConverseStreamOutput["contentBlockStop"]>
type MessageStop = NonNullable<ConverseStreamOutput["messageStop"]>
type StreamMetadata = NonNullable<ConverseStreamOutput["metadata"]>
type ReasoningDelta = NonNullable<NonNullable<ContentBlockDelta["delta"]>["reasoningContent"]>

const reasoningDeltaPart = (id: string, reasoning: ReasoningDelta): Response.StreamPartEncoded => {
  const delta = reasoning.text ?? ""
  if (reasoning.signature !== undefined) {
    return { type: "reasoning-delta", id, delta, metadata: { amazonBedrock: { signature: reasoning.signature } } }
  }
  if (reasoning.redactedContent !== undefined) {
    return {
      type: "reasoning-delta",
      id,
      delta,
      metadata: { amazonBedrock: { redactedData: Encoding.encodeBase64(reasoning.redactedContent) } },
    }
  }
  return { type: "reasoning-delta", id, delta }
}

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

    const failStream = (
      errorName: string,
      httpStatus: number,
      message: string | undefined,
      eventRequestId: string | undefined,
    ): never => {
      const description = message ?? `${errorName} during stream`
      if (eventRequestId === undefined) {
        throw bedrockFailure("converseStream", { description, errorName, httpStatus })
      }
      throw bedrockFailure("converseStream", { description, errorName, httpStatus, requestId: eventRequestId })
    }

    const parseException = (event: ConverseStreamOutput): void => {
      const internal = event.internalServerException
      if (internal !== undefined) {
        failStream("InternalServerException", 500, internal.message, internal.$metadata?.requestId ?? requestId)
      }
      parseModelException(event)
      const unavailable = event.serviceUnavailableException
      if (unavailable !== undefined) {
        failStream(
          "ServiceUnavailableException",
          503,
          unavailable.message,
          unavailable.$metadata?.requestId ?? requestId,
        )
      }
      const throttled = event.throttlingException
      if (throttled !== undefined) {
        failStream("ThrottlingException", 429, throttled.message, throttled.$metadata?.requestId ?? requestId)
      }
      const validation = event.validationException
      if (validation !== undefined) {
        failStream("ValidationException", 400, validation.message, validation.$metadata?.requestId ?? requestId)
      }
    }

    const parseModelException = (event: ConverseStreamOutput): void => {
      const modelError = event.modelStreamErrorException
      if (modelError === undefined) return
      failStream(
        "ModelStreamErrorException",
        modelError.originalStatusCode ?? 424,
        modelError.originalMessage ?? modelError.message,
        modelError.$metadata?.requestId ?? requestId,
      )
    }

    const parseBlockStart = (event: ContentBlockStart): Array<Response.StreamPartEncoded> => {
      const index = event.contentBlockIndex
      const tool = event.start?.toolUse
      if (index === undefined) {
        throw invalidOutput("Bedrock sent an invalid content block start")
      }
      if (blocks.size > 0) throw invalidOutput("Bedrock interleaved content blocks")
      if (completedBlocks.has(index)) throw invalidOutput("Bedrock restarted a completed content block")
      if (tool === undefined && event.start?.$unknown !== undefined) {
        blocks.set(index, { type: "unsupported" })
        return []
      }
      if (tool?.toolUseId === undefined || tool.name === undefined) {
        throw invalidOutput("Bedrock sent an invalid content block start")
      }
      blocks.set(index, { type: "tool", id: tool.toolUseId, name: tool.name, params: "" })
      if (structuredOutputName === tool.name) return [{ type: "text-start", id: tool.toolUseId }]
      return [{ type: "tool-params-start", id: tool.toolUseId, name: tool.name, providerExecuted: false }]
    }

    const parseTextDelta = (index: number, text: string): Array<Response.StreamPartEncoded> => {
      const existing = blocks.get(index)
      if (existing !== undefined && existing.type !== "text") {
        throw invalidOutput("Bedrock changed a content block from its original type")
      }
      const id = existing?.type === "text" ? existing.id : `text-${index}`
      const parts: Array<Response.StreamPartEncoded> = []
      if (existing === undefined) {
        if (blocks.size > 0) throw invalidOutput("Bedrock interleaved content blocks")
        blocks.set(index, { type: "text", id })
        parts.push({ type: "text-start", id })
      }
      parts.push({ type: "text-delta", id, delta: text })
      return parts
    }

    const parseReasoningDelta = (index: number, reasoning: ReasoningDelta): Array<Response.StreamPartEncoded> => {
      const existing = blocks.get(index)
      if (reasoning.$unknown !== undefined) {
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
        reasoning.text === undefined &&
        reasoning.signature === undefined &&
        reasoning.redactedContent === undefined
      ) {
        throw invalidOutput("Bedrock sent an empty reasoning delta")
      }
      const id = existing?.type === "reasoning" ? existing.id : `reasoning-${index}`
      const parts: Array<Response.StreamPartEncoded> = []
      if (existing === undefined) {
        if (blocks.size > 0) throw invalidOutput("Bedrock interleaved content blocks")
        blocks.set(index, { type: "reasoning", id })
        parts.push({ type: "reasoning-start", id })
      }
      parts.push(reasoningDeltaPart(id, reasoning))
      return parts
    }

    const parseToolDelta = (index: number, input: string): Array<Response.StreamPartEncoded> => {
      const block = blocks.get(index)
      if (block?.type !== "tool") throw invalidOutput("Bedrock sent tool arguments before tool start")
      block.params += input
      if (structuredOutputName === block.name) return [{ type: "text-delta", id: block.id, delta: input }]
      return [{ type: "tool-params-delta", id: block.id, delta: input }]
    }

    const parseBlockDelta = (event: ContentBlockDelta): Array<Response.StreamPartEncoded> => {
      const index = event.contentBlockIndex
      const delta = event.delta
      if (index === undefined || delta === undefined) throw invalidOutput("Bedrock sent an invalid content block delta")
      if (completedBlocks.has(index)) throw invalidOutput("Bedrock updated a completed content block")
      if (delta.text !== undefined) return parseTextDelta(index, delta.text)
      if (delta.reasoningContent !== undefined) return parseReasoningDelta(index, delta.reasoningContent)
      if (delta.toolUse?.input !== undefined) return parseToolDelta(index, delta.toolUse.input)
      if (delta.citation !== undefined || delta.$unknown !== undefined) {
        if (blocks.size > 0 && !blocks.has(index)) throw invalidOutput("Bedrock interleaved content blocks")
        if (!blocks.has(index)) blocks.set(index, { type: "unsupported" })
        return []
      }
      throw invalidOutput("Bedrock sent an empty content delta")
    }

    const parseBlockStop = (event: ContentBlockStop): Array<Response.StreamPartEncoded> => {
      const index = event.contentBlockIndex
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

    const parseMessageStop = (event: MessageStop): Array<Response.StreamPartEncoded> => {
      if (stop !== undefined) throw invalidOutput("Bedrock sent more than one message stop")
      if (blocks.size > 0) throw invalidOutput("Bedrock stopped the message before its content blocks")
      if (event.stopReason === undefined) throw invalidOutput("Bedrock sent an invalid message stop")
      const additional = json(event.additionalModelResponseFields)
      stop = { reason: event.stopReason }
      if (additional !== undefined) stop.additional = additional
      return []
    }

    const parseMetadata = (event: StreamMetadata): Array<Response.StreamPartEncoded> => {
      if (stop === undefined) throw invalidOutput("Bedrock sent metadata before message stop")
      if (blocks.size > 0) throw invalidOutput("Bedrock sent metadata before its content blocks ended")
      if (event.usage === undefined || event.metrics === undefined) {
        throw invalidOutput("Bedrock sent invalid terminal metadata")
      }
      finished = true
      const metadata: Mutable<typeof bedrockMetadata.Encoded> = {}
      if (requestId !== undefined) metadata.requestId = requestId
      if (stop.reason !== undefined) metadata.stopReason = stop.reason
      if (event.usage.totalTokens !== undefined) metadata.totalTokens = event.usage.totalTokens
      if (event.metrics.latencyMs !== undefined) metadata.metrics = { latencyMs: event.metrics.latencyMs }
      const trace = json(event.trace)
      if (trace !== undefined) metadata.trace = trace
      const performanceConfig = json(event.performanceConfig)
      if (performanceConfig !== undefined) metadata.performanceConfig = performanceConfig
      if (stop.additional !== undefined) metadata.additionalModelResponseFields = stop.additional
      const amazonBedrock = decodeBedrockMetadata(metadata)
      const part: Response.StreamPartEncoded =
        amazonBedrock === undefined
          ? {
              type: "finish",
              reason: finishReason(stop.reason),
              usage: usage(event.usage),
              response: undefined,
            }
          : {
              type: "finish",
              reason: finishReason(stop.reason),
              usage: usage(event.usage),
              response: undefined,
              metadata: { amazonBedrock },
            }
      return [part]
    }

    const mapEvent = (event: ConverseStreamOutput): Array<Response.StreamPartEncoded> => {
      parseException(event)
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
      if (event.contentBlockStart !== undefined) return parseBlockStart(event.contentBlockStart)
      if (event.contentBlockDelta !== undefined) return parseBlockDelta(event.contentBlockDelta)
      if (event.contentBlockStop !== undefined) return parseBlockStop(event.contentBlockStop)
      if (event.messageStop !== undefined) return parseMessageStop(event.messageStop)
      if (event.metadata !== undefined) return parseMetadata(event.metadata)
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
