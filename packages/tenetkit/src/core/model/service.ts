import { Effect, Function, Schema, Stream } from "effect"
import { LanguageModel, Response, Tool } from "effect/unstable/ai"
import type { NoExcessProperties } from "effect/Types"
import { ToolContext } from "../tools/tool-context.js"

/** @internal A broad toolkit used only by the adapter's implementation boundary. */
export type BroadTool = Tool.Tool<
  string,
  {
    readonly parameters: typeof Schema.Unknown
    readonly success: typeof Schema.Unknown
    readonly failure: typeof Schema.Unknown
    readonly failureMode: Tool.FailureMode
  },
  ToolContext
>
export type BroadTools = Record<string, BroadTool>

const broadObjectSchema = Schema.Struct({ value: Schema.String })

type BroadGenerateTextOptions = Omit<LanguageModel.GenerateTextOptions<BroadTools>, "toolkit"> & {
  readonly toolkit?: LanguageModel.ToolkitOption<BroadTools, never, ToolContext>
}
export type StreamTextOptions = Omit<LanguageModel.GenerateTextOptions<BroadTools>, "toolkit"> & {
  readonly toolkit?: LanguageModel.ToolkitOption<BroadTools, never, ToolContext | Tool.Handler<string>>
}
type BroadGenerateObjectOptions = LanguageModel.GenerateObjectOptions<BroadTools, typeof broadObjectSchema>
type BroadGenerateTextResponse = LanguageModel.GenerateTextResponse<BroadTools>
type BroadGenerateObjectResponse = LanguageModel.GenerateObjectResponse<BroadTools, unknown>
type BroadStreamPart = Response.StreamPart<BroadTools>
type BroadGenerateError = LanguageModel.ExtractError<LanguageModel.GenerateTextOptions<BroadTools>>
type BroadGenerateObjectError = LanguageModel.ExtractError<BroadGenerateObjectOptions>

interface NoToolkitOptions {
  prompt: LanguageModel.GenerateTextOptions<Record<never, never>>["prompt"]
  concurrency?: LanguageModel.GenerateTextOptions<Record<never, never>>["concurrency"]
  disableToolCallResolution?: boolean
  toolChoice?: "auto" | "none" | "required"
  toolkit: undefined
}

type SchemaServices<S extends Schema.Encoder<Record<string, Tool.Any>, unknown>> = [unknown] extends [
  S["DecodingServices"],
]
  ? never
  : S["DecodingServices"]

type GenerateTextMiddleware<Extra> = (
  options: BroadGenerateTextOptions,
  invoke: (
    options?: BroadGenerateTextOptions,
  ) => Effect.Effect<BroadGenerateTextResponse, BroadGenerateError, ToolContext>,
) => Effect.Effect<BroadGenerateTextResponse, BroadGenerateError | Extra, ToolContext>

type GenerateObjectMiddleware<Extra, R = ToolContext> = (
  options: BroadGenerateObjectOptions,
  invoke: (
    options?: BroadGenerateObjectOptions,
  ) => Effect.Effect<BroadGenerateObjectResponse, BroadGenerateObjectError, R>,
) => Effect.Effect<BroadGenerateObjectResponse, BroadGenerateObjectError | Extra, R>

type StreamTextMiddleware<Extra> = (
  options: StreamTextOptions,
  invoke: (
    options?: StreamTextOptions,
  ) => Stream.Stream<BroadStreamPart, BroadGenerateError, ToolContext | Tool.Handler<string>>,
) => Stream.Stream<BroadStreamPart | Response.ErrorPart, BroadGenerateError | Extra, ToolContext | Tool.Handler<string>>

/** @internal Typed operation-level model middleware. */
export interface Middleware<GenerateError = never, GenerateObjectError = never, StreamError = never> {
  readonly generateText?: GenerateTextMiddleware<GenerateError>
  readonly generateObject?: GenerateObjectMiddleware<GenerateObjectError>
  readonly streamText?: StreamTextMiddleware<StreamError>
}

const noToolkitOptions = (
  options: BroadGenerateTextOptions | StreamTextOptions,
): LanguageModel.GenerateTextOptions<Record<never, never>> => {
  const result: NoToolkitOptions = { prompt: options.prompt, toolkit: undefined }
  if (options.concurrency !== undefined) result.concurrency = options.concurrency
  if (options.disableToolCallResolution !== undefined) {
    result.disableToolCallResolution = options.disableToolCallResolution
  }
  if (options.toolChoice === "auto" || options.toolChoice === "none" || options.toolChoice === "required") {
    result.toolChoice = options.toolChoice
  }
  return result
}

const invokeGenerateTextImpl = (model: LanguageModel.Service, options: BroadGenerateTextOptions) => {
  if (options.toolkit === undefined) {
    return model.generateText({ ...noToolkitOptions(options), toolkit: undefined })
  }
  const withToolkit = { ...options, toolkit: options.toolkit }
  return model.generateText<BroadTools, typeof withToolkit>(withToolkit)
}

export const invokeGenerateText: {
  (options: BroadGenerateTextOptions): (model: LanguageModel.Service) => ReturnType<typeof invokeGenerateTextImpl>
  (model: LanguageModel.Service, options: BroadGenerateTextOptions): ReturnType<typeof invokeGenerateTextImpl>
} = Function.dual(2, invokeGenerateTextImpl)

const invokeGenerateObjectImpl = (
  model: LanguageModel.Service,
  options: BroadGenerateObjectOptions,
): Effect.Effect<BroadGenerateObjectResponse, BroadGenerateObjectError, ToolContext> => model.generateObject(options)

export const invokeGenerateObject: {
  (options: BroadGenerateObjectOptions): (model: LanguageModel.Service) => ReturnType<typeof invokeGenerateObjectImpl>
  (model: LanguageModel.Service, options: BroadGenerateObjectOptions): ReturnType<typeof invokeGenerateObjectImpl>
} = Function.dual(2, invokeGenerateObjectImpl)

const invokeStreamTextImpl = (model: LanguageModel.Service, options: StreamTextOptions) => {
  if (options.toolkit === undefined) {
    return model.streamText({ ...noToolkitOptions(options), toolkit: undefined })
  }
  const withToolkit = { ...options, toolkit: options.toolkit }
  return model.streamText<BroadTools, typeof withToolkit>(withToolkit)
}

export const invokeStreamText: {
  (options: StreamTextOptions): (model: LanguageModel.Service) => ReturnType<typeof invokeStreamTextImpl>
  (model: LanguageModel.Service, options: StreamTextOptions): ReturnType<typeof invokeStreamTextImpl>
} = Function.dual(2, invokeStreamTextImpl)

/** @internal Adapt all three LanguageModel operations without re-declaring their implementation overloads. */
type MetadataCopier = (source: LanguageModel.Service, target: LanguageModel.Service) => void
const metadataCopiers: Array<MetadataCopier> = []

export const registerMetadataCopier = (copier: MetadataCopier): void => {
  metadataCopiers.push(copier)
}

const copyMetadata = (source: LanguageModel.Service, target: LanguageModel.Service): void => {
  for (const copier of metadataCopiers) copier(source, target)
}

export const adapt: {
  <GenerateError = never, GenerateObjectError = never, StreamError = never>(
    middleware: Middleware<GenerateError, GenerateObjectError, StreamError>,
  ): (model: LanguageModel.Service) => LanguageModel.Service
  <GenerateError = never, GenerateObjectError = never, StreamError = never>(
    model: LanguageModel.Service,
    middleware: Middleware<GenerateError, GenerateObjectError, StreamError>,
  ): LanguageModel.Service
} = Function.dual(
  2,
  <GenerateError = never, GenerateObjectError = never, StreamError = never>(
    model: LanguageModel.Service,
    middleware: Middleware<GenerateError, GenerateObjectError, StreamError>,
  ): LanguageModel.Service => {
    function generateText<
      Options extends NoExcessProperties<LanguageModel.GenerateTextOptions<Record<never, never>>, Options>,
    >(
      options: Options & { readonly toolkit?: undefined } & LanguageModel.GenerateTextOptions<Record<never, never>>,
    ): Effect.Effect<
      LanguageModel.GenerateTextResponse<Record<never, never>>,
      LanguageModel.ExtractError<Options>,
      LanguageModel.ExtractServices<Options>
    >
    function generateText<
      Tools extends Record<string, Tool.Any>,
      Options extends NoExcessProperties<
        LanguageModel.GenerateTextOptions<Tools> & { readonly toolkit: LanguageModel.ToolkitInput<Tools> },
        Options
      >,
    >(
      options: Options &
        LanguageModel.GenerateTextOptions<Tools> & {
          readonly toolkit: LanguageModel.ToolkitInput<Tools>
        },
    ): Effect.Effect<
      LanguageModel.GenerateTextResponse<Tools>,
      LanguageModel.ExtractError<Options>,
      LanguageModel.ExtractServices<Options>
    >
    function generateText<
      Options extends {
        readonly toolkit: LanguageModel.ToolkitOption<Record<string, Tool.Any>>
      } & NoExcessProperties<LanguageModel.GenerateTextOptions<Record<string, Tool.Any>>, Options>,
    >(
      options: Options &
        LanguageModel.GenerateTextOptions<LanguageModel.ExtractTools<Options>> & {
          readonly toolkit: Options["toolkit"]
        },
    ): Effect.Effect<
      LanguageModel.GenerateTextResponse<LanguageModel.ExtractTools<Options>>,
      LanguageModel.ExtractError<Options>,
      LanguageModel.ExtractServices<Options>
    >
    function generateText(options: BroadGenerateTextOptions) {
      const invoke = (input = options) => invokeGenerateText(model, input)
      return middleware.generateText === undefined ? invoke() : middleware.generateText(options, invoke)
    }

    function streamText<
      Options extends NoExcessProperties<LanguageModel.GenerateTextOptions<Record<never, never>>, Options>,
    >(
      options: Options & { readonly toolkit?: undefined } & LanguageModel.GenerateTextOptions<Record<never, never>>,
    ): Stream.Stream<
      Response.StreamPart<Record<never, never>>,
      LanguageModel.ExtractError<Options>,
      LanguageModel.ExtractServices<Options>
    >
    function streamText<
      Tools extends Record<string, Tool.Any>,
      Options extends NoExcessProperties<
        LanguageModel.GenerateTextOptions<Tools> & { readonly toolkit: LanguageModel.ToolkitInput<Tools> },
        Options
      >,
    >(
      options: Options &
        LanguageModel.GenerateTextOptions<Tools> & {
          readonly toolkit: LanguageModel.ToolkitInput<Tools>
        },
    ): Stream.Stream<
      Response.StreamPart<Tools>,
      LanguageModel.ExtractError<Options>,
      LanguageModel.ExtractServices<Options>
    >
    function streamText<
      Options extends {
        readonly toolkit: LanguageModel.ToolkitOption<Record<string, Tool.Any>>
      } & NoExcessProperties<LanguageModel.GenerateTextOptions<Record<string, Tool.Any>>, Options>,
    >(
      options: Options &
        LanguageModel.GenerateTextOptions<LanguageModel.ExtractTools<Options>> & {
          readonly toolkit: Options["toolkit"]
        },
    ): Stream.Stream<
      Response.StreamPart<LanguageModel.ExtractTools<Options>>,
      LanguageModel.ExtractError<Options>,
      LanguageModel.ExtractServices<Options>
    >
    function streamText(options: StreamTextOptions) {
      const invoke = (input = options) => invokeStreamText(model, input)
      return middleware.streamText === undefined ? invoke() : middleware.streamText(options, invoke)
    }

    function generateObject<
      ObjectEncoded extends Record<string, Tool.Any>,
      StructuredOutputSchema extends Schema.Encoder<ObjectEncoded, unknown>,
      Options extends NoExcessProperties<
        LanguageModel.GenerateObjectOptions<Record<string, Tool.Any>, StructuredOutputSchema>,
        Options
      >,
      Tools extends Record<string, Tool.Any> = Record<never, never>,
    >(
      options: Options & LanguageModel.GenerateObjectOptions<Tools, StructuredOutputSchema>,
    ): Effect.Effect<
      LanguageModel.GenerateObjectResponse<Tools, StructuredOutputSchema["Type"]>,
      LanguageModel.ExtractError<Options>,
      LanguageModel.ExtractServices<Options> | SchemaServices<StructuredOutputSchema>
    >
    function generateObject(options: BroadGenerateObjectOptions) {
      const invoke = (input = options) => invokeGenerateObject(model, input)
      return middleware.generateObject === undefined ? invoke() : middleware.generateObject(options, invoke)
    }

    const adapted = { ...model, generateText, generateObject, streamText }
    copyMetadata(model, adapted)
    return adapted
  },
)

export const identity: Middleware = {}

export const middleware = <GenerateError, GenerateObjectError, StreamError>(
  input: Middleware<GenerateError, GenerateObjectError, StreamError>,
): Middleware<GenerateError, GenerateObjectError, StreamError> => input
