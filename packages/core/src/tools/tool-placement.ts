import { Effect, Schedule, Schema } from "effect"
import { Tool } from "effect/unstable/ai"
import { FrameworkFailure, type Interface, type Outcome, type Request, type ToolkitInput } from "./tool-executor.js"
import { toolResultCodec } from "./tool-result-codec.js"
import type { ToolContext } from "./tool-context.js"

/** @experimental */
export interface Route<R = ToolContext> {
  readonly tools: ReadonlyArray<string>
  readonly matches: (request: Request) => boolean
  readonly execute: Interface<R>["execute"]
}

/** @experimental */
export interface RouteOptions<R = ToolContext> {
  readonly tools?: ReadonlyArray<string> | undefined
  readonly matches?: ((request: Request) => boolean) | undefined
  readonly execute: Interface<R>["execute"]
}

/** @experimental */
export type RouteInput<R = never> = Route<R> | Effect.Effect<Route<R>, never, R>

/** @experimental */
export type Placement = "client" | "remote" | "mcp" | "sandbox"

/** @experimental */
export interface PlacementRequest extends Request {
  readonly placement: Placement
  readonly tool: Tool.Any
}

/** @experimental An idempotent remote placement request carrying its endpoint deduplication key. */
export interface RemotePlacementRequest extends PlacementRequest {
  readonly operationKey: string
}

/** @experimental */
export type PlacementResponse =
  | { readonly _tag: "Success"; readonly result: unknown }
  | { readonly _tag: "DomainFailure"; readonly failure: unknown }
  | { readonly _tag: "Suspend"; readonly token: string }

type SchemaServicesD<S extends Schema.Constraint> = [unknown] extends [S["DecodingServices"]]
  ? never
  : S["DecodingServices"]
type SchemaServicesE<S extends Schema.Constraint> = [unknown] extends [S["EncodingServices"]]
  ? never
  : S["EncodingServices"]

export type PlacementSchemaServices<Tools extends Record<string, Tool.Any>> =
  | SchemaServicesD<Tool.ParametersSchema<Tools[keyof Tools]>>
  | SchemaServicesD<Tool.SuccessSchema<Tools[keyof Tools]>>
  | SchemaServicesE<Tool.SuccessSchema<Tools[keyof Tools]>>
  | SchemaServicesE<Schema.Constraint>

type PlacementTool<Tools extends Record<string, Tool.Any>> = Tools[keyof Tools] & {
  readonly parametersSchema: Tool.ParametersSchema<Tools[keyof Tools]>
  readonly successSchema: Tool.SuccessSchema<Tools[keyof Tools]>
  readonly failureSchema: Schema.Constraint
}
type PlacementToolkit<Tools extends Record<string, Tool.Any>> = ToolkitInput<Tools> & {
  readonly tools: Readonly<Record<string, PlacementTool<Tools>>>
}

/** @experimental */
export interface PlacementRouteOptions<Tools extends Record<string, Tool.Any>, E = FrameworkFailure> {
  readonly toolkit: PlacementToolkit<Tools>
  readonly tools?: ReadonlyArray<string> | undefined
  readonly execute: (
    request: PlacementRequest,
  ) => Effect.Effect<PlacementResponse, E, ToolContext | PlacementSchemaServices<Tools>>
}

/** @experimental */
export interface RemoteRouteNonIdempotentOptions<Tools extends Record<string, Tool.Any>, E = FrameworkFailure>
  extends PlacementRouteOptions<Tools, E> {
  readonly idempotent?: false | undefined
  readonly schedule?: Schedule.Schedule<unknown, unknown> | undefined
}

/** @experimental Idempotent remote route whose endpoint deduplicates the stable operation key. */
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

/** @experimental */
export type RemoteRouteOptions<Tools extends Record<string, Tool.Any>, E = FrameworkFailure> =
  | RemoteRouteNonIdempotentOptions<Tools, E>
  | RemoteRouteIdempotentOptions<Tools, E>

const placementOutcomeFromResponse = <SuccessSchema extends Schema.Constraint, FailureSchema extends Schema.Constraint>(
  placement: Placement,
  tool: { readonly name: string; readonly successSchema: SuccessSchema; readonly failureSchema: FailureSchema },
  response: unknown,
): Effect.Effect<
  Outcome,
  FrameworkFailure,
  SchemaServicesD<SuccessSchema> | SchemaServicesE<SuccessSchema> | SchemaServicesE<FailureSchema>
> => {
  if (typeof response !== "object" || response === null || !("_tag" in response)) {
    return Effect.fail(
      toolResultCodec.frameworkFailure("placement", tool.name, "Placement returned an invalid response"),
    )
  }
  switch (response._tag) {
    case "DomainFailure":
      return "failure" in response
        ? toolResultCodec.encodeDomainFailure<typeof tool.failureSchema>(tool, response.failure)
        : Effect.fail(
            toolResultCodec.frameworkFailure("placement", tool.name, "DomainFailure response is missing failure"),
          )
    case "Suspend":
      return "token" in response && typeof response.token === "string"
        ? Effect.succeed({ _tag: "Suspend", token: response.token })
        : Effect.fail(
            toolResultCodec.frameworkFailure("placement", tool.name, "Suspend response is missing a string token"),
          )
    case "Success":
      return "result" in response
        ? toolResultCodec
            .decodeSuccess<typeof tool.successSchema>(tool, response.result)
            .pipe(
              Effect.mapError((error) =>
                FrameworkFailure.make({ ...error, message: `${placement} result: ${error.message}` }),
              ),
            )
        : Effect.fail(toolResultCodec.frameworkFailure("placement", tool.name, "Success response is missing result"))
    default:
      return Effect.fail(
        toolResultCodec.frameworkFailure("placement", tool.name, "Placement returned an unknown response tag"),
      )
  }
}

export const placementOutcome = { fromResponse: placementOutcomeFromResponse }
