/* oxlint-disable effecttsgo/any-unknown-in-error-context -- Effect HTTP's raw router handler intentionally preserves its platform error channel. */
import { Context, Effect, Exit, Layer, Scope, Stream } from "effect"
import {
  HttpBody,
  HttpEffect,
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
  HttpServer,
} from "effect/unstable/http"
import { Socket } from "effect/unstable/socket"
import type { UniversalWebSocket } from "rivetkit"
import type { AgentRegistry } from "../../../host/index.js"
import { layer as serverLayer, type Options as ServerOptions } from "../../../server/layer.js"
import type { ActorRuntimeServices } from "./runtime.js"

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
  Agents extends AgentRegistry = AgentRegistry,
  AuthError = never,
  AuthServices extends ActorRuntimeServices = never,
> = ServerOptions<Agents, AuthError, AuthServices>

/** @experimental Actor-incarnation factory for one canonical server configuration. */
export interface RuntimeActorServerFactory<
  Agents extends AgentRegistry = AgentRegistry,
  ServerError = never,
  AuthError = never,
  AuthServices extends ActorRuntimeServices = never,
  ServerRequirements extends ActorRuntimeServices = ActorRuntimeServices,
> {
  readonly make: (
    context: RuntimeActorServerContext,
  ) => Effect.Effect<
    RuntimeActorServerOptions<Agents, AuthError, AuthServices>,
    ServerError,
    ServerRequirements | Scope.Scope
  >
}

/** @experimental One canonical HTTP/WebSocket handler retained for an actor incarnation. */
export interface RuntimeActorServer {
  readonly handle: (
    request: Request,
    websocket?: UniversalWebSocket,
    signal?: AbortSignal,
  ) => Effect.Effect<Response, unknown>
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
  const socket = Socket.fromWebSocket(Effect.succeed(webSocket))
  Object.defineProperty(source, "upgrade", { configurable: true, value: socket })
  return source
}

const scoped = <E>(
  effect: Effect.Effect<ScopedResponse, E, Scope.Scope>,
  owner: Scope.Scope,
): Effect.Effect<Response, E> =>
  Effect.acquireUseRelease(
    Scope.fork(owner),
    (scope) => Effect.provideService(effect, Scope.Scope, scope),
    (scope, exit) => (Exit.isSuccess(exit) && exit.value.retainScope ? Effect.void : Scope.close(scope, exit)),
  ).pipe(Effect.map((result) => result.value))

const aborted = (signal: AbortSignal): Effect.Effect<void> =>
  Effect.callback((resume) => {
    const onAbort = () => resume(Effect.void)
    if (signal.aborted) {
      onAbort()
      return
    }
    signal.addEventListener("abort", onAbort, { once: true })
    return Effect.sync(() => signal.removeEventListener("abort", onAbort))
  })

const build = <Agents extends AgentRegistry, AuthError, AuthServices extends ActorRuntimeServices>(options: {
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
    const handle = (request: Request, websocket?: UniversalWebSocket, signal?: AbortSignal) =>
      scoped(
        Effect.gen(function* () {
          const incoming = serverRequest(request, websocket)
          const current = yield* Effect.context()
          const services = Context.add(Context.merge(context, current), HttpServerRequest.HttpServerRequest, incoming)
          const streamSignal =
            signal === undefined || signal === request.signal
              ? (signal ?? request.signal)
              : AbortSignal.any([signal, request.signal])
          const response = yield* Effect.raceFirst(
            Effect.provideContext(effect, services),
            aborted(streamSignal).pipe(Effect.andThen(Effect.interrupt)),
          )
          const retainScope = response.body._tag === "Stream"
          let transferred = retainScope ? HttpEffect.scopeTransferToStream(response) : response
          if (retainScope) {
            const body = transferred.body
            if (body._tag === "Stream") {
              transferred = HttpServerResponse.setBody(
                transferred,
                HttpBody.stream(
                  Stream.interruptWhen(body.stream, aborted(streamSignal)),
                  body.contentType,
                  body.contentLength,
                ),
              )
            }
          }
          return {
            value: HttpServerResponse.toWeb(transferred, { context: services }),
            retainScope,
          }
        }),
        options.scope,
      )
    return { handle }
  })

export const make = build
