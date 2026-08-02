import {
  ModelMiddleware as ModelMiddleware_ModelMiddleware,
  layerIdentity as ModelMiddleware_layerIdentity,
  layer as ModelMiddleware_layer,
  adapt as ModelMiddleware_adapt,
} from "./model-middleware.js"
export const ModelMiddleware = {
  ModelMiddleware: ModelMiddleware_ModelMiddleware,
  layerIdentity: ModelMiddleware_layerIdentity,
  layer: ModelMiddleware_layer,
  adapt: ModelMiddleware_adapt,
} as typeof import("./model-middleware.js")
export namespace ModelMiddleware {
  export type ModelMiddleware = import("./model-middleware.js").ModelMiddleware
  export type layerIdentity = typeof import("./model-middleware.js").layerIdentity
  export type layer = typeof import("./model-middleware.js").layer
  export type Middleware = import("./model-middleware.js").Middleware
  export type TurnContext = import("./model-middleware.js").TurnContext
}
