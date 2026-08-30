import type {
  ContentBlock,
  ConverseCommandInput,
  DocumentFormat,
  ImageFormat,
  Message,
  SystemContentBlock,
  ToolConfiguration,
} from "@aws-sdk/client-bedrock-runtime"
import type { DocumentType } from "@smithy/types"
import { Effect, Encoding, Option, Result, Schema } from "effect"
import { AiError, LanguageModel, Tool } from "effect/unstable/ai"
import type { Config, Options } from "./service.js"

const invalidRequest = (description: string) =>
  AiError.AiError.make({
    module: "AmazonBedrock",
    method: "makeRequest",
    reason: AiError.InvalidRequestError.make({ description }),
  })

const imageFormats = {
  "image/gif": "gif",
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
} satisfies Readonly<Record<string, ImageFormat>>
const documentFormats = {
  "application/pdf": "pdf",
  "text/csv": "csv",
  "text/html": "html",
  "text/markdown": "md",
  "text/plain": "txt",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
} satisfies Readonly<Record<string, DocumentFormat>>
const imageFormat = Schema.decodeUnknownOption(Schema.Literals(["image/gif", "image/jpeg", "image/png", "image/webp"]))
const documentFormat = Schema.decodeUnknownOption(
  Schema.Literals([
    "application/pdf",
    "text/csv",
    "text/html",
    "text/markdown",
    "text/plain",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ]),
)
const bytes = (data: string | Uint8Array | URL) => {
  if (data instanceof URL) return Effect.fail(invalidRequest("Bedrock Converse does not accept URL file sources"))
  if (data instanceof Uint8Array) return Effect.succeed(data)
  const value = data.includes(",") && data.startsWith("data:") ? data.slice(data.indexOf(",") + 1) : data
  return Encoding.decodeBase64(value).pipe(
    Result.mapError(() => invalidRequest("file data must be valid base64")),
    Effect.fromResult,
  )
}

const cachePointOptions = Schema.Struct({
  amazonBedrock: Schema.optionalKey(Schema.Struct({ cachePoint: Schema.optionalKey(Schema.Boolean) })),
})

type PromptMessage = LanguageModel.ProviderOptions["prompt"]["content"][number]
type ConversationMessage = Exclude<PromptMessage, { readonly role: "system" }>
type PromptPart = ConversationMessage["content"][number]
type CachePointOptions = PromptPart["options"] | Extract<PromptMessage, { readonly role: "system" }>["options"]

const hasCachePoint = (options: CachePointOptions): boolean =>
  Option.getOrUndefined(Schema.decodeUnknownOption(cachePointOptions)(options))?.amazonBedrock?.cachePoint === true

const fileBlock = Effect.fnUntraced(function* (part: {
  readonly mediaType: string
  readonly fileName?: string
  readonly data: string | Uint8Array | URL
}) {
  const source = yield* bytes(part.data)
  const imageType = Option.getOrUndefined(imageFormat(part.mediaType))
  if (imageType !== undefined)
    return { image: { format: imageFormats[imageType], source: { bytes: source } } } satisfies ContentBlock
  const documentType = Option.getOrUndefined(documentFormat(part.mediaType))
  if (documentType === undefined) return yield* invalidRequest(`unsupported file MIME type: ${part.mediaType}`)
  const name = (part.fileName ?? "document").replace(/[^A-Za-z0-9 ()[\]-]/g, "-").slice(0, 200)
  return { document: { format: documentFormats[documentType], name, source: { bytes: source } } } satisfies ContentBlock
})

const jsonScalar = Schema.Union([Schema.Null, Schema.String, Schema.Finite, Schema.Boolean])
const isJsonScalar = Schema.is(jsonScalar)
const jsonArray = Schema.Array(Schema.Json)
const isJsonArray = Schema.is(jsonArray)
const jsonObject = Schema.Record(Schema.String, Schema.Json)

const toDocument = (value: Schema.Json): DocumentType => {
  if (isJsonScalar(value)) return value
  if (isJsonArray(value)) return value.map(toDocument)
  const object = Schema.decodeSync(jsonObject)(value)
  return Object.fromEntries(Object.entries(object).map(([key, item]) => [key, toDocument(item)]))
}

const documentFromUnknown = Schema.decodeUnknownSync(Schema.Json)
const toolName = Schema.decodeUnknownSync(Schema.String)
const isOneOfChoice = Schema.is(Schema.Struct({ oneOf: Schema.Array(Schema.String) }))
const isToolChoice = Schema.is(Schema.Struct({ tool: Schema.String }))
const isRequiredChoice = Schema.is(Schema.Struct({ mode: Schema.Literal("required") }))

const jsonSchema = (schema: Schema.Top): DocumentType => {
  const document = Schema.toJsonSchemaDocument(schema)
  return toDocument(
    documentFromUnknown(
      document.definitions === undefined ? document.schema : { ...document.schema, $defs: document.definitions },
    ),
  )
}

const tools = (options: LanguageModel.ProviderOptions): ToolConfiguration | undefined => {
  const structured = options.responseFormat.type === "json"
  const selected = isOneOfChoice(options.toolChoice) ? [...options.toolChoice.oneOf] : undefined
  const definitions = structured
    ? [
        {
          toolSpec: {
            name: options.responseFormat.objectName,
            description: "Return the response as this JSON object.",
            inputSchema: { json: jsonSchema(options.responseFormat.schema) },
          },
        },
      ]
    : options.tools
        .filter(
          (tool) =>
            (Tool.isUserDefined(tool) || Tool.isDynamic(tool)) &&
            (selected === undefined || selected.includes(tool.name)),
        )
        .map((tool) => {
          const description = Tool.getDescription(tool)
          return {
            toolSpec: {
              name: toolName(tool.name),
              description,
              inputSchema: { json: toDocument(documentFromUnknown(Tool.getJsonSchema(tool))) },
            },
          }
        })
  if (definitions.length === 0 || (!structured && options.toolChoice === "none")) return undefined
  let choice: NonNullable<ToolConfiguration["toolChoice"]> = { auto: {} }
  if (structured) choice = { tool: { name: options.responseFormat.objectName } }
  else if (options.toolChoice === "required") choice = { any: {} }
  else if (isToolChoice(options.toolChoice)) {
    choice = { tool: { name: toolName(options.toolChoice.tool) } }
  } else if (isRequiredChoice(options.toolChoice)) choice = { any: {} }
  return { tools: definitions, toolChoice: choice }
}

const reasoningBlocks = Effect.fnUntraced(function* (part: Extract<PromptPart, { readonly type: "reasoning" }>) {
  const metadata = part.options.amazonBedrock
  if (metadata?.redactedData !== undefined) {
    const redactedContent = yield* Encoding.decodeBase64(metadata.redactedData).pipe(
      Result.mapError(() => invalidRequest("Bedrock redacted reasoning data must be valid base64")),
      Effect.fromResult,
    )
    return [{ reasoningContent: { redactedContent } }] satisfies Array<ContentBlock>
  }
  if (metadata?.signature !== undefined) {
    return [
      { reasoningContent: { reasoningText: { text: part.text, signature: metadata.signature } } },
    ] satisfies Array<ContentBlock>
  }
  return [{ text: part.text }] satisfies Array<ContentBlock>
})

const partBlocks = Effect.fnUntraced(function* (part: PromptPart, role: "user" | "assistant", finalPrefill: boolean) {
  const content: Array<ContentBlock> = []
  if (part.type === "text") {
    const text = finalPrefill ? part.text.trimEnd() : part.text
    if (role !== "assistant" || text.length > 0) content.push({ text })
  } else if (part.type === "file") {
    if (role === "assistant") return yield* invalidRequest("Bedrock Converse accepts files only in user messages")
    content.push(
      yield* fileBlock({
        mediaType: part.mediaType,
        data: part.data,
        ...(part.fileName === undefined ? undefined : { fileName: part.fileName }),
      }),
    )
  } else if (part.type === "tool-call") {
    content.push({
      toolUse: { toolUseId: part.id, name: part.name, input: toDocument(documentFromUnknown(part.params)) },
    })
  } else if (part.type === "tool-result") {
    const result = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(part.result).pipe(
      Effect.mapError(() => invalidRequest(`tool '${part.name}' returned a non-JSON result`)),
    )
    content.push({
      toolResult: {
        toolUseId: part.id,
        status: part.isFailure ? "error" : "success",
        content: [{ text: result }],
      },
    })
  } else if (part.type === "reasoning") {
    content.push(...(yield* reasoningBlocks(part)))
  }
  if (part.type !== "reasoning" && hasCachePoint(part.options)) content.push({ cachePoint: { type: "default" } })
  return content
})

const prompt = Effect.fnUntraced(function* (options: LanguageModel.ProviderOptions) {
  const system: Array<SystemContentBlock> = []
  const messages: Array<Message> = []
  let sawConversation = false
  const append = (role: "user" | "assistant", content: Array<ContentBlock>) => {
    const previous = messages.at(-1)
    if (previous?.role === role) previous.content?.push(...content)
    else messages.push({ role, content })
  }
  for (const [messageIndex, message] of options.prompt.content.entries()) {
    if (message.role === "system") {
      if (sawConversation) return yield* invalidRequest("system messages must precede conversation messages")
      system.push({ text: message.content })
      if (hasCachePoint(message.options)) system.push({ cachePoint: { type: "default" } })
      continue
    }
    sawConversation = true
    const content: Array<ContentBlock> = []
    for (const [partIndex, part] of message.content.entries()) {
      const finalPrefill =
        message.role === "assistant" &&
        messageIndex === options.prompt.content.length - 1 &&
        partIndex === message.content.length - 1
      const role = message.role === "assistant" ? "assistant" : "user"
      content.push(...(yield* partBlocks(part, role, finalPrefill)))
    }
    append(message.role === "assistant" ? "assistant" : "user", content)
  }
  return { system, messages }
})

const requestConfig = (config: Config, options: LanguageModel.ProviderOptions) => {
  const additionalInput =
    options.responseFormat.type === "json" && config.additionalModelRequestFields !== undefined
      ? Object.fromEntries(Object.entries(config.additionalModelRequestFields).filter(([key]) => key !== "thinking"))
      : config.additionalModelRequestFields
  const additional = additionalInput === undefined ? undefined : toDocument(additionalInput)
  const toolConfig = tools(options)
  return {
    inferenceConfig: {
      ...(config.maxTokens === undefined ? undefined : { maxTokens: config.maxTokens }),
      ...(config.temperature === undefined ? undefined : { temperature: config.temperature }),
      ...(config.topP === undefined ? undefined : { topP: config.topP }),
      ...(config.stopSequences === undefined ? undefined : { stopSequences: [...config.stopSequences] }),
    },
    ...(additional === undefined ? undefined : { additionalModelRequestFields: additional }),
    ...(config.additionalModelResponseFieldPaths === undefined
      ? undefined
      : { additionalModelResponseFieldPaths: [...config.additionalModelResponseFieldPaths] }),
    ...(config.guardrailConfig === undefined ? undefined : { guardrailConfig: config.guardrailConfig }),
    ...(config.performanceConfig === undefined ? undefined : { performanceConfig: config.performanceConfig }),
    ...(config.promptVariables === undefined ? undefined : { promptVariables: config.promptVariables }),
    ...(config.requestMetadata === undefined ? undefined : { requestMetadata: config.requestMetadata }),
    ...(toolConfig === undefined ? undefined : { toolConfig }),
  }
}

/** @experimental */
export const make = Effect.fnUntraced(function* (input: Options, options: LanguageModel.ProviderOptions) {
  const { system, messages } = yield* prompt(options)
  return {
    modelId: input.model,
    messages,
    ...(system.length > 0 ? { system } : undefined),
    ...requestConfig(input.config ?? {}, options),
  } satisfies ConverseCommandInput
})
