import { Cause, Context, Effect, Layer, Option, Schedule, Schema, Sink, Stream } from "effect"
import { Response, Tool, Toolkit } from "effect/unstable/ai"
import { AgentError, AgentSuspended } from "./agent-event"
import { ToolContext } from "./tool-context"
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
export interface Failure {
  readonly _tag: "Failure"
  readonly message: string
}

/** @experimental */
export interface Suspend {
  readonly _tag: "Suspend"
  readonly token: string
}

/** @experimental */
export type Outcome = Success | Failure | Suspend

/** @experimental */
export interface Interface {
  readonly execute: (request: Request) => Effect.Effect<Outcome, AgentError, ToolContext>
}

/** @experimental */
export class ToolExecutor extends Context.Service<ToolExecutor, Interface>()("@batonfx/core/ToolExecutor") {}

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

/** @experimental */
export type PlacementResponse =
  | { readonly _tag: "Success"; readonly result: unknown }
  | { readonly _tag: "Failure"; readonly message: string }
  | { readonly _tag: "Suspend"; readonly token: string }

/** @experimental */
export interface PlacementRouteOptions<Tools extends Record<string, Tool.Any>> {
  readonly toolkit: Toolkit.Toolkit<Tools> | Toolkit.WithHandler<Tools>
  readonly tools?: ReadonlyArray<string> | undefined
  readonly execute: (request: PlacementRequest) => Effect.Effect<PlacementResponse, unknown, ToolContext>
}

/** @experimental */
export interface RemoteRouteOptions<Tools extends Record<string, Tool.Any>> extends PlacementRouteOptions<Tools> {
  readonly schedule?: Schedule.Schedule<unknown, unknown> | undefined
}

const failureMessage = (cause: Cause.Cause<unknown>): string => {
  const error = Cause.squash(cause)
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}

const failureOutcome = (message: string): Outcome => ({ _tag: "Failure", message })

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

const decodeSuccess = (tool: Tool.Any, result: unknown): Effect.Effect<Outcome> => {
  const successSchema = tool.successSchema as unknown as Schema.ConstraintCodec<unknown, unknown, never, never>
  if (!Schema.isSchema(successSchema)) {
    return Effect.succeed({ _tag: "Success", result, encodedResult: result })
  }
  return Schema.decodeUnknownEffect(successSchema)(result).pipe(
    Effect.flatMap((decoded) =>
      Schema.encodeUnknownEffect(successSchema)(decoded).pipe(
        Effect.map((encoded): Success => ({ _tag: "Success", result: decoded, encodedResult: encoded })),
      ),
    ),
    Effect.catchCause((cause) =>
      Effect.succeed(failureOutcome(`invalid client result: ${schemaMessage(Cause.squash(cause))}`)),
    ),
  )
}

const placementOutcome = (
  placement: Placement,
  tool: Tool.Any,
  response: PlacementResponse,
): Effect.Effect<Outcome> => {
  switch (response._tag) {
    case "Failure":
      return Effect.succeed(failureOutcome(response.message))
    case "Suspend":
      return Effect.succeed({ _tag: "Suspend", token: response.token })
    case "Success":
      return decodeSuccess(tool, response.result).pipe(
        Effect.map((outcome) =>
          outcome._tag === "Failure"
            ? failureOutcome(outcome.message.replace("invalid client result", `invalid ${placement} result`))
            : outcome,
        ),
      )
  }
}

const executeWithToolkit = <Tools extends Record<string, Tool.Any>>(
  toolkit: Toolkit.WithHandler<Tools>,
  request: Request,
): Effect.Effect<Outcome> => {
  if (toolkit.tools[request.call.name] === undefined) {
    return Effect.succeed(failureOutcome(`Tool ${request.call.name} is not registered`))
  }
  return toolkit.handle(request.call.name as never, request.call.params as never).pipe(
    Effect.flatMap((results) =>
      (results as Stream.Stream<Tool.HandlerResult<Tool.Any>, unknown>).pipe(
        Stream.filter((item) => item.preliminary === false),
        Stream.run(Sink.last()),
      ),
    ),
    Effect.map(
      Option.match({
        onNone: (): Outcome => failureOutcome("Tool handler did not produce a final result"),
        onSome: (result): Outcome =>
          result.isFailure
            ? failureOutcome(resultMessage(result.result))
            : {
                _tag: "Success",
                result: result.result,
                encodedResult: result.encodedResult,
              },
      }),
    ),
    Effect.catchCause((cause) => {
      if (Cause.hasInterrupts(cause)) return Effect.interrupt
      const error = Cause.squash(cause)
      if (error instanceof AgentSuspended) {
        return Effect.succeed<Outcome>({ _tag: "Suspend", token: error.token })
      }
      return Effect.succeed(failureOutcome(failureMessage(cause)))
    }),
  )
}

/** @experimental */
export function executeToolkit<Tools extends Record<string, Tool.Any>>(
  toolkit: Toolkit.WithHandler<Tools>,
  request: Request,
): Effect.Effect<Outcome>
export function executeToolkit<Tools extends Record<string, Tool.Any>>(
  toolkit: Toolkit.Toolkit<Tools>,
  request: Request,
): Effect.Effect<Outcome, never, Tool.HandlersFor<Tools>>
export function executeToolkit<Tools extends Record<string, Tool.Any>>(
  toolkit: ToolkitInput<Tools>,
  request: Request,
): Effect.Effect<Outcome, never, Tool.HandlersFor<Tools>> {
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

const placementRoute = <Tools extends Record<string, Tool.Any>>(
  placement: Placement,
  options: PlacementRouteOptions<Tools> | RemoteRouteOptions<Tools>,
): Route => {
  const routedTools = options.tools ?? Object.keys(options.toolkit.tools)
  return route({
    tools: routedTools,
    execute: (request) => {
      const tool = options.toolkit.tools[request.call.name]
      if (tool === undefined) return Effect.succeed(failureOutcome(`Tool ${request.call.name} is not registered`))
      const effect = options.execute({ ...request, placement, tool })
      const scheduled =
        "schedule" in options && options.schedule !== undefined ? Effect.retry(effect, options.schedule) : effect
      return scheduled.pipe(
        Effect.flatMap((response) => placementOutcome(placement, tool, response)),
        Effect.catchCause((cause) =>
          Cause.hasInterrupts(cause)
            ? Effect.interrupt
            : Effect.succeed(failureOutcome(`${placement} tool infrastructure failed: ${failureMessage(cause)}`)),
        ),
      )
    },
  })
}

/** @experimental Route tool calls to a user/browser/desktop client. */
export const client = <Tools extends Record<string, Tool.Any>>(options: PlacementRouteOptions<Tools>): Route =>
  placementRoute("client", options)

/** @experimental Route tool calls to a remote tool worker or service. */
export const remote = <Tools extends Record<string, Tool.Any>>(options: RemoteRouteOptions<Tools>): Route =>
  placementRoute("remote", options)

/** @experimental Route tool calls to an MCP placement adapter. */
export const mcp = <Tools extends Record<string, Tool.Any>>(options: PlacementRouteOptions<Tools>): Route =>
  placementRoute("mcp", options)

/** @experimental Route tool calls to a workspace or sandbox runtime. */
export const sandbox = <Tools extends Record<string, Tool.Any>>(options: PlacementRouteOptions<Tools>): Route =>
  placementRoute("sandbox", options)

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
              ? Effect.succeed(failureOutcome(`Tool ${request.call.name} is not registered`))
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
