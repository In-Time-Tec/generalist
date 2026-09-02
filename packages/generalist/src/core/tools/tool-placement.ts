import { Effect, Schedule, Schema } from "effect"
import { Tool } from "effect/unstable/ai"
import {
  FrameworkFailure,
  RemoteRetryMisconfigured,
  type Outcome,
  type ReplayPolicy,
  type Request,
  type ToolkitInput,
  toolResultCodec,
} from "./tool-result-codec.js"
import type { CancellationFailure, CancellationOutcome, CancellationRequest } from "./tool-executor-cancellation.js"
import type { ToolContext } from "./tool-context.js"
import type { ConcreteSchemaTool, PlacementSchemaServices } from "./tool-placement-internal.js"
export interface Route<R = ToolContext> {
  readonly tools: ReadonlyArray<string>
  readonly matches: (request: Request) => boolean
  readonly replayPolicy?: ((request: Request) => ReplayPolicy) | undefined
  readonly execute: (request: Request) => Effect.Effect<Outcome, FrameworkFailure | RemoteRetryMisconfigured, R>
  readonly cancel?:
    | ((request: CancellationRequest) => Effect.Effect<CancellationOutcome, CancellationFailure, R>)
    | undefined
}
export interface RouteOptions<R = ToolContext> {
  readonly tools?: ReadonlyArray<string> | undefined
  readonly matches?: ((request: Request) => boolean) | undefined
  readonly replayPolicy?: ((request: Request) => ReplayPolicy) | undefined
  readonly execute: (request: Request) => Effect.Effect<Outcome, FrameworkFailure | RemoteRetryMisconfigured, R>
  readonly cancel?:
    | ((request: CancellationRequest) => Effect.Effect<CancellationOutcome, CancellationFailure, R>)
    | undefined
}
export type RouteInput<R = never> = Route<R> | Effect.Effect<Route<R>, never, R>
export type Placement = "client" | "remote" | "mcp" | "sandbox"
export interface PlacementRequest extends Request {
  readonly placement: Placement
  readonly tool: Tool.Any
}

/** An idempotent remote placement request carrying its endpoint deduplication key. */
export interface RemotePlacementRequest extends PlacementRequest {
  readonly operationKey: string
}
export type PlacementResponse =
  | { readonly _tag: "Success"; readonly result: unknown }
  | { readonly _tag: "DomainFailure"; readonly failure: unknown }
  | { readonly _tag: "Suspend"; readonly token: string }

type PlacementTool<Tools extends Record<string, Tool.Any>> = Tools[keyof Tools] & {
  readonly parametersSchema: Tool.ParametersSchema<Tools[keyof Tools]>
  readonly successSchema: Tool.SuccessSchema<Tools[keyof Tools]>
  readonly failureSchema: ConcreteSchemaTool<Tools[keyof Tools]>["failureSchema"]
}
type PlacementToolkit<Tools extends Record<string, Tool.Any>> = ToolkitInput<Tools> & {
  readonly tools: Readonly<Record<string, PlacementTool<Tools>>>
}
export interface PlacementRouteOptions<Tools extends Record<string, Tool.Any>, E = FrameworkFailure> {
  readonly toolkit: PlacementToolkit<Tools>
  readonly tools?: ReadonlyArray<string> | undefined
  readonly execute: (
    request: PlacementRequest,
  ) => Effect.Effect<PlacementResponse, E, ToolContext | PlacementSchemaServices<Tools>>
}
export interface RemoteRouteNonIdempotentOptions<Tools extends Record<string, Tool.Any>, E = FrameworkFailure>
  extends PlacementRouteOptions<Tools, E> {
  readonly idempotent?: false | undefined
  readonly schedule?: Schedule.Schedule<unknown, unknown> | undefined
}

/** Idempotent remote route whose endpoint deduplicates the stable operation key. */
export interface RemoteRouteIdempotentOptions<Tools extends Record<string, Tool.Any>, E> {
  readonly toolkit: PlacementToolkit<Tools>
  readonly tools?: ReadonlyArray<string> | undefined
  readonly idempotent: true
  readonly operationKey: (request: PlacementRequest) => string
  readonly maxRetries: number
  readonly schedule: Schedule.Schedule<unknown, E>
  readonly execute: (
    request: RemotePlacementRequest,
  ) => Effect.Effect<PlacementResponse, E, ToolContext | PlacementSchemaServices<Tools>>
}
export type RemoteRouteOptions<Tools extends Record<string, Tool.Any>, E = FrameworkFailure> =
  | RemoteRouteNonIdempotentOptions<Tools, E>
  | RemoteRouteIdempotentOptions<Tools, E>

const placementOutcomeFromResponse = <SuccessSchema extends Schema.Constraint, FailureSchema extends Schema.Constraint>(
  placement: Placement,
  tool: { readonly name: string; readonly successSchema: SuccessSchema; readonly failureSchema: FailureSchema },
  response: PlacementResponse,
): Effect.Effect<
  Outcome,
  FrameworkFailure,
  SuccessSchema["DecodingServices"] | SuccessSchema["EncodingServices"] | FailureSchema["EncodingServices"]
> => {
  switch (response._tag) {
    case "DomainFailure":
      return toolResultCodec.encodeDomainFailure<typeof tool.failureSchema>(tool, response.failure)
    case "Suspend":
      return Effect.succeed({ _tag: "Suspend", token: response.token })
    case "Success":
      return toolResultCodec.decodeSuccess<typeof tool.successSchema>(tool, response.result).pipe(
        Effect.mapError((error) => {
          const failure = {
            stage: error.stage,
            tool: error.tool,
            message: `${placement} result: ${error.message}`,
          }
          return FrameworkFailure.make(failure)
        }),
      )
  }
}

export const placementOutcome = { fromResponse: placementOutcomeFromResponse }
