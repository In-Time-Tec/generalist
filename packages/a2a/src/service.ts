import type { DefaultRequestHandler } from "@a2a-js/sdk/server"
import { Runtime } from "@batonfx/runtime"
import { Context, Effect, Layer } from "effect"
import type { Deployment } from "./adapter.js"
import { makeHandler } from "./adapter.js"

/** @experimental A configured A2A v1 request handler. */
export interface Interface {
  readonly deployment: Deployment
  readonly handler: DefaultRequestHandler
}

/** @experimental A2A adapter service. */
export class A2A extends Context.Service<A2A, Interface>()("@batonfx/a2a/service/A2A") {}

/** @experimental Provide one explicit A2A deployment over the caller's Runtime. */
export const layer = (deployment: Deployment): Layer.Layer<A2A, never, Runtime.Runtime> =>
  Layer.effect(
    A2A,
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      return { deployment, handler: makeHandler(runtime, deployment) }
    }),
  )
