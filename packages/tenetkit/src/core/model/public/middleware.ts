import {
  ModelMiddleware as ModelMiddleware_ModelMiddleware,
  layerIdentity as ModelMiddleware_layerIdentity,
  layer as ModelMiddleware_layer,
  adapt as ModelMiddleware_adapt,
} from "../middleware.js"
export const ModelMiddleware = {
  ModelMiddleware: ModelMiddleware_ModelMiddleware,
  layerIdentity: ModelMiddleware_layerIdentity,
  layer: ModelMiddleware_layer,
  adapt: ModelMiddleware_adapt,
} satisfies typeof import("../middleware.js")
export namespace ModelMiddleware {
  export type ModelMiddleware = import("../middleware.js").ModelMiddleware
  export type layerIdentity = typeof import("../middleware.js").layerIdentity
  export type layer = typeof import("../middleware.js").layer
  export type Middleware = import("../middleware.js").Middleware
  export type TurnContext = import("../middleware.js").TurnContext
}
