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
import { Effect, Encoding, Result, Schema } from "effect"
import { AiError, LanguageModel, Tool } from "effect/unstable/ai"
import type { Config, Input } from "./amazon-bedrock.js"

const fail = (description: string) =>
  AiError.AiError.make({
    module: "AmazonBedrock",
    method: "makeRequest",
    reason: AiError.InvalidRequestError.make({ description }),
  })

const imageFormats: Readonly<Record<string, ImageFormat>> = {
  "image/gif": "gif",
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
}
const documentFormats: Readonly<Record<string, DocumentFormat>> = {
  "application/pdf": "pdf",
  "text/csv": "csv",
  "text/html": "html",
  "text/markdown": "md",
  "text/plain": "txt",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
}
const bytes = (data: string | Uint8Array | URL) => {
  if (data instanceof URL) return Effect.fail(fail("Bedrock Converse does not accept URL file sources"))
  if (data instanceof Uint8Array) return Effect.succeed(data)
  const value = data.includes(",") && data.startsWith("data:") ? data.slice(data.indexOf(",") + 1) : data
  return Encoding.decodeBase64(value).pipe(
    Result.mapError(() => fail("file data must be valid base64")),
    Effect.fromResult,
  )
}

const hasCachePoint = (options: { readonly amazonBedrock?: unknown }): boolean => {
  const value = options.amazonBedrock
  return typeof value === "object" && value !== null && "cachePoint" in value && value.cachePoint === true
}

const fileBlock = Effect.fnUntraced(function* (part: {
  readonly mediaType: string
  readonly fileName?: string
  readonly data: string | Uint8Array | URL
}) {
  const source = yield* bytes(part.data)
  const image = imageFormats[part.mediaType]
  if (image !== undefined) return { image: { format: image, source: { bytes: source } } } satisfies ContentBlock
  const document = documentFormats[part.mediaType]
  if (document === undefined) return yield* fail(`unsupported file MIME type: ${part.mediaType}`)
  const name = (part.fileName ?? "document").replace(/[^A-Za-z0-9 ()[\]-]/g, "-").slice(0, 200)
  return { document: { format: document, name, source: { bytes: source } } } satisfies ContentBlock
})

const jsonSchema = (schema: Schema.Top): DocumentType => {
  const document = Schema.toJsonSchemaDocument(schema)
  return (
    document.definitions !== undefined ? { ...document.schema, $defs: document.definitions } : document.schema
  ) as DocumentType
}

const tools = (options: LanguageModel.ProviderOptions): ToolConfiguration | undefined => {
  const structured = options.responseFormat.type === "json"
  const selected =
    typeof options.toolChoice === "object" && "oneOf" in options.toolChoice ? options.toolChoice.oneOf : undefined
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
              name: tool.name,
              ...(description === undefined ? {} : { description }),
              inputSchema: { json: jsonSchema(tool.parametersSchema) },
            },
          }
        })
  if (definitions.length === 0 || (!structured && options.toolChoice === "none")) return undefined
  const choice = structured
    ? { tool: { name: options.responseFormat.objectName } }
    : options.toolChoice === "auto"
      ? { auto: {} }
      : options.toolChoice === "required"
        ? { any: {} }
        : typeof options.toolChoice === "object" && "tool" in options.toolChoice
          ? { tool: { name: options.toolChoice.tool } }
          : typeof options.toolChoice === "object" && options.toolChoice.mode === "required"
            ? { any: {} }
            : { auto: {} }
  return { tools: definitions, toolChoice: choice }
}

/** @experimental */
export const makeRequest = Effect.fnUntraced(function* (input: Input, options: LanguageModel.ProviderOptions) {
  const system: Array<SystemContentBlock> = []
  const messages: Array<Message> = []
  let sawConversation = false
  const append = (role: "user" | "assistant", content: Array<ContentBlock>) => {
    const previous = messages.at(-1)
    if (previous?.role === role) previous.content?.push(...content)
    else messages.push({ role, content })
  }
  for (let messageIndex = 0; messageIndex < options.prompt.content.length; messageIndex++) {
    const message = options.prompt.content[messageIndex]!
    if (message.role === "system") {
      if (sawConversation) return yield* fail("system messages must precede conversation messages")
      system.push({ text: message.content })
      if (hasCachePoint(message.options)) system.push({ cachePoint: { type: "default" } })
      continue
    }
    sawConversation = true
    const content: Array<ContentBlock> = []
    for (let partIndex = 0; partIndex < message.content.length; partIndex++) {
      const part = message.content[partIndex]!
      if (part.type === "text") {
        const finalPrefill =
          message.role === "assistant" &&
          messageIndex === options.prompt.content.length - 1 &&
          partIndex === message.content.length - 1
        const text = finalPrefill ? part.text.trimEnd() : part.text
        if (message.role !== "assistant" || text.length > 0) content.push({ text })
        if (hasCachePoint(part.options)) content.push({ cachePoint: { type: "default" } })
      } else if (part.type === "file") {
        if (message.role === "assistant") return yield* fail("Bedrock Converse accepts files only in user messages")
        content.push(
          yield* fileBlock({
            mediaType: part.mediaType,
            data: part.data,
            ...(part.fileName === undefined ? {} : { fileName: part.fileName }),
          }),
        )
        if (hasCachePoint(part.options)) content.push({ cachePoint: { type: "default" } })
      } else if (part.type === "tool-call")
        content.push({ toolUse: { toolUseId: part.id, name: part.name, input: part.params as DocumentType } })
      else if (part.type === "tool-result") {
        const result = yield* Schema.encodeEffect(Schema.UnknownFromJsonString)(part.result).pipe(
          Effect.mapError(() => fail(`tool '${part.name}' returned a non-JSON result`)),
        )
        content.push({
          toolResult: {
            toolUseId: part.id,
            status: part.isFailure ? "error" : "success",
            content: [{ text: result }],
          },
        })
        if (hasCachePoint(part.options)) content.push({ cachePoint: { type: "default" } })
      } else if (part.type === "reasoning") {
        const metadata = part.options.amazonBedrock
        if (metadata?.redactedData !== undefined) {
          const redactedContent = yield* Encoding.decodeBase64(metadata.redactedData).pipe(
            Result.mapError(() => fail("Bedrock redacted reasoning data must be valid base64")),
            Effect.fromResult,
          )
          content.push({
            reasoningContent: { redactedContent },
          })
        } else if (metadata?.signature !== undefined)
          content.push({
            reasoningContent: {
              reasoningText: { text: part.text, signature: metadata.signature },
            },
          })
        else content.push({ text: part.text })
      }
    }
    append(message.role === "assistant" ? "assistant" : "user", content)
  }
  const config: Config = input.config ?? {}
  const additional = (
    options.responseFormat.type === "json" && config.additionalModelRequestFields !== undefined
      ? Object.fromEntries(Object.entries(config.additionalModelRequestFields).filter(([key]) => key !== "thinking"))
      : config.additionalModelRequestFields
  ) as DocumentType | undefined
  const toolConfig = tools(options)
  return {
    modelId: input.model,
    messages,
    ...(system.length > 0 ? { system } : {}),
    inferenceConfig: {
      ...(config.maxTokens === undefined ? {} : { maxTokens: config.maxTokens }),
      ...(config.temperature === undefined ? {} : { temperature: config.temperature }),
      ...(config.topP === undefined ? {} : { topP: config.topP }),
      ...(config.stopSequences === undefined ? {} : { stopSequences: [...config.stopSequences] }),
    },
    ...(additional === undefined ? {} : { additionalModelRequestFields: additional }),
    ...(config.additionalModelResponseFieldPaths === undefined
      ? {}
      : { additionalModelResponseFieldPaths: [...config.additionalModelResponseFieldPaths] }),
    ...(config.guardrailConfig === undefined ? {} : { guardrailConfig: config.guardrailConfig }),
    ...(config.performanceConfig === undefined ? {} : { performanceConfig: config.performanceConfig }),
    ...(config.promptVariables === undefined ? {} : { promptVariables: config.promptVariables }),
    ...(config.requestMetadata === undefined ? {} : { requestMetadata: config.requestMetadata }),
    ...(toolConfig === undefined ? {} : { toolConfig }),
  } satisfies ConverseCommandInput
})
