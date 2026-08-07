import { Effect, Function, Schema, Stream } from "effect"
import { LanguageModel, Response, Tool } from "effect/unstable/ai"
import type { NoExcessProperties } from "effect/Types"
import { ToolContext } from "../tools/tool-context.js"

/** @internal A broad toolkit used only by the adapter's implementation boundary. */
type BroadTools = Record<string, Tool.Any>

const broadObjectSchema = Schema.Struct({ value: Schema.String })

type BroadGenerateObjectOptions = LanguageModel.GenerateObjectOptions<BroadTools, typeof broadObjectSchema>
type BroadGenerateTextResponse = LanguageModel.GenerateTextResponse<BroadTools>
type BroadGenerateObjectResponse = LanguageModel.GenerateObjectResponse<BroadTools, unknown>
type BroadStreamPart = Response.StreamPart<BroadTools>
type BroadGenerateError = LanguageModel.ExtractError<LanguageModel.GenerateTextOptions<BroadTools>>
type BroadGenerateObjectError = LanguageModel.ExtractError<BroadGenerateObjectOptions>

type SchemaServices<S extends Schema.Encoder<Record<string, Tool.Any>, unknown>> = [unknown] extends [
  S["DecodingServices"]
]
  ? never
  : S["DecodingServices"]

type GenerateTextMiddleware<Extra, R> = (
  options: LanguageModel.GenerateTextOptions<BroadTools>,
  invoke: (
    options?: LanguageModel.GenerateTextOptions<BroadTools>,
  ) => Effect.Effect<BroadGenerateTextResponse, BroadGenerateError, R>,
) => Effect.Effect<BroadGenerateTextResponse, BroadGenerateError | Extra, R>

type GenerateObjectMiddleware<Extra, R = ToolContext> = (
  options: BroadGenerateObjectOptions,
  invoke: (
    options?: BroadGenerateObjectOptions,
  ) => Effect.Effect<BroadGenerateObjectResponse, BroadGenerateObjectError, R>,
) => Effect.Effect<BroadGenerateObjectResponse, BroadGenerateObjectError | Extra, R>

type StreamTextMiddleware<Extra> = (
  options: LanguageModel.GenerateTextOptions<BroadTools>,
  invoke: (
    options?: LanguageModel.GenerateTextOptions<BroadTools>,
  ) => Stream.Stream<BroadStreamPart, BroadGenerateError, unknown>,
) => Stream.Stream<BroadStreamPart | Response.ErrorPart, BroadGenerateError | Extra, unknown>

/** @internal Typed operation-level model middleware. */
export interface Middleware<GenerateError = never, GenerateObjectError = never, StreamError = never, R = ToolContext> {
  readonly generateText?: GenerateTextMiddleware<GenerateError, R>
  readonly generateObject?: GenerateObjectMiddleware<GenerateObjectError>
  readonly streamText?: StreamTextMiddleware<StreamError>
}

const noToolkitOptions = (
  options: LanguageModel.GenerateTextOptions<BroadTools>,
): LanguageModel.GenerateTextOptions<{}> => ({
  prompt: options.prompt,
  ...(options.concurrency === undefined ? {} : { concurrency: options.concurrency }),
  ...(options.disableToolCallResolution === undefined
    ? {}
    : { disableToolCallResolution: options.disableToolCallResolution }),
  ...(options.toolChoice === "auto" || options.toolChoice === "none" || options.toolChoice === "required"
    ? { toolChoice: options.toolChoice }
    : {}),
  toolkit: undefined,
})

const invokeGenerateTextImpl = (
  model: LanguageModel.Service,
  options: LanguageModel.GenerateTextOptions<BroadTools>,
) => {
  if (options.toolkit === undefined) {
    return model.generateText({ ...noToolkitOptions(options), toolkit: undefined })
  }
  const invoked: Effect.Effect<BroadGenerateTextResponse, BroadGenerateError, ToolContext> = model.generateText({
    ...options,
    toolkit: options.toolkit,
  })
  return invoked
}

export const invokeGenerateText: {
  (
    options: LanguageModel.GenerateTextOptions<BroadTools>,
  ): (model: LanguageModel.Service) => ReturnType<typeof invokeGenerateTextImpl>
  (
    model: LanguageModel.Service,
    options: LanguageModel.GenerateTextOptions<BroadTools>,
  ): ReturnType<typeof invokeGenerateTextImpl>
} = Function.dual(2, invokeGenerateTextImpl)

const invokeGenerateObjectImpl = (
  model: LanguageModel.Service,
  options: BroadGenerateObjectOptions,
): Effect.Effect<BroadGenerateObjectResponse, BroadGenerateObjectError, ToolContext> => model.generateObject(options)

export const invokeGenerateObject: {
  (options: BroadGenerateObjectOptions): (model: LanguageModel.Service) => ReturnType<typeof invokeGenerateObjectImpl>
  (model: LanguageModel.Service, options: BroadGenerateObjectOptions): ReturnType<typeof invokeGenerateObjectImpl>
} = Function.dual(2, invokeGenerateObjectImpl)

const invokeStreamTextImpl = (model: LanguageModel.Service, options: LanguageModel.GenerateTextOptions<BroadTools>) =>
  options.toolkit === undefined
    ? model.streamText({ ...noToolkitOptions(options), toolkit: undefined })
    : model.streamText({ ...options, toolkit: options.toolkit })

export const invokeStreamText: {
  (
    options: LanguageModel.GenerateTextOptions<BroadTools>,
  ): (model: LanguageModel.Service) => ReturnType<typeof invokeStreamTextImpl>
  (
    model: LanguageModel.Service,
    options: LanguageModel.GenerateTextOptions<BroadTools>,
  ): ReturnType<typeof invokeStreamTextImpl>
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
    function generateText<Options extends NoExcessProperties<LanguageModel.GenerateTextOptions<{}>, Options>>(
      options: Options & { readonly toolkit?: undefined } & LanguageModel.GenerateTextOptions<{}>,
    ): Effect.Effect<
      LanguageModel.GenerateTextResponse<{}>,
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
    function generateText(options: LanguageModel.GenerateTextOptions<BroadTools>) {
      const invoke = (input = options) => invokeGenerateText(model, input)
      return middleware.generateText === undefined ? invoke() : middleware.generateText(options, invoke)
    }

    function streamText<Options extends NoExcessProperties<LanguageModel.GenerateTextOptions<{}>, Options>>(
      options: Options & { readonly toolkit?: undefined } & LanguageModel.GenerateTextOptions<{}>,
    ): Stream.Stream<
      Response.StreamPart<{}>,
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
    function streamText(options: LanguageModel.GenerateTextOptions<BroadTools>) {
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
      Tools extends Record<string, Tool.Any> = {},
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
