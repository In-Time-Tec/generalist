import { Effect, Schema } from "effect"
import { Tool } from "effect/unstable/ai"
import { AgentError } from "../agent/agent-event.js"
import { FrameworkFailure, RemoteRetryMisconfigured, type ReplayPolicy } from "./tool-executor.js"
import {
  type Placement,
  type PlacementRequest,
  type PlacementResponse,
  type PlacementRouteOptions,
  type PlacementSchemaServices,
  placementOutcome,
  type RemoteRouteIdempotentOptions,
  type RemoteRouteOptions,
  type Route,
  type RouteOptions,
} from "./tool-placement.js"
import type { ToolContext } from "./tool-context.js"
import { toolResultCodec } from "./tool-result-codec.js"

/** @experimental */
export function route(options: RouteOptions<ToolContext>): Route<ToolContext>
/** @experimental */
export function route<R>(options: RouteOptions<R>): Route<R>
export function route<R>(options: RouteOptions<R>): Route<R> {
  const routedTools = options.tools ?? []
  return {
    tools: routedTools,
    matches: (request) => routedTools.includes(request.call.name) || options.matches?.(request) === true,
    ...(options.replayPolicy === undefined ? {} : { replayPolicy: options.replayPolicy }),
    execute: options.execute,
  }
}

const placementRoute = <Tools extends Record<string, Tool.Any>, E>(
  placement: Placement,
  options: PlacementRouteOptions<Tools, E>,
  replayPolicy: ReplayPolicy = "never",
): Route<ToolContext | PlacementSchemaServices<Tools>> => {
  const routedTools = options.tools ?? Object.keys(options.toolkit.tools)
  return route<ToolContext | PlacementSchemaServices<Tools>>({
    tools: routedTools,
    replayPolicy: () => replayPolicy,
    execute: (request) => {
      const tool = options.toolkit.tools[request.call.name]
      if (tool === undefined) {
        return Effect.fail(
          FrameworkFailure.make({
            stage: "missing-handler",
            tool: request.call.name,
            message: `Tool ${request.call.name} is not registered`,
          }),
        )
      }
      return toolResultCodec.decodeInput(tool, request.call.params).pipe(
        Effect.flatMap(() => options.execute({ ...request, placement, tool })),
        Effect.mapError((error) =>
          Schema.is(FrameworkFailure)(error) || Schema.is(RemoteRetryMisconfigured)(error)
            ? error
            : toolResultCodec.frameworkFailure("placement", request.call.name, error),
        ),
        Effect.flatMap((response) => placementOutcome.fromResponse(placement, tool, response)),
      )
    },
  })
}

const remoteRetryError = (reason: RemoteRetryMisconfigured["reason"], message: string): RemoteRetryMisconfigured =>
  RemoteRetryMisconfigured.make({ reason, message })

const validateOperationKey = (operationKey: unknown): Effect.Effect<string, RemoteRetryMisconfigured> =>
  typeof operationKey !== "string" || operationKey.trim().length === 0
    ? Effect.fail(remoteRetryError("missing-operation-key", "Remote retry operation key must be non-empty"))
    : Effect.succeed(operationKey)

const retryRemote = <Tools extends Record<string, Tool.Any>, E>(
  options: RemoteRouteIdempotentOptions<Tools, E>,
  request: PlacementRequest,
): Effect.Effect<PlacementResponse, E | RemoteRetryMisconfigured, ToolContext | PlacementSchemaServices<Tools>> =>
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
        const executeAttempt: Effect.Effect<
          PlacementResponse | RemoteRetryMisconfigured,
          E,
          ToolContext | PlacementSchemaServices<Tools>
        > = Effect.suspend(() => {
          const currentKey = attempt === 0 ? stableKey : options.operationKey(request)
          attempt += 1
          return validateOperationKey(currentKey).pipe(
            Effect.match({
              onFailure: (error): string | RemoteRetryMisconfigured => error,
              onSuccess: (validatedKey): string | RemoteRetryMisconfigured => validatedKey,
            }),
            Effect.flatMap(
              (
                validatedKey,
              ): Effect.Effect<
                PlacementResponse | RemoteRetryMisconfigured,
                E,
                ToolContext | PlacementSchemaServices<Tools>
              > =>
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
        })
        return Effect.retry(executeAttempt, {
          schedule: options.schedule,
          times: options.maxRetries,
          while: (error: E) =>
            !Schema.is(AgentError)(error) &&
            !Schema.is(FrameworkFailure)(error) &&
            !Schema.is(RemoteRetryMisconfigured)(error),
        }).pipe(
          Effect.flatMap((result) =>
            Schema.is(RemoteRetryMisconfigured)(result) ? Effect.fail(result) : Effect.succeed(result),
          ),
        )
      }),
    )
  })

/** @experimental Route tool calls to a user/browser/desktop client. */
export const client = <Tools extends Record<string, Tool.Any>, E = FrameworkFailure>(
  options: PlacementRouteOptions<Tools, E>,
): Route<ToolContext | PlacementSchemaServices<Tools>> => placementRoute("client", options)

/** @experimental Route tool calls to a remote tool worker or service. */
export const remote = <Tools extends Record<string, Tool.Any>, E = FrameworkFailure>(
  options: RemoteRouteOptions<Tools, E>,
): Route<ToolContext | PlacementSchemaServices<Tools>> =>
  options.idempotent === true
    ? placementRoute(
        "remote",
        {
          toolkit: options.toolkit,
          ...(options.tools === undefined ? {} : { tools: options.tools }),
          execute: (request) => retryRemote(options, request),
        },
        "provider-idempotent",
      )
    : placementRoute("remote", options)

/** @experimental Route tool calls to an MCP placement adapter. */
export const mcp = <Tools extends Record<string, Tool.Any>, E = FrameworkFailure>(
  options: PlacementRouteOptions<Tools, E>,
): Route<ToolContext | PlacementSchemaServices<Tools>> => placementRoute("mcp", options)

/** @experimental Route tool calls to a workspace or sandbox runtime. */
export const sandbox = <Tools extends Record<string, Tool.Any>, E = FrameworkFailure>(
  options: PlacementRouteOptions<Tools, E>,
): Route<ToolContext | PlacementSchemaServices<Tools>> => placementRoute("sandbox", options)
