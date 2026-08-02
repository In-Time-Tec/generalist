import { Effect, Schema, Stream } from "effect"
import { AiError, LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
import { ModelProviderUsage, providerUsage } from "./model-attempt-observation.js"
import { type ToolJsonSchemaCompiler, toolJsonSchemaCompiler } from "./model-registry.js"

/** @experimental A model emitted parameters that do not satisfy the named Effect tool schema. */
export class InvalidToolCallParameters extends Schema.TaggedErrorClass<InvalidToolCallParameters>()(
  "@batonfx/core/InvalidToolCallParameters",
  {
    toolName: Schema.String,
    providerUsage: Schema.optionalKey(ModelProviderUsage),
  },
) {}

/** @experimental Tool correction was enabled for schema-backed tools, but the active model has no exact compiler. */
export class ToolJsonSchemaCompilerMissing extends Schema.TaggedErrorClass<ToolJsonSchemaCompilerMissing>()(
  "@batonfx/core/ToolJsonSchemaCompilerMissing",
  {},
) {}

/** @experimental A model-facing toolkit whose parameter decoding is permissive. */
export interface ProjectedToolkit {
  readonly toolkit: Toolkit.Toolkit<Record<string, Tool.Any>>
}

const preserveAnnotations = (projected: Tool.Any, original: Tool.Any): Tool.Any => {
  Object.defineProperty(projected, "annotations", {
    configurable: true,
    enumerable: true,
    value: original.annotations,
    writable: true,
  })
  return projected
}

const projectProviderDefined = (tool: Tool.ProviderDefined<`${string}.${string}`, string, any>): Tool.Any => {
  const constructor = Tool.providerDefined({
    id: tool.id,
    customName: tool.name,
    providerName: tool.providerName,
    args: tool.argsSchema,
    requiresHandler: tool.requiresHandler,
    parameters: Schema.Unknown,
    success: tool.successSchema,
    failure: tool.failureSchema,
  })
  const args =
    tool.failureMode === "return" && typeof tool.args === "object" && tool.args !== null
      ? { ...tool.args, failureMode: "return" as const }
      : tool.args
  return preserveAnnotations(constructor(args as never) as Tool.Any, tool)
}

const projectCompiled = (tool: Tool.Any, compile: ToolJsonSchemaCompiler): Effect.Effect<Tool.Any, AiError.AiError> =>
  Effect.map(compile(tool), (parameters) =>
    preserveAnnotations(
      Tool.dynamic(tool.name, {
        parameters,
        ...(Tool.getDescription(tool) === undefined ? {} : { description: Tool.getDescription(tool) }),
        success: tool.successSchema,
        failure: tool.failureSchema,
        failureMode: tool.failureMode,
        ...(tool.needsApproval === undefined ? {} : { needsApproval: tool.needsApproval }),
      }),
      tool,
    ),
  )

const makeToolkit = (tools: ReadonlyArray<Tool.Any>): Toolkit.Toolkit<Record<string, Tool.Any>> => {
  const toolkit = Toolkit.make(...tools)
  for (const tool of tools) {
    if (!Object.hasOwn(toolkit.tools, tool.name)) {
      Object.defineProperty(toolkit.tools, tool.name, {
        configurable: true,
        enumerable: true,
        value: tool,
        writable: true,
      })
    }
  }
  return toolkit
}

const project = (
  original: Toolkit.Any,
  compile: ToolJsonSchemaCompiler | undefined,
): Effect.Effect<ProjectedToolkit, AiError.AiError | ToolJsonSchemaCompilerMissing> =>
  Effect.gen(function* () {
    const tools: Array<Tool.Any> = []
    for (const tool of Object.values(original.tools)) {
      if (Tool.isProviderDefined(tool)) {
        tools.push(projectProviderDefined(tool))
      } else if (Tool.isDynamic(tool) && tool.jsonSchema !== undefined) {
        tools.push(tool)
      } else {
        if (compile === undefined) return yield* ToolJsonSchemaCompilerMissing.make({})
        tools.push(yield* projectCompiled(tool, compile))
      }
    }
    return { toolkit: makeToolkit(tools) }
  })

/** @experimental Project a toolkit with the active provider's exact JSON Schema compiler. */
export const projectToolkit = (
  original: Toolkit.Any,
  compile: ToolJsonSchemaCompiler,
): Effect.Effect<ProjectedToolkit, AiError.AiError> =>
  Effect.gen(function* () {
    const tools: Array<Tool.Any> = []
    for (const tool of Object.values(original.tools)) {
      if (Tool.isProviderDefined(tool)) tools.push(projectProviderDefined(tool))
      else if (Tool.isDynamic(tool) && tool.jsonSchema !== undefined) tools.push(tool)
      else tools.push(yield* projectCompiled(tool, compile))
    }
    return { toolkit: makeToolkit(tools) }
  })

const findTool = (toolkit: Toolkit.Any, name: string): Tool.Any | undefined => toolkit.tools[name]

const invalid = (name: string, usage?: Response.Usage): InvalidToolCallParameters => {
  const reportedUsage = usage === undefined ? undefined : providerUsage.fromResponse(usage)
  return InvalidToolCallParameters.make({
    toolName: name,
    ...(reportedUsage === undefined ? {} : { providerUsage: reportedUsage }),
  })
}

/** @experimental Decode one raw model tool call with the original Effect parameter schema. */
export const decodeToolCall = (
  toolkit: Toolkit.Any,
  part: Response.ToolCallPart<string, unknown>,
): Effect.Effect<Response.ToolCallPart<string, unknown>, InvalidToolCallParameters> => {
  const tool = findTool(toolkit, part.name)
  if (tool === undefined) return Effect.fail(invalid(part.name))
  const schema = tool.parametersSchema as unknown as Schema.ConstraintCodec<unknown, unknown, never, never>
  return Schema.decodeUnknownEffect(schema)(part.params).pipe(
    Effect.map((params) => ({ ...part, params })),
    Effect.mapError(() => invalid(part.name)),
  )
}

/** @experimental Validate a middleware-produced call against the decoded side of its original schema. */
export const validateDecodedToolCall = (
  toolkit: Toolkit.Any,
  part: Response.ToolCallPart<string, unknown>,
): Effect.Effect<Response.ToolCallPart<string, unknown>, InvalidToolCallParameters> => {
  const tool = findTool(toolkit, part.name)
  if (tool === undefined) return Effect.fail(invalid(part.name))
  const schema = Schema.toType(tool.parametersSchema)
  return Schema.decodeUnknownEffect(schema)(part.params).pipe(
    Effect.map((params) => ({ ...part, params })),
    Effect.mapError(() => invalid(part.name)),
  )
}

const isBuffered = (part: Response.StreamPart<any>): boolean =>
  part.type === "response-metadata" ||
  part.type === "tool-params-start" ||
  part.type === "tool-params-delta" ||
  part.type === "tool-params-end"

const validatedStream = (
  stream: Stream.Stream<Response.StreamPart<any>, any, any>,
  original: Toolkit.Any,
): Stream.Stream<Response.StreamPart<any>, any, any> =>
  Stream.suspend(() => {
    let released = false
    let invalidToolName: string | undefined
    let buffered: Array<Response.StreamPart<any>> = []
    const release = (part: Response.StreamPart<any>): ReadonlyArray<Response.StreamPart<any>> => {
      released = true
      const parts = [...buffered, part]
      buffered = []
      return parts
    }
    return stream.pipe(
      Stream.mapEffect((part) => {
        if (invalidToolName !== undefined) {
          return part.type === "finish"
            ? Effect.fail(invalid(invalidToolName, part.usage))
            : Effect.succeed<ReadonlyArray<Response.StreamPart<any>>>([])
        }
        if (released) {
          return part.type === "tool-call"
            ? decodeToolCall(original, part).pipe(Effect.map((decoded) => [decoded]))
            : Effect.succeed([part])
        }
        if (isBuffered(part)) {
          return Effect.sync(() => {
            buffered.push(part)
            return []
          })
        }
        if (part.type !== "tool-call") return Effect.succeed(release(part))
        return decodeToolCall(original, part).pipe(
          Effect.map((decoded) => release(decoded)),
          Effect.catch((error) =>
            Effect.sync(() => {
              invalidToolName = error.toolName
              buffered = []
              return []
            }),
          ),
        )
      }),
      Stream.flatMap(Stream.fromIterable),
      Stream.concat(
        Stream.suspend(() => (invalidToolName === undefined ? Stream.empty : Stream.fail(invalid(invalidToolName)))),
      ),
    )
  })

/** @experimental Wrap a model so Baton can validate tool calls before output escapes. */
export const wrap = (
  model: LanguageModel.Service,
  original: Toolkit.Any,
  projected: Toolkit.Toolkit<Record<string, Tool.Any>>,
): LanguageModel.Service =>
  ({
    ...model,
    streamText: ((options: LanguageModel.GenerateTextOptions<Record<string, Tool.Any>>) =>
      options.disableToolCallResolution === true
        ? validatedStream(model.streamText({ ...options, toolkit: projected } as never), original)
        : model.streamText(options as never)) as LanguageModel.Service["streamText"],
  }) as LanguageModel.Service

/** @experimental Prepare correction validation for the active direct or registered model. */
export const prepare = (
  model: LanguageModel.Service,
  original: Toolkit.Any,
  correctionLimit: number,
): Effect.Effect<LanguageModel.Service, ToolJsonSchemaCompilerMissing | AiError.AiError> => {
  if (correctionLimit === 0 || Object.keys(original.tools).length === 0) return Effect.succeed(model)
  const compile = toolJsonSchemaCompiler(model)
  const requiresCompiler = Object.values(original.tools).some(
    (tool) => !Tool.isProviderDefined(tool) && (!Tool.isDynamic(tool) || tool.jsonSchema === undefined),
  )
  if (requiresCompiler && compile === undefined) return Effect.fail(ToolJsonSchemaCompilerMissing.make({}))
  return project(original, compile).pipe(Effect.map((projected) => wrap(model, original, projected.toolkit)))
}

/** @experimental Test whether a failure is the precise Baton-owned correction signal. */
export const isInvalidToolCallParameters = Schema.is(InvalidToolCallParameters)
