import { Context, Effect, Layer, Option, Schema, Sink, Stream } from "effect"
import { AiError, Response, Tool, Toolkit } from "effect/unstable/ai"
import { AgentError } from "./agent-event.js"
import { ToolContext } from "./tool-context.js"
import {
  type Placement,
  type PlacementRequest,
  type PlacementResponse,
  type PlacementRouteOptions,
  placementOutcome,
  type RemoteRouteIdempotentOptions,
  type RemoteRouteOptions,
  type Route,
  type RouteInput,
  type RouteOptions,
} from "./tool-placement.js"
import { toolResultCodec } from "./tool-result-codec.js"
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
export class FrameworkFailure extends Schema.TaggedErrorClass<FrameworkFailure>()("@batonfx/core/FrameworkFailure", {
  stage: FrameworkStage,
  tool: Schema.String,
  message: Schema.String,
}) {}

/** @experimental An idempotent remote route supplied an invalid or unstable operation key or retry bound. */
export class RemoteRetryError extends Schema.TaggedErrorClass<RemoteRetryError>()("@batonfx/core/RemoteRetryError", {
  reason: Schema.Literals(["invalid-max-retries", "missing-operation-key", "changed-operation-key"]),
  message: Schema.String,
}) {}

/** @experimental */
export interface Interface {
  readonly execute: (request: Request) => Effect.Effect<Outcome, FrameworkFailure | RemoteRetryError, ToolContext>
}

/** @experimental */
export class ToolExecutor extends Context.Service<ToolExecutor, Interface>()(
  "@batonfx/core/tool-executor/ToolExecutor",
) {}

/** @experimental */
export type ToolkitInput<Tools extends Record<string, Tool.Any>> = Toolkit.Toolkit<Tools> | Toolkit.WithHandler<Tools>

const findTool = <Tools extends Record<string, Tool.Any>>(tools: Tools, name: string): Tools[keyof Tools] | undefined =>
  tools[name as keyof Tools]

const executeWithToolkit = <Tools extends Record<string, Tool.Any>>(
  toolkit: Toolkit.WithHandler<Tools>,
  request: Request,
): Effect.Effect<Outcome, FrameworkFailure, Tool.HandlerServices<Tools[keyof Tools]>> => {
  const tool = findTool(toolkit.tools, request.call.name)
  if (tool === undefined) {
    return Effect.fail(
      toolResultCodec.frameworkFailure(
        "missing-handler",
        request.call.name,
        `Tool ${request.call.name} is not registered`,
      ),
    )
  }
  const handleFailure = (error: unknown): Effect.Effect<Outcome, FrameworkFailure> => {
    if (Schema.is(FrameworkFailure)(error)) return Effect.fail(error)
    if (AiError.isAiError(error)) return Effect.fail(toolResultCodec.aiFrameworkFailure(tool, error))
    return toolResultCodec.encodeDomainCandidate(tool, error)
  }
  return toolkit.handle(request.call.name as keyof Tools, request.call.params as never).pipe(
    Effect.flatMap((results) =>
      results.pipe(
        Stream.filter((item) => item.preliminary === false),
        Stream.run(Sink.last()),
      ),
    ),
    Effect.flatMap((option): Effect.Effect<Outcome, FrameworkFailure> => {
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
        : toolResultCodec.encodeDomainFailure(tool, result.result)
    }),
    Effect.catchIf(() => true, handleFailure, handleFailure),
  )
}

/** @experimental */
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
): (<Tools extends Record<string, Tool.Any>>(
  toolkit: Toolkit.WithHandler<Tools>,
) => Effect.Effect<Outcome, FrameworkFailure, Tool.HandlerServices<Tools[keyof Tools]>>) &
  (<Tools extends Record<string, Tool.Any>>(
    toolkit: Toolkit.Toolkit<Tools>,
  ) => Effect.Effect<Outcome, FrameworkFailure, Tool.HandlersFor<Tools> | Tool.HandlerServices<Tools[keyof Tools]>>)
export function executeToolkit<Tools extends Record<string, Tool.Any>>(
  toolkitOrRequest: ToolkitInput<Tools> | Request,
  request?: Request,
): unknown {
  if (request === undefined) {
    const pipeableRequest = toolkitOrRequest as Request
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
    function pipeable<CurrentTools extends Record<string, Tool.Any>>(
      toolkit: ToolkitInput<CurrentTools>,
    ): Effect.Effect<
      Outcome,
      FrameworkFailure,
      Tool.HandlersFor<CurrentTools> | Tool.HandlerServices<CurrentTools[keyof CurrentTools]>
    > {
      return "handle" in toolkit
        ? executeWithToolkit(toolkit, pipeableRequest)
        : executeToolkit(toolkit, pipeableRequest)
    }
    return pipeable
  }
  const toolkit = toolkitOrRequest as ToolkitInput<Tools>
  return ("handle" in toolkit ? Effect.succeed(toolkit) : toolkit).pipe(
    Effect.flatMap((handled) => executeWithToolkit(handled, request)),
  )
}

/** @experimental */
export function fromToolkit<Tools extends Record<string, Tool.Any>>(
  toolkit: Toolkit.WithHandler<Tools>,
): Layer.Layer<ToolExecutor>
export function fromToolkit<Tools extends Record<string, Tool.Any>>(
  toolkit: Toolkit.Toolkit<Tools>,
): Layer.Layer<ToolExecutor, never, Tool.HandlersFor<Tools>>
export function fromToolkit<Tools extends Record<string, Tool.Any>>(
  toolkit: ToolkitInput<Tools>,
): Layer.Layer<ToolExecutor, never, Tool.HandlersFor<Tools>> {
  return Layer.effect(
    ToolExecutor,
    ("handle" in toolkit ? Effect.succeed(toolkit) : toolkit).pipe(
      Effect.map((handled) =>
        ToolExecutor.of({
          execute: (request) => executeWithToolkit(handled, request),
        }),
      ),
    ),
  )
}

/** @experimental */
export const route = (options: RouteOptions): Route => {
  const routedTools = options.tools ?? []
  return {
    tools: routedTools,
    matches: (request) => routedTools.includes(request.call.name) || options.matches?.(request) === true,
    execute: options.execute,
  }
}

const placementRoute = <Tools extends Record<string, Tool.Any>, E>(
  placement: Placement,
  options: PlacementRouteOptions<Tools, E>,
): Route => {
  const routedTools = options.tools ?? Object.keys(options.toolkit.tools)
  return route({
    tools: routedTools,
    execute: (request) => {
      const tool = findTool(options.toolkit.tools, request.call.name)
      if (tool === undefined) {
        return Effect.fail(
          toolResultCodec.frameworkFailure(
            "missing-handler",
            request.call.name,
            `Tool ${request.call.name} is not registered`,
          ),
        )
      }
      return toolResultCodec.decodeInput(tool, request.call.params).pipe(
        Effect.flatMap(() => {
          const effect = options.execute({ ...request, placement, tool })
          return effect
        }),
        Effect.mapError((error) =>
          Schema.is(FrameworkFailure)(error) || Schema.is(RemoteRetryError)(error)
            ? error
            : toolResultCodec.frameworkFailure("placement", request.call.name, error),
        ),
        Effect.flatMap((response) => placementOutcome.fromResponse(placement, tool, response)),
      )
    },
  })
}

const remoteRetryError = (reason: RemoteRetryError["reason"], message: string): RemoteRetryError =>
  RemoteRetryError.make({ reason, message })

const validateOperationKey = (operationKey: unknown): Effect.Effect<string, RemoteRetryError> =>
  typeof operationKey !== "string" || operationKey.trim().length === 0
    ? Effect.fail(remoteRetryError("missing-operation-key", "Remote retry operation key must be non-empty"))
    : Effect.succeed(operationKey)

const retryRemote = <Tools extends Record<string, Tool.Any>, E>(
  options: RemoteRouteIdempotentOptions<Tools, E>,
  request: PlacementRequest,
): Effect.Effect<PlacementResponse, E | RemoteRetryError, ToolContext> =>
  Effect.suspend(() => {
    if (!Number.isFinite(options.maxRetries) || !Number.isInteger(options.maxRetries) || options.maxRetries < 0) {
      return Effect.fail(
        remoteRetryError("invalid-max-retries", "Remote retry maxRetries must be a non-negative finite integer"),
      )
    }
    const operationKey = typeof options.operationKey === "function" ? options.operationKey(request) : undefined
    return validateOperationKey(operationKey).pipe(
      Effect.flatMap((stableKey) => {
        let attempt = 0
        const executeAttempt: Effect.Effect<PlacementResponse | RemoteRetryError, E, ToolContext> = Effect.suspend(
          () => {
            const currentKey = attempt === 0 ? stableKey : options.operationKey(request)
            attempt += 1
            return validateOperationKey(currentKey).pipe(
              Effect.match({
                onFailure: (error): string | RemoteRetryError => error,
                onSuccess: (validatedKey): string | RemoteRetryError => validatedKey,
              }),
              Effect.flatMap(
                (validatedKey): Effect.Effect<PlacementResponse | RemoteRetryError, E, ToolContext> =>
                  typeof validatedKey !== "string"
                    ? Effect.succeed(validatedKey)
                    : validatedKey === stableKey
                      ? options.execute({ ...request, operationKey: stableKey })
                      : Effect.succeed(
                          remoteRetryError(
                            "changed-operation-key",
                            "Remote retry operation key changed between attempts",
                          ),
                        ),
              ),
            )
          },
        )
        return Effect.retry(executeAttempt, {
          schedule: options.schedule,
          times: options.maxRetries,
          while: (error: E) =>
            !Schema.is(AgentError)(error) && !Schema.is(FrameworkFailure)(error) && !Schema.is(RemoteRetryError)(error),
        }).pipe(
          Effect.flatMap(
            (result): Effect.Effect<PlacementResponse, RemoteRetryError> =>
              Schema.is(RemoteRetryError)(result) ? Effect.fail(result) : Effect.succeed(result),
          ),
        )
      }),
    )
  })

/** @experimental Route tool calls to a user/browser/desktop client. */
export const client = <Tools extends Record<string, Tool.Any>, E = FrameworkFailure>(
  options: PlacementRouteOptions<Tools, E>,
): Route => placementRoute("client", options)

/** @experimental Route tool calls to a remote tool worker or service. */
export const remote = <Tools extends Record<string, Tool.Any>, E = FrameworkFailure>(
  options: RemoteRouteOptions<Tools, E>,
): Route =>
  options.idempotent === true
    ? placementRoute("remote", {
        toolkit: options.toolkit,
        ...(options.tools === undefined ? {} : { tools: options.tools }),
        execute: (request) => retryRemote(options, request),
      })
    : placementRoute("remote", options)

/** @experimental Route tool calls to an MCP placement adapter. */
export const mcp = <Tools extends Record<string, Tool.Any>, E = FrameworkFailure>(
  options: PlacementRouteOptions<Tools, E>,
): Route => placementRoute("mcp", options)

/** @experimental Route tool calls to a workspace or sandbox runtime. */
export const sandbox = <Tools extends Record<string, Tool.Any>, E = FrameworkFailure>(
  options: PlacementRouteOptions<Tools, E>,
): Route => placementRoute("sandbox", options)

/** @experimental */
export function routeToolkit<Tools extends Record<string, Tool.Any>>(toolkit: Toolkit.WithHandler<Tools>): Route
export function routeToolkit<Tools extends Record<string, Tool.Any>>(
  toolkit: Toolkit.Toolkit<Tools>,
): Effect.Effect<Route, never, Tool.HandlersFor<Tools>>
export function routeToolkit<Tools extends Record<string, Tool.Any>>(
  toolkit: ToolkitInput<Tools>,
): RouteInput<Tool.HandlersFor<Tools>> {
  const makeRoute = (handled: Toolkit.WithHandler<Tools>) =>
    route({
      tools: Object.keys(handled.tools),
      execute: (request) => executeWithToolkit(handled, request),
    })
  return "handle" in toolkit ? makeRoute(toolkit) : toolkit.pipe(Effect.map(makeRoute))
}

const routeInputEffect = <R>(input: RouteInput<R>): Effect.Effect<Route, never, R> =>
  Effect.isEffect(input) ? input : Effect.succeed(input)

/** @experimental */
export function router(routes: Iterable<Route>): Layer.Layer<ToolExecutor>
export function router<R>(routes: Iterable<RouteInput<R>>): Layer.Layer<ToolExecutor, never, R>
export function router<R>(routes: Iterable<RouteInput<R>>): Layer.Layer<ToolExecutor, never, R> {
  return Layer.effect(
    ToolExecutor,
    Effect.all(Array.from(routes, routeInputEffect)).pipe(
      Effect.map((resolved) =>
        ToolExecutor.of({
          execute: (request) => {
            const matched = resolved.find((candidate) => candidate.matches(request))
            return matched === undefined
              ? Effect.fail(
                  toolResultCodec.frameworkFailure(
                    "route",
                    request.call.name,
                    `Tool ${request.call.name} has no matching route`,
                  ),
                )
              : matched.execute(request)
          },
        }),
      ),
    ),
  )
}

/** @experimental */
export const testLayer = (implementation: Interface): Layer.Layer<ToolExecutor> =>
  Layer.succeed(ToolExecutor, ToolExecutor.of(implementation))
