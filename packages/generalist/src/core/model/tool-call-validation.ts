import { Effect, Function, Schema, Stream } from "effect"
import { adapt, type BroadTool, type BroadTools } from "./service.js"
import { AiError, LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
import { ProviderUsage, providerUsage } from "./attempt/observation.js"
import { type ToolJsonSchemaCompiler, toolJsonSchemaCompiler } from "./registry.js"
import { ActionableTaggedError, errorHint } from "../error-hint.js"

/** A model emitted parameters that do not satisfy the named Effect tool schema. */
export class InvalidToolCallParameters extends ActionableTaggedError<InvalidToolCallParameters>()(
  "generalist/core/InvalidToolCallParameters",
  {
    toolName: Schema.String,
    providerUsage: Schema.optionalKey(ProviderUsage),
    hint: errorHint(
      "Correct the named tool's parameters or let the configured correction attempt ask the model again.",
    ),
  },
) {}

/** Tool correction was enabled for schema-backed tools, but the active model has no exact compiler. */
export class ToolJsonSchemaCompilerMissing extends ActionableTaggedError<ToolJsonSchemaCompilerMissing>()(
  "generalist/core/ToolJsonSchemaCompilerMissing",
  {
    hint: errorHint("Register the active provider's exact tool JSON Schema compiler or disable correction."),
  },
) {}

/** A model-facing toolkit whose parameter decoding is permissive. */
export interface ProjectedToolkit {
  readonly toolkit: Toolkit.Toolkit<BroadTools>
}

const preserveAnnotations = (projected: BroadTool, original: Tool.Any): BroadTool =>
  projected.annotateMerge(original.annotations)

const projectProviderDefined = (tool: Tool.AnyProviderDefined): BroadTool => {
  const id = Schema.decodeUnknownSync(Schema.TemplateLiteral([Schema.String, ".", Schema.String]))(tool.id)
  const customName = Schema.decodeUnknownSync(Schema.String)(tool.name)
  const providerName = Schema.decodeSync(Schema.String)(tool.providerName)
  const requiresHandler = Schema.decodeUnknownSync(Schema.Boolean)(tool.requiresHandler)
  const constructor = Tool.providerDefined({
    id,
    customName,
    providerName,
    args: tool.argsSchema,
    requiresHandler,
    parameters: Schema.Unknown,
    success: Schema.Unknown,
    failure: Schema.Unknown,
  })
  const args = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Unknown))(tool.args)
  if (tool.failureMode === "return") Object.assign(args, { failureMode: "return" })
  return preserveAnnotations(constructor(args), tool)
}

const projectCompiled = (tool: Tool.Any, compile: ToolJsonSchemaCompiler): Effect.Effect<BroadTool, AiError.AiError> =>
  Effect.map(compile(tool), (parameters) => {
    const description = Tool.getDescription(tool)
    const options = {
      parameters,
      success: Schema.Unknown,
      failure: Schema.Unknown,
      failureMode: tool.failureMode,
    }
    let projected: BroadTool = Tool.dynamic(tool.name, options)
    if (description !== undefined && tool.needsApproval !== undefined) {
      projected = Tool.dynamic(tool.name, { ...options, description, needsApproval: tool.needsApproval })
    } else if (description !== undefined) {
      projected = Tool.dynamic(tool.name, { ...options, description })
    } else if (tool.needsApproval !== undefined) {
      projected = Tool.dynamic(tool.name, { ...options, needsApproval: tool.needsApproval })
    }
    return preserveAnnotations(projected, tool)
  })

const toolkitTools = (toolkit: Toolkit.Any): ReadonlyArray<Tool.Any> => {
  const tools: Array<Tool.Any> = []
  for (const name of Object.keys(toolkit.tools)) {
    const tool = toolkit.tools[name]
    if (tool !== undefined) tools.push(tool)
  }
  return tools
}

const makeToolkit = (tools: ReadonlyArray<BroadTool>): Toolkit.Toolkit<BroadTools> => {
  const toolkit = Toolkit.make(...tools)
  for (const tool of tools) {
    const name = Schema.decodeSync(Schema.String)(tool.name)
    if (!Object.hasOwn(toolkit.tools, name)) {
      Object.defineProperty(toolkit.tools, name, {
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
    const tools: Array<BroadTool> = []
    for (const tool of toolkitTools(original)) {
      if (Tool.isProviderDefined(tool)) {
        tools.push(projectProviderDefined(tool))
      } else if (Tool.isDynamic(tool) && tool.jsonSchema !== undefined) {
        const parameters = tool.jsonSchema
        tools.push(yield* projectCompiled(tool, () => Effect.succeed(parameters)))
      } else {
        if (compile === undefined) return yield* ToolJsonSchemaCompilerMissing.make({})
        tools.push(yield* projectCompiled(tool, compile))
      }
    }
    return { toolkit: makeToolkit(tools) }
  })

/** Project a toolkit with the active provider's exact JSON Schema compiler. */
export const projectToolkit: {
  (compile: ToolJsonSchemaCompiler): (original: Toolkit.Any) => Effect.Effect<ProjectedToolkit, AiError.AiError>
  (original: Toolkit.Any, compile: ToolJsonSchemaCompiler): Effect.Effect<ProjectedToolkit, AiError.AiError>
} = Function.dual(
  2,
  (original: Toolkit.Any, compile: ToolJsonSchemaCompiler): Effect.Effect<ProjectedToolkit, AiError.AiError> =>
    Effect.gen(function* () {
      const tools: Array<BroadTool> = []
      for (const tool of toolkitTools(original)) {
        if (Tool.isProviderDefined(tool)) tools.push(projectProviderDefined(tool))
        else if (Tool.isDynamic(tool) && tool.jsonSchema !== undefined) {
          const parameters = tool.jsonSchema
          tools.push(yield* projectCompiled(tool, () => Effect.succeed(parameters)))
        } else tools.push(yield* projectCompiled(tool, compile))
      }
      return { toolkit: makeToolkit(tools) }
    }),
)

const findTool = (toolkit: Toolkit.Any, name: string): Tool.Any | undefined => toolkit.tools[name]

const invalid = (name: string, usage?: Response.Usage): InvalidToolCallParameters => {
  const reportedUsage = usage === undefined ? undefined : providerUsage.fromResponse(usage)
  const fields: InvalidToolCallFields = { toolName: name }
  if (reportedUsage !== undefined) fields.providerUsage = reportedUsage
  return InvalidToolCallParameters.make(fields)
}

interface InvalidToolCallFields {
  toolName: string
  providerUsage?: ProviderUsage
}

/** Decode one raw model tool call with the original Effect parameter schema. */
export const decodeToolCall: {
  (
    part: Response.ToolCallPart<string, unknown>,
  ): (toolkit: Toolkit.Any) => Effect.Effect<Response.ToolCallPart<string, unknown>, InvalidToolCallParameters>
  (
    toolkit: Toolkit.Any,
    part: Response.ToolCallPart<string, unknown>,
  ): Effect.Effect<Response.ToolCallPart<string, unknown>, InvalidToolCallParameters>
} = Function.dual(
  2,
  (
    toolkit: Toolkit.Any,
    part: Response.ToolCallPart<string, unknown>,
  ): Effect.Effect<Response.ToolCallPart<string, unknown>, InvalidToolCallParameters> => {
    const tool = findTool(toolkit, part.name)
    if (tool === undefined) return Effect.fail(invalid(part.name))
    const schema = Schema.toType(tool.parametersSchema)
    return Schema.decodeUnknownEffect(schema, { onExcessProperty: "error" })(part.params).pipe(
      Effect.map((params) => ({ ...part, params })),
      Effect.mapError(() => invalid(part.name)),
    )
  },
)

/** Validate a middleware-produced call against the decoded side of its original schema. */
export const validateDecodedToolCall: {
  (
    part: Response.ToolCallPart<string, unknown>,
  ): (toolkit: Toolkit.Any) => Effect.Effect<Response.ToolCallPart<string, unknown>, InvalidToolCallParameters>
  (
    toolkit: Toolkit.Any,
    part: Response.ToolCallPart<string, unknown>,
  ): Effect.Effect<Response.ToolCallPart<string, unknown>, InvalidToolCallParameters>
} = Function.dual(
  2,
  (
    toolkit: Toolkit.Any,
    part: Response.ToolCallPart<string, unknown>,
  ): Effect.Effect<Response.ToolCallPart<string, unknown>, InvalidToolCallParameters> => {
    const tool = findTool(toolkit, part.name)
    if (tool === undefined) return Effect.fail(invalid(part.name))
    const schema = Schema.toType(tool.parametersSchema)
    return Schema.decodeUnknownEffect(schema, { onExcessProperty: "error" })(part.params).pipe(
      Effect.map((params) => ({ ...part, params })),
      Effect.mapError(() => invalid(part.name)),
    )
  },
)

const isBuffered = (part: Response.StreamPart<Record<string, Tool.Any>>): boolean =>
  part.type === "response-metadata" ||
  part.type === "tool-params-start" ||
  part.type === "tool-params-delta" ||
  part.type === "tool-params-end"

const validatedStream = <R>(
  stream: Stream.Stream<Response.StreamPart<Record<string, Tool.Any>>, AiError.AiError | InvalidToolCallParameters, R>,
  original: Toolkit.Any,
): Stream.Stream<Response.StreamPart<Record<string, Tool.Any>>, AiError.AiError | InvalidToolCallParameters, R> =>
  Stream.suspend(() => {
    let released = false
    let invalidToolName: string | undefined
    let buffered: Array<Response.StreamPart<Record<string, Tool.Any>>> = []
    const release = (
      part: Response.StreamPart<Record<string, Tool.Any>>,
    ): ReadonlyArray<Response.StreamPart<Record<string, Tool.Any>>> => {
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
            : Effect.succeed<ReadonlyArray<Response.StreamPart<Record<string, Tool.Any>>>>([])
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

/** Wrap a model so Generalist can validate tool calls before output escapes. */
export const wrap: {
  (
    original: Toolkit.Any,
    projected: Toolkit.Toolkit<BroadTools>,
  ): (model: LanguageModel.Service) => LanguageModel.Service
  (model: LanguageModel.Service, original: Toolkit.Any, projected: Toolkit.Toolkit<BroadTools>): LanguageModel.Service
} = Function.dual(
  3,
  (
    model: LanguageModel.Service,
    original: Toolkit.Any,
    projected: Toolkit.Toolkit<BroadTools>,
  ): LanguageModel.Service =>
    adapt<AiError.AiError | InvalidToolCallParameters, AiError.AiError, AiError.AiError | InvalidToolCallParameters>(
      model,
      {
        streamText: (options, invoke) =>
          options.disableToolCallResolution === true
            ? validatedStream(invoke({ ...options, toolkit: projected }), original)
            : invoke(),
      },
    ),
)

/** Prepare correction validation for the active direct or registered model. */
export const prepare: {
  (
    original: Toolkit.Any,
    correctionLimit: number,
  ): (
    model: LanguageModel.Service,
  ) => Effect.Effect<LanguageModel.Service, ToolJsonSchemaCompilerMissing | AiError.AiError>
  (
    model: LanguageModel.Service,
    original: Toolkit.Any,
    correctionLimit: number,
  ): Effect.Effect<LanguageModel.Service, ToolJsonSchemaCompilerMissing | AiError.AiError>
} = Function.dual(
  3,
  (
    model: LanguageModel.Service,
    original: Toolkit.Any,
    correctionLimit: number,
  ): Effect.Effect<LanguageModel.Service, ToolJsonSchemaCompilerMissing | AiError.AiError> => {
    if (correctionLimit === 0 || Object.keys(original.tools).length === 0) return Effect.succeed(model)
    const compile = toolJsonSchemaCompiler(model)
    const requiresCompiler = toolkitTools(original).some(
      (tool) => !Tool.isProviderDefined(tool) && (!Tool.isDynamic(tool) || tool.jsonSchema === undefined),
    )
    if (requiresCompiler && compile === undefined) return Effect.fail(ToolJsonSchemaCompilerMissing.make({}))
    return project(original, compile).pipe(Effect.map((projected) => wrap(model, original, projected.toolkit)))
  },
)

/** Test whether a failure is the precise Generalist-owned correction signal. */
export const isInvalidToolCallParameters = Schema.is(InvalidToolCallParameters)
