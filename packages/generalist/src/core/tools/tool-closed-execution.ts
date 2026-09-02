import { Effect, Function, Schema } from "effect"
import type { AgentToolToolkit } from "../agent/tool.js"
import { ToolContext } from "./tool-context.js"
import {
  FrameworkFailure,
  toolResultCodec,
  type ClosedToolSet,
  type Outcome,
  type Request,
  type SchemaTool,
  type ToolSchemaServices,
} from "./tool-result-codec.js"

type AgentToolSchemaServices<Parameters extends Schema.Top, Success extends Schema.Top> =
  | Parameters["DecodingServices"]
  | Parameters["EncodingServices"]
  | Success["DecodingServices"]
  | Success["EncodingServices"]

/** Execute one tool call against a closed tool set that already owns its invocation. */
export const executeWithClosedSet: {
  (
    request: Request,
  ): <R, T extends SchemaTool>(
    toolkit: ClosedToolSet<R, T>,
  ) => Effect.Effect<Outcome, FrameworkFailure, R | ToolContext | ToolSchemaServices<T>>
  <R, T extends SchemaTool>(
    toolkit: ClosedToolSet<R, T>,
    request: Request,
  ): Effect.Effect<Outcome, FrameworkFailure, R | ToolContext | ToolSchemaServices<T>>
} = Function.dual(
  2,
  <R, T extends SchemaTool>(
    toolkit: ClosedToolSet<R, T>,
    request: Request,
  ): Effect.Effect<Outcome, FrameworkFailure, R | ToolContext | ToolSchemaServices<T>> => {
    const tool = Object.hasOwn(toolkit.tools, request.call.name) ? toolkit.tools[request.call.name] : undefined
    if (tool === undefined) {
      return Effect.fail(
        toolResultCodec.frameworkFailure(
          "missing-handler",
          request.call.name,
          `Tool ${request.call.name} is not registered`,
        ),
      )
    }
    const handleFailure = (
      error: typeof Schema.Unknown.Type,
    ): Effect.Effect<Outcome, FrameworkFailure, T["failureSchema"]["EncodingServices"]> => {
      if (Schema.is(FrameworkFailure)(error)) return Effect.fail(error)
      return toolResultCodec.encodeDomainCandidate<T["failureSchema"]>(tool, error)
    }
    const executed: Effect.Effect<Outcome, FrameworkFailure, R | ToolContext | ToolSchemaServices<T>> = toolResultCodec
      .decodeInput<T["parametersSchema"]>(tool, request.call.params)
      .pipe(
        Effect.flatMap((params) => toolkit.invoke(request.call.name, params)),
        Effect.flatMap((result) => toolResultCodec.decodeSuccess<T["successSchema"]>(tool, result)),
        Effect.catchIf(() => true, handleFailure, handleFailure),
      )
    return executed
  },
)

/** Execute one tool call against a closed agent-tool toolkit. */
export const executeWithClosedToolkit: {
  (
    request: Request,
  ): <
    R,
    Name extends string = string,
    Parameters extends Schema.Top = Schema.Top,
    SuccessSchema extends Schema.Top = Schema.Top,
  >(
    toolkit: AgentToolToolkit<Name, Parameters, SuccessSchema, R>,
  ) => Effect.Effect<Outcome, FrameworkFailure, R | ToolContext | AgentToolSchemaServices<Parameters, SuccessSchema>>
  <
    R,
    Name extends string = string,
    Parameters extends Schema.Top = Schema.Top,
    SuccessSchema extends Schema.Top = Schema.Top,
  >(
    toolkit: AgentToolToolkit<Name, Parameters, SuccessSchema, R>,
    request: Request,
  ): Effect.Effect<Outcome, FrameworkFailure, R | ToolContext | AgentToolSchemaServices<Parameters, SuccessSchema>>
} = Function.dual(
  2,
  <
    R,
    Name extends string = string,
    Parameters extends Schema.Top = Schema.Top,
    SuccessSchema extends Schema.Top = Schema.Top,
  >(
    toolkit: AgentToolToolkit<Name, Parameters, SuccessSchema, R>,
    request: Request,
  ): Effect.Effect<Outcome, FrameworkFailure, R | ToolContext | AgentToolSchemaServices<Parameters, SuccessSchema>> => {
    const executed = executeWithClosedSet(
      {
        tools: toolkit.tools,
        invoke: (name, params) =>
          name === toolkit.name ? toolkit.invoke(params) : Effect.fail(`Unknown tool ${name}`),
      },
      request,
    )
    return executed
  },
)
