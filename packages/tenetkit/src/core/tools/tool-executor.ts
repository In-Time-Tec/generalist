import { Context, Effect, Layer, Option, Schema, Stream } from "effect"
import { AiError, Response, Tool, Toolkit } from "effect/unstable/ai"
import type { AgentToolToolkit } from "../agent/agent-tool.js"
import { ToolContext } from "./tool-context.js"
import type { Route, RouteInput } from "./tool-placement.js"
import { client, mcp, remote, route, sandbox } from "./tool-executor-routes.js"
export { client, mcp, remote, route, sandbox }
import { toolResultCodec } from "./tool-result-codec.js"
import { executeWithClosedSet, executeWithClosedToolkit } from "./tool-closed-execution.js"
import type { SchemaTool, ToolSchemaServices } from "./tool-result-codec.js"
/** @experimental */
export interface Request {
  readonly call: Response.ToolCallPart<string, unknown>
  readonly toolCallBatch: {
    readonly calls: ReadonlyArray<Response.ToolCallPart<string, unknown>>
  }
  readonly turn: number
  readonly toolCallIndex: number
  readonly agentName: string
  readonly sessionId: string
}
/** @experimental */
export interface Success {
  readonly _tag: "Success"
  readonly result: unknown
  readonly encodedResult: unknown
}
/** @experimental */
export interface DomainFailure {
  readonly _tag: "DomainFailure"
  readonly failure: unknown
  readonly encodedFailure: unknown
}
/** @experimental */
export interface Suspend {
  readonly _tag: "Suspend"
  readonly token: string
}
/** @experimental */
export type Outcome = Success | DomainFailure | Suspend
/** @experimental How the Runtime may re-enter one concrete ToolExecutor request after recovery. */
export type ReplayPolicy = "never" | "provider-idempotent"
/** @experimental */
export const FrameworkStage = Schema.Literals([
  "decode-input",
  "handler",
  "encode-success",
  "encode-domain-failure",
  "missing-handler",
  "route",
  "placement",
  "authorization",
])
/** @experimental */
export type FrameworkStage = typeof FrameworkStage.Type
/** @experimental */
export class FrameworkFailure extends Schema.TaggedError<FrameworkFailure>()("tenetkit/core/FrameworkFailure", {
  stage: FrameworkStage,
  tool: Schema.String,
  message: Schema.String,
}) {}
/** @experimental An idempotent remote route supplied an invalid or unstable operation key or retry bound. */
export class RemoteRetryMisconfigured extends Schema.TaggedError<RemoteRetryMisconfigured>()(
  "tenetkit/core/RemoteRetryMisconfigured",
  {
    reason: Schema.Literals(["invalid-max-retries", "missing-operation-key", "changed-operation-key"]),
    message: Schema.String,
  },
) {}
/** @experimental */
export interface Interface<R = ToolContext> {
  readonly replayPolicy?: ((request: Request) => ReplayPolicy) | undefined
  readonly execute: (request: Request) => Effect.Effect<Outcome, FrameworkFailure | RemoteRetryMisconfigured, R>
}

/** @experimental */
export class ToolExecutor extends Context.Service<ToolExecutor, Interface<ToolContext>>()(
  "tenetkit/core/tools/tool-executor/ToolExecutor",
) {}
/** @experimental */
export type ToolkitInput<Tools extends Record<string, Tool.Any>> = Toolkit.Toolkit<Tools> | Toolkit.WithHandler<Tools>

/** @experimental A schema-backed tool set with a closed name-based invocation. */
export interface ClosedToolSet<R = unknown, T extends SchemaTool = SchemaTool> {
  readonly tools: Readonly<Record<string, T>>
  readonly invoke: (name: string, params: unknown) => Effect.Effect<unknown, unknown, R>
}

type ResolvedTool<T extends Tool.Any & SchemaTool> = {
  readonly tool: T
  invoke(
    params: unknown,
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

const isRequest = (value: unknown): value is Request =>
  typeof value === "object" && value !== null && "call" in value && "toolCallBatch" in value
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
    error: unknown,
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
            toolResultCodec.frameworkFailure("handler", tool.name, "Tool handler did not produce a final result"),
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
  )
}

/** @experimental */
export function executeToolkit<R, T extends SchemaTool>(
  toolkit: ClosedToolSet<R, T>,
  request: Request,
): Effect.Effect<Outcome, FrameworkFailure, R | ToolContext | ToolSchemaServices<T>>
export function executeToolkit<Name extends string, Parameters extends Schema.Top, SuccessSchema extends Schema.Top, R>(
  toolkit: AgentToolToolkit<Name, Parameters, SuccessSchema, R>,
  request: Request,
): Effect.Effect<Outcome, FrameworkFailure, R | ToolContext>
export function executeToolkit<Tools extends Record<string, Tool.Any>>(
  toolkit: Toolkit.WithHandler<Tools>,
  request: Request,
): Effect.Effect<Outcome, FrameworkFailure, Tool.HandlerServices<Tools[keyof Tools]>>
export function executeToolkit<Tools extends Record<string, Tool.Any>>(
  toolkit: Toolkit.Toolkit<Tools>,
  request: Request,
): Effect.Effect<Outcome, FrameworkFailure, Tool.HandlersFor<Tools> | Tool.HandlerServices<Tools[keyof Tools]>>
export function executeToolkit(
  request: Request,
): (<Name extends string, Parameters extends Schema.Top, SuccessSchema extends Schema.Top, R>(
  toolkit: AgentToolToolkit<Name, Parameters, SuccessSchema, R>,
) => Effect.Effect<Outcome, FrameworkFailure, R | ToolContext>) &
  (<Tools extends Record<string, Tool.Any>>(
    toolkit: Toolkit.WithHandler<Tools>,
  ) => Effect.Effect<Outcome, FrameworkFailure, Tool.HandlerServices<Tools[keyof Tools]>>) &
  (<Tools extends Record<string, Tool.Any>>(
    toolkit: Toolkit.Toolkit<Tools>,
  ) => Effect.Effect<Outcome, FrameworkFailure, Tool.HandlersFor<Tools> | Tool.HandlerServices<Tools[keyof Tools]>>)
export function executeToolkit<
  Tools extends Record<string, Tool.Any>,
  Name extends string,
  Parameters extends Schema.Top,
  SuccessSchema extends Schema.Top,
  R,
  T extends SchemaTool = SchemaTool,
>(
  toolkitOrRequest:
    | ToolkitInput<Tools>
    | AgentToolToolkit<Name, Parameters, SuccessSchema, R>
    | ClosedToolSet<R, T>
    | Request,
  request?: Request,
): unknown {
  if (request === undefined) {
    if (!isRequest(toolkitOrRequest)) return () => Effect.die("executeToolkit pipeable form requires a Request")
    const pipeableRequest = toolkitOrRequest
    function pipeable<T extends SchemaTool = SchemaTool>(
      toolkit: ToolkitInput<Tools> | AgentToolToolkit<Name, Parameters, SuccessSchema, R> | ClosedToolSet<R, T>,
    ): unknown
    function pipeable<Name extends string, Parameters extends Schema.Top, SuccessSchema extends Schema.Top, R>(
      toolkit: AgentToolToolkit<Name, Parameters, SuccessSchema, R>,
    ): Effect.Effect<Outcome, FrameworkFailure, R | ToolContext>
    function pipeable<CurrentTools extends Record<string, Tool.Any>>(
      toolkit: Toolkit.WithHandler<CurrentTools>,
    ): Effect.Effect<Outcome, FrameworkFailure, Tool.HandlerServices<CurrentTools[keyof CurrentTools]>>
    function pipeable<CurrentTools extends Record<string, Tool.Any>>(
      toolkit: Toolkit.Toolkit<CurrentTools>,
    ): Effect.Effect<
      Outcome,
      FrameworkFailure,
      Tool.HandlersFor<CurrentTools> | Tool.HandlerServices<CurrentTools[keyof CurrentTools]>
    >
    function pipeable<CurrentTools extends Record<string, Tool.Any>>(
      toolkit: ToolkitInput<CurrentTools>,
    ): Effect.Effect<
      Outcome,
      FrameworkFailure,
      Tool.HandlersFor<CurrentTools> | Tool.HandlerServices<CurrentTools[keyof CurrentTools]>
    >
    function pipeable(
      toolkit: ToolkitInput<Tools> | AgentToolToolkit<Name, Parameters, SuccessSchema, R> | ClosedToolSet<R, T>,
    ): unknown {
      if ("invoke" in toolkit) {
        return "name" in toolkit
          ? executeWithClosedToolkit<R>(toolkit, pipeableRequest)
          : executeWithClosedSet<R, T>(toolkit, pipeableRequest)
      }
      if ("handle" in toolkit) return executeWithToolkit(toolkit, pipeableRequest)
      const unhandled: Toolkit.Toolkit<Tools> = toolkit
      return executeToolkit(unhandled, pipeableRequest)
    }
    return pipeable
  }
  if (isRequest(toolkitOrRequest)) return Effect.die("executeToolkit requires a toolkit when a Request is supplied")
  const toolkit = toolkitOrRequest
  if ("invoke" in toolkit) {
    return "name" in toolkit
      ? executeWithClosedToolkit<R>(toolkit, request)
      : executeWithClosedSet<R, T>(toolkit, request)
  }
  if ("handle" in toolkit) return executeWithToolkit(toolkit, request)
  const unhandled: Toolkit.Toolkit<Tools> = toolkit
  return Effect.flatMap(unhandled, (handled) => executeWithToolkit(handled, request))
}

const layerClosedAgentToolkit = <
  Name extends string,
  Parameters extends Schema.Top,
  SuccessSchema extends Schema.Top,
  R,
>(
  toolkit: AgentToolToolkit<Name, Parameters, SuccessSchema, R>,
): Layer.Layer<ToolExecutor, never, R> =>
  Layer.effect(
    ToolExecutor,
    Effect.contextWith((context: Context.Context<R>) =>
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

/** @experimental */
export function layerToolkit<Name extends string, Parameters extends Schema.Top, SuccessSchema extends Schema.Top, R>(
  toolkit: AgentToolToolkit<Name, Parameters, SuccessSchema, R>,
): Layer.Layer<ToolExecutor, never, R>
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
  Tool.HandlersFor<Tools> | Tool.HandlerServices<Tools[keyof Tools]> | R | ToolSchemaServices<T>
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

/** @experimental */
export function routeToolkit<Name extends string, Parameters extends Schema.Top, SuccessSchema extends Schema.Top, R>(
  toolkit: AgentToolToolkit<Name, Parameters, SuccessSchema, R>,
): Route<R | ToolContext>
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
> {
  if ("invoke" in toolkit) {
    return route({
      tools: Object.keys(toolkit.tools),
      execute: (request) =>
        "name" in toolkit ? executeWithClosedToolkit(toolkit, request) : executeWithClosedSet(toolkit, request),
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

/** @experimental */
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
        }),
      ),
    ),
  )
}

/** @experimental */
export const layerTest = (implementation: Interface): Layer.Layer<ToolExecutor> =>
  Layer.succeed(ToolExecutor, ToolExecutor.of(implementation))
