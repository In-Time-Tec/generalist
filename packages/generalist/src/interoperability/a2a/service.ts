import type { DefaultRequestHandler } from "@a2a-js/sdk/server"
import { Runtime } from "../../runtime/service.js"
import { Context, Effect, Layer } from "effect"
import { make as makeHandler, type Deployment } from "./handler.js"

export { make as makeHandler, type Deployment } from "./handler.js"

/** @experimental A configured A2A v1 request handler. */
export interface Service {
  readonly deployment: Deployment
  readonly handler: DefaultRequestHandler
}

/** @experimental A2A adapter service. */
export class A2A extends Context.Service<A2A, Service>()("generalist/interoperability/a2a/service/A2A") {}

/** @experimental Provide one explicit A2A deployment over the caller's Runtime. */
export const layer = (deployment: Deployment): Layer.Layer<A2A, never, Runtime> =>
  Layer.effect(
    A2A,
    Effect.gen(function* () {
      const runtime = yield* Runtime
      return { deployment, handler: makeHandler(runtime, deployment) }
    }),
  )
