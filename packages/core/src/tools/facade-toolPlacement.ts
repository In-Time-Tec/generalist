import { placementOutcome as ToolPlacement_placementOutcome } from "./tool-placement.js"
export const ToolPlacement = {
  placementOutcome: ToolPlacement_placementOutcome,
} as typeof import("./tool-placement.js")
export namespace ToolPlacement {
  export type placementOutcome = typeof import("./tool-placement.js").placementOutcome
  export type Placement = import("./tool-placement.js").Placement
  export type PlacementRequest = import("./tool-placement.js").PlacementRequest
  export type PlacementResponse = import("./tool-placement.js").PlacementResponse
  export type PlacementRouteOptions<
    Tools extends Record<string, import("effect/unstable/ai").Tool.Any>,
    E = import("./tool-executor.js").FrameworkFailure,
  > = import("./tool-placement.js").PlacementRouteOptions<Tools, E>
  export type RemotePlacementRequest = import("./tool-placement.js").RemotePlacementRequest
  export type RemoteRouteIdempotentOptions<
    Tools extends Record<string, import("effect/unstable/ai").Tool.Any>,
    E,
  > = import("./tool-placement.js").RemoteRouteIdempotentOptions<Tools, E>
  export type RemoteRouteNonIdempotentOptions<
    Tools extends Record<string, import("effect/unstable/ai").Tool.Any>,
    E = import("./tool-executor.js").FrameworkFailure,
  > = import("./tool-placement.js").RemoteRouteNonIdempotentOptions<Tools, E>
  export type RemoteRouteOptions<
    Tools extends Record<string, import("effect/unstable/ai").Tool.Any>,
    E = import("./tool-executor.js").FrameworkFailure,
  > = import("./tool-placement.js").RemoteRouteOptions<Tools, E>
  export type Route = import("./tool-placement.js").Route
  export type RouteInput<R = never> = import("./tool-placement.js").RouteInput<R>
  export type RouteOptions = import("./tool-placement.js").RouteOptions
}
