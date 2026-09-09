/* oxlint-disable effecttsgo/any-unknown-in-error-context -- Effect HTTP's raw router handler intentionally preserves its platform error channel. */
import { Context, Effect, Exit, Layer, Scope } from "effect"
import { HttpEffect, HttpRouter, HttpServerRequest, HttpServerResponse, HttpServer } from "effect/unstable/http"
import { Socket } from "effect/unstable/socket"
import type { UniversalWebSocket } from "rivetkit"
import type { Any as AnyAgent } from "../../../core/agent/service.js"
import { layer as serverLayer, type Options as ServerOptions } from "../../../server/layer.js"

/** @experimental Identity supplied to an actor-incarnation Server factory. */
export interface RuntimeActorServerContext {
  readonly actorId: string
  readonly key: ReadonlyArray<string>
  readonly namespace: {
    readonly environment: string
    readonly tenant: string
    readonly partition: string
  }
}

/** @experimental Server configuration returned by a Rivet actor-incarnation factory. */
export type RuntimeActorServerOptions<
  _Agents = ReadonlyArray<AnyAgent>,
  AuthError = never,
  AuthServices = never,
> = ServerOptions<never, AuthError, AuthServices>

/** @experimental Actor-incarnation factory for one canonical server configuration. */
export interface RuntimeActorServerFactory<
  Config = RuntimeActorServerOptions,
  Error = unknown,
  Requirements = unknown,
> {
  readonly make: (context: RuntimeActorServerContext) => Effect.Effect<Config, Error, Requirements>
}

/** @experimental One canonical HTTP/WebSocket handler retained for an actor incarnation. */
export interface RuntimeActorServer {
  readonly handle: (request: Request, websocket?: UniversalWebSocket) => Effect.Effect<Response, unknown>
}

interface ScopedResponse {
  readonly value: Response
  readonly retainScope: boolean
}

const requestPath = (request: Request, prefix: "/request" | "/websocket"): string => {
  const url = new URL(request.url)
  const pathname = url.pathname
  let stripped = pathname
  if (pathname === prefix) stripped = "/"
  else if (pathname.startsWith(`${prefix}/`)) stripped = pathname.slice(prefix.length)
  return `${stripped || "/"}${url.search}`
}

const serverRequest = (
  request: Request,
  websocket: UniversalWebSocket | undefined,
): HttpServerRequest.HttpServerRequest => {
  const source = HttpServerRequest.fromWeb(request).modify({
    url: requestPath(request, websocket === undefined ? "/request" : "/websocket"),
  })
  if (websocket === undefined) return source
  const unknownWebSocket: unknown = websocket
  // SAFETY: Rivet's UniversalWebSocket deliberately implements the WebSocket event and close contract consumed by Effect Socket.
  // oxlint-disable-next-line anti-slop/no-widen-then-assert, typescript/no-unsafe-type-assertion
  const webSocket = unknownWebSocket as globalThis.WebSocket
  const socket = Socket.fromWebSocket(Effect.succeed(webSocket), {
    closeCodeIsError: () => false,
  })
  Object.defineProperty(source, "upgrade", { configurable: true, value: socket })
  return source
}

const scoped = <E>(effect: Effect.Effect<ScopedResponse, E, Scope.Scope>): Effect.Effect<Response, E> =>
  Effect.withFiber((fiber) => {
    const previous = fiber.context
    const scope = Scope.makeUnsafe()
    fiber.setContext(Context.add(previous, Scope.Scope, scope))
    return Effect.provideService(
      Effect.onExitPrimitive(effect, (exit) => {
        fiber.setContext(previous)
        if (Exit.isSuccess(exit) && exit.value.retainScope) return undefined
        return Scope.closeUnsafe(scope, exit)
      }),
      Scope.Scope,
      scope,
    ).pipe(Effect.map((result) => result.value))
  })

const build = <Agents extends ReadonlyArray<AnyAgent>, AuthError, AuthServices>(options: {
  readonly config: RuntimeActorServerOptions<Agents, AuthError, AuthServices>
  readonly memoMap: Layer.MemoMap
  readonly scope: Scope.Closeable
}): Effect.Effect<RuntimeActorServer, AuthError, AuthServices> =>
  Effect.gen(function* () {
    const context = yield* Layer.buildWithMemoMap(
      serverLayer(options.config).pipe(Layer.provideMerge(HttpRouter.layer), Layer.provide(HttpServer.layerServices)),
      options.memoMap,
      options.scope,
    )
    const router = Context.getUnsafe(context, HttpRouter.HttpRouter)
    const effect = router.asHttpEffect()
    const handle = (request: Request, websocket?: UniversalWebSocket) =>
      scoped(
        Effect.gen(function* () {
          const incoming = serverRequest(request, websocket)
          const current = yield* Effect.context()
          const services = Context.add(Context.merge(context, current), HttpServerRequest.HttpServerRequest, incoming)
          const response = yield* Effect.provideContext(effect, services)
          const retainScope = response.body._tag === "Stream"
          const transferred = retainScope ? HttpEffect.scopeTransferToStream(response) : response
          return {
            value: HttpServerResponse.toWeb(transferred, { context: services }),
            retainScope,
          }
        }),
      )
    return { handle }
  })

export const make = build
