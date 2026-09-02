import { Context, Effect, Function, Layer, Option, Schema, Stream } from "effect"
import { AiError, Tool, Toolkit } from "effect/unstable/ai"
import type { AgentToolToolkit } from "../agent/tool.js"
import { ToolContext } from "./tool-context.js"
import type { Route, RouteInput } from "./tool-placement.js"
import { client, mcp, remote, route, sandbox } from "./tool-executor-routes.js"
export { client, mcp, remote, route, sandbox }
import {
  CancellationFailure,
  type CancellationOutcome,
  type CancellationRequest,
} from "./tool-executor-cancellation.js"
export { CancellationFailure }
export type { CancellationOutcome, CancellationRequest, TerminalOutcome } from "./tool-executor-cancellation.js"
import {
  FrameworkFailure,
  FrameworkStage,
  Outcome,
  RemoteRetryMisconfigured,
  toolResultCodec,
  type ClosedToolSet,
  type DomainFailure,
  type ReplayPolicy,
  type Request,
  type SchemaTool,
  type Success,
  type Suspend,
  type ToolSchemaServices,
  type ToolkitInput,
} from "./tool-result-codec.js"
export { FrameworkFailure, FrameworkStage, Outcome, RemoteRetryMisconfigured }
export type { ClosedToolSet, DomainFailure, ReplayPolicy, Request, Success, Suspend, ToolkitInput }
import { executeWithClosedSet, executeWithClosedToolkit } from "./tool-closed-execution.js"
import type { HookFailed } from "../../hooks/index.js"
import type { DriverError, DriverStateInvalid } from "../durable/service.js"
import { suspendedFromCause, suspendedOutcome } from "../agent/tools/wake-event.js"

export type SettledOutcome = Success | DomainFailure

type AgentToolSchemaServices<Parameters extends Schema.Top, SuccessSchema extends Schema.Top> =
  | Parameters["DecodingServices"]
  | Parameters["EncodingServices"]
  | SuccessSchema["DecodingServices"]
  | SuccessSchema["EncodingServices"]
export interface Service<R = ToolContext> {
  readonly replayPolicy?: ((request: Request) => ReplayPolicy) | undefined
  readonly cancellable?: ((request: Request) => boolean) | undefined
  readonly execute: (
    request: Request,
  ) => Effect.Effect<
    Outcome,
    FrameworkFailure | RemoteRetryMisconfigured | HookFailed | DriverError | DriverStateInvalid,
    R
  >
  readonly transformResolved?:
    | ((
        request: Request,
        outcome: SettledOutcome,
      ) => Effect.Effect<
        SettledOutcome,
        FrameworkFailure | RemoteRetryMisconfigured | HookFailed | DriverError | DriverStateInvalid,
        R
      >)
    | undefined
  readonly cancel?:
    | ((request: CancellationRequest) => Effect.Effect<CancellationOutcome, CancellationFailure, R>)
    | undefined
}
export class ToolExecutor extends Context.Service<ToolExecutor, Service<ToolContext>>()(
  "generalist/core/tools/tool-executor/ToolExecutor",
) {}
type ResolvedTool<T extends Tool.Any & SchemaTool> = {
  readonly tool: T
  invoke(
    params: T["parametersSchema"]["Type"],
  ): Effect.Effect<Stream.Stream<Tool.HandlerResult<T>, Tool.HandlerError<T>, Tool.HandlerServices<T>>, AiError.AiError>
}

const registerResolvedTool = <Tools extends Record<string, Tool.Any>, Name extends Extract<keyof Tools, string>>(
  toolkit: Toolkit.WithHandler<Tools>,
  name: Name,
  tool: Tools[Name],
): ResolvedTool<Tools[Name]> => ({
  tool,
  invoke(params: Tool.Parameters<Tools[Name]>) {
    return toolkit.handle(name, params)
  },
})
const hasTool = <Tools extends Record<string, Tool.Any>, Name extends string>(
  tools: Tools,
  name: Name,
): name is Name & Extract<keyof Tools, string> => Object.hasOwn(tools, name)

const resolveTools = <Tools extends Record<string, Tool.Any>>(
  toolkit: Toolkit.WithHandler<Tools>,
): ReadonlyMap<string, ResolvedTool<Tools[keyof Tools] & SchemaTool>> => {
  const resolved = new Map<string, ResolvedTool<Tools[keyof Tools] & SchemaTool>>()
  for (const name of Object.keys(toolkit.tools)) {
    if (!hasTool(toolkit.tools, name)) continue
    const tool = toolkit.tools[name]
    if (tool === undefined) continue
    resolved.set(name, registerResolvedTool(toolkit, name, tool))
  }
  return resolved
}
const executeWithToolkit = <Tools extends Record<string, Tool.Any>>(
  toolkit: Toolkit.WithHandler<Tools>,
  request: Request,
): Effect.Effect<
  Outcome,
  FrameworkFailure,
  Tool.HandlerServices<Tools[keyof Tools]> | ToolSchemaServices<Tools[keyof Tools] & SchemaTool>
> => {
  const resolved = resolveTools(toolkit).get(request.call.name)
  if (resolved === undefined) {
    return Effect.fail(
      toolResultCodec.frameworkFailure(
        "missing-handler",
        request.call.name,
        `Tool ${request.call.name} is not registered`,
      ),
    )
  }
  const { tool } = resolved
  type ResolvedSchemaTool = typeof tool
  const handleFailure = (
    error: Tool.HandlerError<ResolvedSchemaTool> | AiError.AiError | FrameworkFailure,
  ): Effect.Effect<Outcome, FrameworkFailure, ResolvedSchemaTool["failureSchema"]["EncodingServices"]> => {
    if (Schema.is(FrameworkFailure)(error)) return Effect.fail(error)
    if (AiError.isAiError(error)) return Effect.fail(toolResultCodec.aiFrameworkFailure(tool, error))
    return toolResultCodec.encodeDomainCandidate<ResolvedSchemaTool["failureSchema"]>(tool, error)
  }
  return resolved.invoke(request.call.params).pipe(
    Effect.flatMap((results) =>
      results.pipe(
        Stream.filter((item) => item.preliminary === false),
        Stream.runLast,
      ),
    ),
    Effect.flatMap(
      (option): Effect.Effect<Outcome, FrameworkFailure, ResolvedSchemaTool["successSchema"]["EncodingServices"]> => {
        if (Option.isNone(option)) {
          return Effect.fail(
            toolResultCodec.frameworkFailure(
              "handler",
              request.call.name,
              "Tool handler did not produce a final result",
            ),
          )
        }
        const result = option.value
        if (!result.isFailure) {
          return Effect.succeed({ _tag: "Success", result: result.result, encodedResult: result.encodedResult })
        }
        return AiError.isAiError(result.result)
          ? Effect.fail(toolResultCodec.aiFrameworkFailure(tool, result.result))
          : toolResultCodec.encodeDomainFailure<ResolvedSchemaTool["failureSchema"]>(tool, result.result)
      },
    ),
    Effect.catchIf(() => true, handleFailure, handleFailure),
    Effect.catchCause((cause) => {
      const suspension = suspendedFromCause(cause)
      return suspension === undefined ? Effect.failCause(cause) : Effect.succeed(suspendedOutcome(suspension))
    }),
  )
}

function executeToolkitUncurried<R, T extends SchemaTool>(
  toolkit: ClosedToolSet<R, T>,
  request: Request,
): Effect.Effect<Outcome, FrameworkFailure, R | ToolContext | ToolSchemaServices<T>>
function executeToolkitUncurried<
  Name extends string,
  Parameters extends Schema.Top,
  SuccessSchema extends Schema.Top,
  R,
>(
  toolkit: AgentToolToolkit<Name, Parameters, SuccessSchema, R>,
  request: Request,
): Effect.Effect<
  Outcome,
  FrameworkFailure | HookFailed | DriverError | DriverStateInvalid,
  R | ToolContext | AgentToolSchemaServices<Parameters, SuccessSchema>
>
function executeToolkitUncurried<Tools extends Record<string, Tool.Any>>(
  toolkit: Toolkit.WithHandler<Tools>,
  request: Request,
): Effect.Effect<Outcome, FrameworkFailure, Tool.HandlerServices<Tools[keyof Tools]>>
function executeToolkitUncurried<Tools extends Record<string, Tool.Any>>(
  toolkit: Toolkit.Toolkit<Tools>,
  request: Request,
): Effect.Effect<Outcome, FrameworkFailure, Tool.HandlersFor<Tools> | Tool.HandlerServices<Tools[keyof Tools]>>
function executeToolkitUncurried<
  Tools extends Record<string, Tool.Any>,
  Name extends string,
  Parameters extends Schema.Top,
  SuccessSchema extends Schema.Top,
  R,
  T extends SchemaTool = SchemaTool,
>(
  toolkit: ToolkitInput<Tools> | AgentToolToolkit<Name, Parameters, SuccessSchema, R> | ClosedToolSet<R, T>,
  request: Request,
) {
  if ("invoke" in toolkit) {
    return "name" in toolkit ? executeWithClosedToolkit(toolkit, request) : executeWithClosedSet(toolkit, request)
  }
  if ("handle" in toolkit) return executeWithToolkit(toolkit, request)
  const unhandled: Toolkit.Toolkit<Tools> = toolkit
  return Effect.flatMap(unhandled, (handled) => executeWithToolkit(handled, request))
}
export const executeToolkit: typeof executeToolkitUncurried & {
  <R, T extends SchemaTool>(
    request: Request,
  ): (toolkit: ClosedToolSet<R, T>) => Effect.Effect<Outcome, FrameworkFailure, R | ToolContext | ToolSchemaServices<T>>
  <Name extends string, Parameters extends Schema.Top, SuccessSchema extends Schema.Top, R>(
    request: Request,
  ): (
    toolkit: AgentToolToolkit<Name, Parameters, SuccessSchema, R>,
  ) => Effect.Effect<
    Outcome,
    FrameworkFailure | HookFailed | DriverError | DriverStateInvalid,
    R | ToolContext | AgentToolSchemaServices<Parameters, SuccessSchema>
  >
  <Tools extends Record<string, Tool.Any>>(
    request: Request,
  ): (
    toolkit: Toolkit.WithHandler<Tools>,
  ) => Effect.Effect<Outcome, FrameworkFailure, Tool.HandlerServices<Tools[keyof Tools]>>
  <Tools extends Record<string, Tool.Any>>(
    request: Request,
  ): (
    toolkit: Toolkit.Toolkit<Tools>,
  ) => Effect.Effect<Outcome, FrameworkFailure, Tool.HandlersFor<Tools> | Tool.HandlerServices<Tools[keyof Tools]>>
} = Function.dual(2, executeToolkitUncurried)

const layerClosedAgentToolkit = <
  Name extends string,
  Parameters extends Schema.Top,
  SuccessSchema extends Schema.Top,
  R,
>(
  toolkit: AgentToolToolkit<Name, Parameters, SuccessSchema, R>,
): Layer.Layer<ToolExecutor, never, R | AgentToolSchemaServices<Parameters, SuccessSchema>> =>
  Layer.effect(
    ToolExecutor,
    Effect.contextWith((context: Context.Context<R | AgentToolSchemaServices<Parameters, SuccessSchema>>) =>
      Effect.succeed(
        ToolExecutor.of({
          execute: (request) => executeWithClosedToolkit(toolkit, request).pipe(Effect.provideContext(context)),
        }),
      ),
    ),
  )

const layerClosedToolSet = <R, T extends SchemaTool>(
  toolkit: ClosedToolSet<R, T>,
): Layer.Layer<ToolExecutor, never, R | ToolSchemaServices<T>> =>
  Layer.effect(
    ToolExecutor,
    Effect.contextWith((context: Context.Context<R | ToolSchemaServices<T>>) =>
      Effect.succeed(
        ToolExecutor.of({
          execute: (request) => executeWithClosedSet(toolkit, request).pipe(Effect.provideContext(context)),
        }),
      ),
    ),
  )
export function layerToolkit<Name extends string, Parameters extends Schema.Top, SuccessSchema extends Schema.Top, R>(
  toolkit: AgentToolToolkit<Name, Parameters, SuccessSchema, R>,
): Layer.Layer<ToolExecutor, never, R | AgentToolSchemaServices<Parameters, SuccessSchema>>
export function layerToolkit<R>(toolkit: ClosedToolSet<R, Tool.Any>): Layer.Layer<ToolExecutor, never, R>
export function layerToolkit<R, T extends SchemaTool>(
  toolkit: ClosedToolSet<R, T>,
): Layer.Layer<ToolExecutor, never, R | ToolSchemaServices<T>>
export function layerToolkit<Tools extends Record<string, Tool.Any>>(
  toolkit: Toolkit.WithHandler<Tools>,
): Layer.Layer<ToolExecutor>
export function layerToolkit<Tools extends Record<string, Tool.Any>>(
  toolkit: Toolkit.Toolkit<Tools>,
): Layer.Layer<ToolExecutor, never, Tool.HandlersFor<Tools>>
export function layerToolkit<
  Tools extends Record<string, Tool.Any>,
  Name extends string,
  Parameters extends Schema.Top,
  SuccessSchema extends Schema.Top,
  R,
  T extends SchemaTool,
>(
  toolkit: ToolkitInput<Tools> | AgentToolToolkit<Name, Parameters, SuccessSchema, R> | ClosedToolSet<R, T>,
): Layer.Layer<
  ToolExecutor,
  never,
  | Tool.HandlersFor<Tools>
  | Tool.HandlerServices<Tools[keyof Tools]>
  | R
  | ToolSchemaServices<T>
  | AgentToolSchemaServices<Parameters, SuccessSchema>
> {
  if ("invoke" in toolkit) return "name" in toolkit ? layerClosedAgentToolkit(toolkit) : layerClosedToolSet(toolkit)
  if ("handle" in toolkit) {
    return Layer.effect(
      ToolExecutor,
      Effect.contextWith(
        (
          context: Context.Context<
            Tool.HandlerServices<Tools[keyof Tools]> | ToolSchemaServices<Tools[keyof Tools] & SchemaTool>
          >,
        ) =>
          Effect.succeed(
            ToolExecutor.of({
              execute: (request) => executeWithToolkit(toolkit, request).pipe(Effect.provideContext(context)),
            }),
          ),
      ),
    )
  }
  return Layer.effect(
    ToolExecutor,
    Effect.contextWith(
      (
        context: Context.Context<
          | Tool.HandlersFor<Tools>
          | Tool.HandlerServices<Tools[keyof Tools]>
          | ToolSchemaServices<Tools[keyof Tools] & SchemaTool>
        >,
      ) =>
        Effect.map(toolkit, (handled) =>
          ToolExecutor.of({
            execute: (request) => executeWithToolkit(handled, request).pipe(Effect.provideContext(context)),
          }),
        ),
    ),
  )
}
export function routeToolkit<Name extends string, Parameters extends Schema.Top, SuccessSchema extends Schema.Top, R>(
  toolkit: AgentToolToolkit<Name, Parameters, SuccessSchema, R>,
): Route<R | ToolContext | AgentToolSchemaServices<Parameters, SuccessSchema>>
export function routeToolkit<R, T extends SchemaTool>(
  toolkit: ClosedToolSet<R, T>,
): RouteInput<R | ToolContext | ToolSchemaServices<T>>
export function routeToolkit<Tools extends Record<string, Tool.Any>>(toolkit: Toolkit.WithHandler<Tools>): Route
export function routeToolkit<Tools extends Record<string, Tool.Any>>(
  toolkit: Toolkit.Toolkit<Tools>,
): Effect.Effect<Route, never, Tool.HandlersFor<Tools>>
export function routeToolkit<
  Tools extends Record<string, Tool.Any>,
  Name extends string,
  Parameters extends Schema.Top,
  SuccessSchema extends Schema.Top,
  R,
  T extends SchemaTool,
>(
  toolkit: ToolkitInput<Tools> | AgentToolToolkit<Name, Parameters, SuccessSchema, R> | ClosedToolSet<R, T>,
): RouteInput<
  | Tool.HandlersFor<Tools>
  | Tool.HandlerServices<Tools[keyof Tools]>
  | ToolSchemaServices<Tools[keyof Tools] & SchemaTool>
  | R
  | ToolContext
  | ToolSchemaServices<T>
  | AgentToolSchemaServices<Parameters, SuccessSchema>
> {
  if ("invoke" in toolkit) {
    const tools = Object.keys(toolkit.tools)
    if ("name" in toolkit) {
      return route({
        tools,
        execute: (request) => executeWithClosedToolkit(toolkit, request),
      })
    }
    return route({
      tools,
      execute: (request) => executeWithClosedSet(toolkit, request),
    })
  }
  const makeRoute = (handled: Toolkit.WithHandler<Tools>) =>
    route({
      tools: Object.keys(handled.tools),
      execute: (request) => executeWithToolkit(handled, request),
    })
  return "handle" in toolkit ? makeRoute(toolkit) : toolkit.pipe(Effect.map(makeRoute))
}

const routeInputEffect = <R>(input: RouteInput<R>): Effect.Effect<Route<R>, never, R> =>
  Effect.isEffect(input) ? input : Effect.succeed(input)

const firstMatchingRoute = <R>(routes: ReadonlyArray<Route<R>>, request: Request): Route<R> | undefined =>
  routes.find((candidate) => candidate.matches(request))
export function layerRouter(routes: Iterable<Route<ToolContext>>): Layer.Layer<ToolExecutor, never, ToolContext>
export function layerRouter<R>(
  routes: Iterable<Route<ToolContext> | Effect.Effect<Route<ToolContext>, never, R>>,
): Layer.Layer<ToolExecutor, never, ToolContext | R>
export function layerRouter<R>(
  routes: Iterable<RouteInput<ToolContext> | RouteInput<R>>,
): Layer.Layer<ToolExecutor, never, ToolContext | R>
export function layerRouter<R1, R2>(
  routes: Iterable<RouteInput<R1> | RouteInput<R2>>,
): Layer.Layer<ToolExecutor, never, R1 | R2>
export function layerRouter<R>(routes: Iterable<RouteInput<R>>): Layer.Layer<ToolExecutor, never, R>
export function layerRouter<R>(routes: Iterable<RouteInput<R>>): Layer.Layer<ToolExecutor, never, R> {
  return Layer.effect(
    ToolExecutor,
    Effect.contextWith((context: Context.Context<R>) =>
      Effect.map(Effect.all(Array.from(routes, routeInputEffect)), (resolved) =>
        ToolExecutor.of({
          replayPolicy: (request) => firstMatchingRoute(resolved, request)?.replayPolicy?.(request) ?? "never",
          cancellable: (request) => firstMatchingRoute(resolved, request)?.cancel !== undefined,
          execute: (request) => {
            const matched = firstMatchingRoute(resolved, request)
            const execution =
              matched === undefined
                ? Effect.fail(
                    toolResultCodec.frameworkFailure(
                      "route",
                      request.call.name,
                      `Tool ${request.call.name} has no matching route`,
                    ),
                  )
                : matched.execute(request)
            return execution.pipe(Effect.provideContext(context))
          },
          cancel: (request) => {
            const matched = firstMatchingRoute(resolved, request.execution)
            return matched?.cancel === undefined
              ? Effect.fail(
                  CancellationFailure.make({
                    tool: request.toolName,
                    message: `Tool ${request.toolName} has no matching cancellation route`,
                  }),
                )
              : matched.cancel(request).pipe(Effect.provideContext(context))
          },
        }),
      ),
    ),
  )
}
export const layerTest = (implementation: Service): Layer.Layer<ToolExecutor> =>
  Layer.succeed(ToolExecutor, ToolExecutor.of(implementation))
