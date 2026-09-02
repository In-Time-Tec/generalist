import { Layer } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import type { Any as AnyAgent } from "../core/agent/service.js"
import type { Host } from "../host/index.js"
import { api } from "./api.js"
import type { Authentication } from "./auth.js"
import { layerHandlers } from "./handlers.js"

export interface Options<Agents extends ReadonlyArray<AnyAgent>, AuthError, AuthServices> {
  readonly host: Host<Agents>
  readonly auth: Layer.Layer<Authentication, AuthError, AuthServices>
  readonly operator?: boolean
}

/** Serve one Host through the declared HttpApi and `/openapi.json`. */
export const layer = <Agents extends ReadonlyArray<AnyAgent>, AuthError, AuthServices>(
  options: Options<Agents, AuthError, AuthServices>,
) => {
  const implemented = layerHandlers({ host: options.host, operator: options.operator === true }).pipe(
    Layer.provideMerge(options.auth),
  )
  return HttpApiBuilder.layer(api, { openapiPath: "/openapi.json" }).pipe(Layer.provide(implemented))
}
