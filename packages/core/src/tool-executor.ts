import { Context, Effect, Layer, Option, Schedule, Schema, Sink, Stream } from "effect"
import { AiError, Response, Tool, Toolkit } from "effect/unstable/ai"
import { AgentError } from "./agent-event.js"
import { ToolContext } from "./tool-context.js"
/** @experimental */
export interface Request {
  readonly call: Response.ToolCallPart<string, unknown>
  readonly turn: number
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

/** @experimental A retry-safe remote route supplied an invalid or unstable operation key or retry bound. */
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

/** @experimental */
export interface Route {
  readonly tools: ReadonlyArray<string>
  readonly matches: (request: Request) => boolean
  readonly execute: Interface["execute"]
}

/** @experimental */
export interface RouteOptions {
  readonly tools?: ReadonlyArray<string> | undefined
  readonly matches?: ((request: Request) => boolean) | undefined
  readonly execute: Interface["execute"]
}

/** @experimental */
export type RouteInput<R = never> = Route | Effect.Effect<Route, never, R>

/** @experimental */
export type Placement = "client" | "remote" | "mcp" | "sandbox"

/** @experimental */
export interface PlacementRequest extends Request {
  readonly placement: Placement
  readonly tool: Tool.Any
}

/** @experimental A retry-safe remote placement request carrying its endpoint deduplication key. */
export interface RemotePlacementRequest extends PlacementRequest {
  readonly operationKey: string
}

/** @experimental */
export type PlacementResponse =
  | { readonly _tag: "Success"; readonly result: unknown }
  | { readonly _tag: "DomainFailure"; readonly failure: unknown }
  | { readonly _tag: "Suspend"; readonly token: string }

type PlacementSchemaServices<Tools extends Record<string, Tool.Any>> =
  | Tool.ParametersSchema<Tools[keyof Tools]>["DecodingServices"]
  | Tool.ResultEncodingServices<Tools[keyof Tools]>

type PlacementToolkit<Tools extends Record<string, Tool.Any>> = [PlacementSchemaServices<Tools>] extends [never]
  ? ToolkitInput<Tools>
  : never

/** @experimental */
export interface PlacementRouteOptions<Tools extends Record<string, Tool.Any>, E = FrameworkFailure> {
  readonly toolkit: PlacementToolkit<Tools>
  readonly tools?: ReadonlyArray<string> | undefined
  readonly execute: (request: PlacementRequest) => Effect.Effect<PlacementResponse, E, ToolContext>
}

/** @experimental */
export interface RemoteRouteUnsafeOptions<Tools extends Record<string, Tool.Any>, E = FrameworkFailure>
  extends PlacementRouteOptions<Tools, E> {
  readonly retrySafe?: false | undefined
  readonly schedule?: Schedule.Schedule<unknown, unknown> | undefined
}

/** @experimental Retry-safe remote route whose endpoint deduplicates the stable operation key. */
export interface RemoteRouteRetrySafeOptions<Tools extends Record<string, Tool.Any>, E> {
  readonly toolkit: PlacementToolkit<Tools>
  readonly tools?: ReadonlyArray<string> | undefined
  readonly retrySafe: true
  readonly operationKey: (request: PlacementRequest) => string
  readonly maxRetries: number
  readonly schedule: Schedule.Schedule<unknown, E>
  readonly execute: (request: RemotePlacementRequest) => Effect.Effect<PlacementResponse, E, ToolContext>
}

/** @experimental */
export type RemoteRouteOptions<Tools extends Record<string, Tool.Any>, E = FrameworkFailure> =
  | RemoteRouteUnsafeOptions<Tools, E>
  | RemoteRouteRetrySafeOptions<Tools, E>
const resultMessage = (result: unknown): string => {
  if (typeof result === "string") return result
  if (result instanceof Error) return `${result.name}: ${result.message}`
  try {
    const message = JSON.stringify(result)
    return message === undefined ? String(result) : message
  } catch {
    return String(result)
  }
}

const schemaMessage = (error: unknown): string =>
  error instanceof Error ? error.message : typeof error === "string" ? error : resultMessage(error)

const frameworkFailure = (stage: FrameworkStage, tool: string, error: unknown): FrameworkFailure =>
  FrameworkFailure.make({ stage, tool, message: schemaMessage(error) })

const encodeSuccess = (tool: Tool.Any, result: unknown): Effect.Effect<Success, FrameworkFailure> => {
  const schema = tool.successSchema as unknown as Schema.ConstraintCodec<unknown, unknown, never, never>
  return Schema.encodeUnknownEffect(schema)(result).pipe(
    Effect.map((encodedResult): Success => ({ _tag: "Success", result, encodedResult })),
    Effect.mapError((error) => frameworkFailure("encode-success", tool.name, error)),
  )
}

const encodeDomainFailure = (tool: Tool.Any, failure: unknown): Effect.Effect<DomainFailure, FrameworkFailure> => {
  const schema = tool.failureSchema as unknown as Schema.ConstraintCodec<unknown, unknown, never, never>
  return Schema.encodeUnknownEffect(schema)(failure).pipe(
    Effect.map((encodedFailure): DomainFailure => ({ _tag: "DomainFailure", failure, encodedFailure })),
    Effect.mapError((error) => frameworkFailure("encode-domain-failure", tool.name, error)),
  )
}

const encodeDomainCandidate = (tool: Tool.Any, failure: unknown): Effect.Effect<DomainFailure, FrameworkFailure> =>
  !Schema.is(tool.failureSchema)(failure)
    ? Effect.fail(frameworkFailure("handler", tool.name, failure))
    : encodeDomainFailure(tool, failure)

const decodeInput = (tool: Tool.Any, input: unknown): Effect.Effect<void, FrameworkFailure> => {
  const schema = tool.parametersSchema as unknown as Schema.ConstraintCodec<unknown, unknown, never, never>
  return Schema.decodeUnknownEffect(schema)(input).pipe(
    Effect.asVoid,
    Effect.mapError((error) => frameworkFailure("decode-input", tool.name, error)),
  )
}

const decodeSuccess = (tool: Tool.Any, result: unknown): Effect.Effect<Success, FrameworkFailure> => {
  const schema = tool.successSchema as unknown as Schema.ConstraintCodec<unknown, unknown, never, never>
  return Schema.decodeUnknownEffect(schema)(result).pipe(
    Effect.mapError((error) => frameworkFailure("encode-success", tool.name, error)),
    Effect.flatMap((decoded) => encodeSuccess(tool, decoded)),
  )
}

const aiFrameworkFailure = (tool: Tool.Any, error: AiError.AiError): FrameworkFailure => {
  switch (error.reason._tag) {
    case "ToolParameterValidationError":
      return frameworkFailure("decode-input", tool.name, error)
    case "ToolNotFoundError":
      return frameworkFailure("missing-handler", tool.name, error)
    case "InvalidToolResultError":
      return frameworkFailure("handler", tool.name, error)
    case "ToolResultEncodingError": {
      if (tool.failureMode === "error") return frameworkFailure("encode-success", tool.name, error)
      const isSuccess = Schema.isSchema(tool.successSchema) && Schema.is(tool.successSchema)(error.reason.toolResult)
      const isDomainFailure =
        Schema.isSchema(tool.failureSchema) && Schema.is(tool.failureSchema)(error.reason.toolResult)
      return frameworkFailure(
        isSuccess === isDomainFailure ? "handler" : isDomainFailure ? "encode-domain-failure" : "encode-success",
        tool.name,
        error,
      )
    }
    default:
      return frameworkFailure("handler", tool.name, error)
  }
}

const placementOutcome = (
  placement: Placement,
  tool: Tool.Any,
  response: unknown,
): Effect.Effect<Outcome, FrameworkFailure> => {
  if (typeof response !== "object" || response === null || !("_tag" in response)) {
    return Effect.fail(frameworkFailure("placement", tool.name, "Placement returned an invalid response"))
  }
  switch (response._tag) {
    case "DomainFailure":
      return "failure" in response
        ? encodeDomainFailure(tool, response.failure)
        : Effect.fail(frameworkFailure("placement", tool.name, "DomainFailure response is missing failure"))
    case "Suspend":
      return "token" in response && typeof response.token === "string"
        ? Effect.succeed({ _tag: "Suspend", token: response.token })
        : Effect.fail(frameworkFailure("placement", tool.name, "Suspend response is missing a string token"))
    case "Success":
      return "result" in response
        ? decodeSuccess(tool, response.result).pipe(
            Effect.mapError((error) =>
              FrameworkFailure.make({ ...error, message: `${placement} result: ${error.message}` }),
            ),
          )
        : Effect.fail(frameworkFailure("placement", tool.name, "Success response is missing result"))
    default:
      return Effect.fail(frameworkFailure("placement", tool.name, "Placement returned an unknown response tag"))
  }
}

const findTool = <Tools extends Record<string, Tool.Any>>(tools: Tools, name: string): Tools[keyof Tools] | undefined =>
  tools[name as keyof Tools]

const executeWithToolkit = <Tools extends Record<string, Tool.Any>>(
  toolkit: Toolkit.WithHandler<Tools>,
  request: Request,
): Effect.Effect<Outcome, FrameworkFailure, Tool.HandlerServices<Tools[keyof Tools]>> => {
  const tool = findTool(toolkit.tools, request.call.name)
  if (tool === undefined) {
    return Effect.fail(
      frameworkFailure("missing-handler", request.call.name, `Tool ${request.call.name} is not registered`),
    )
  }
  const handleFailure = (error: unknown): Effect.Effect<Outcome, FrameworkFailure> => {
    if (Schema.is(FrameworkFailure)(error)) return Effect.fail(error)
    if (AiError.isAiError(error)) return Effect.fail(aiFrameworkFailure(tool, error))
    return encodeDomainCandidate(tool, error)
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
        return Effect.fail(frameworkFailure("handler", tool.name, "Tool handler did not produce a final result"))
      }
      const result = option.value
      if (!result.isFailure) {
        return Effect.succeed({ _tag: "Success", result: result.result, encodedResult: result.encodedResult })
      }
      return AiError.isAiError(result.result)
        ? Effect.fail(aiFrameworkFailure(tool, result.result))
        : encodeDomainFailure(tool, result.result)
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
          frameworkFailure("missing-handler", request.call.name, `Tool ${request.call.name} is not registered`),
        )
      }
      return decodeInput(tool, request.call.params).pipe(
        Effect.flatMap(() => {
          const effect = options.execute({ ...request, placement, tool })
          return effect
        }),
        Effect.mapError((error) =>
          Schema.is(FrameworkFailure)(error) || Schema.is(RemoteRetryError)(error)
            ? error
            : frameworkFailure("placement", request.call.name, error),
        ),
        Effect.flatMap((response) => placementOutcome(placement, tool, response)),
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
  options: RemoteRouteRetrySafeOptions<Tools, E>,
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
  options.retrySafe === true
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
                  frameworkFailure("route", request.call.name, `Tool ${request.call.name} has no matching route`),
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
