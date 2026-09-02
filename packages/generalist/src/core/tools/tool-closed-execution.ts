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
import { HookFailed } from "../../hooks/index.js"
import { DriverError, DriverStateInvalid } from "../durable/service.js"
import { suspendedFromCause, suspendedOutcome } from "../agent/tools/wake-event.js"

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
        Effect.catchCause((cause) => {
          const suspension = suspendedFromCause(cause)
          return suspension === undefined ? Effect.failCause(cause) : Effect.succeed(suspendedOutcome(suspension))
        }),
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
  ) => Effect.Effect<
    Outcome,
    FrameworkFailure | HookFailed | DriverError | DriverStateInvalid,
    R | ToolContext | AgentToolSchemaServices<Parameters, SuccessSchema>
  >
  <
    R,
    Name extends string = string,
    Parameters extends Schema.Top = Schema.Top,
    SuccessSchema extends Schema.Top = Schema.Top,
  >(
    toolkit: AgentToolToolkit<Name, Parameters, SuccessSchema, R>,
    request: Request,
  ): Effect.Effect<
    Outcome,
    FrameworkFailure | HookFailed | DriverError | DriverStateInvalid,
    R | ToolContext | AgentToolSchemaServices<Parameters, SuccessSchema>
  >
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
  ): Effect.Effect<
    Outcome,
    FrameworkFailure | HookFailed | DriverError | DriverStateInvalid,
    R | ToolContext | AgentToolSchemaServices<Parameters, SuccessSchema>
  > => {
    if (request.call.name !== toolkit.name) {
      return Effect.fail(
        toolResultCodec.frameworkFailure(
          "missing-handler",
          request.call.name,
          `Tool ${request.call.name} is not registered`,
        ),
      )
    }
    const handleFailure = (error: typeof Schema.Unknown.Type): Effect.Effect<Outcome, FrameworkFailure> => {
      if (Schema.is(FrameworkFailure)(error)) return Effect.fail(error)
      return toolResultCodec.encodeDomainCandidate(toolkit.tool, error)
    }
    const isHookFailure = (error: typeof Schema.Unknown.Type): error is HookFailed | DriverError | DriverStateInvalid =>
      Schema.is(HookFailed)(error) || Schema.is(DriverError)(error) || Schema.is(DriverStateInvalid)(error)
    return toolResultCodec.decodeInput(toolkit.tool, request.call.params).pipe(
      Effect.flatMap(toolkit.invoke),
      Effect.flatMap((result) => toolResultCodec.decodeSuccess(toolkit.tool, result)),
      Effect.catchIf((error) => !isHookFailure(error), handleFailure, handleFailure),
      Effect.catchCause((cause) => {
        const suspension = suspendedFromCause(cause)
        return suspension === undefined ? Effect.failCause(cause) : Effect.succeed(suspendedOutcome(suspension))
      }),
    )
  },
)
