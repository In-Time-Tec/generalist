import { Layer } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import type { AgentRegistry, Host } from "../host/index.js"
import { api } from "./api.js"
import type { Authentication, Authorization } from "./auth.js"
import { layerHandlers } from "./handlers.js"

export interface Options<Agents extends AgentRegistry, AuthError, AuthServices> {
  readonly host: Host<Agents>
  readonly auth: Layer.Layer<Authentication, AuthError, AuthServices>
  readonly authorization: Authorization
  readonly operator?: boolean
}

/** Serve one Host through the declared HttpApi and `/openapi.json`. */
export const layer = <Agents extends AgentRegistry, AuthError, AuthServices>(
  options: Options<Agents, AuthError, AuthServices>,
) => {
  const implemented = layerHandlers({
    host: options.host,
    authorization: options.authorization,
    operator: options.operator === true,
  }).pipe(Layer.provideMerge(options.auth))
  return HttpApiBuilder.layer(api, { openapiPath: "/openapi.json" }).pipe(Layer.provide(implemented))
}
