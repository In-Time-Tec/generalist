import { BunHttpPlatform, BunHttpServer, BunRuntime, BunServices } from "@effect/platform-bun"
import { Config, Effect, FileSystem, Layer, Path } from "effect"
import {
  HttpServer,
  HttpServerError,
  HttpServerRequest,
  HttpServerResponse,
  HttpStaticServer,
} from "effect/unstable/http"
import { Server } from "foldkit/experimental"
import { renderPage } from "../dist/server/entry.server.js"

const withNegotiatedVary = (response: HttpServerResponse.HttpServerResponse): HttpServerResponse.HttpServerResponse =>
  HttpServerResponse.setHeader(
    response,
    "vary",
    Server.varyWith(Server.varyWithAccept(response.headers.vary), "Sec-Fetch-Dest"),
  )

const isRouteNotFound = (error: HttpServerError.HttpServerError): boolean => error.reason._tag === "RouteNotFound"

const renderRequest = (request: HttpServerRequest.HttpServerRequest, requestUrl: string, template: string) =>
  Effect.gen(function* () {
    const source = yield* HttpServerRequest.toWeb(request)
    const webRequest = yield* Effect.sync(() => new Request(requestUrl, source))
    const result = yield* Effect.promise(() => renderPage(webRequest))
    return yield* Effect.sync(() => HttpServerResponse.fromWeb(Server.toResponse(template, result)))
  })

export const makeHandler = (options: { readonly origin: string; readonly clientRoot?: string }) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const clientDirectory = path.resolve(options.clientRoot ?? "dist/client")
    const template = yield* fileSystem.readFileString(path.join(clientDirectory, "index.html"))
    const staticFiles = yield* HttpStaticServer.make({ root: clientDirectory, index: undefined })

    const staticMiss = (request: HttpServerRequest.HttpServerRequest, requestUrl: string) => {
      const classification = Server.classifyRequest(requestUrl, request.headers["sec-fetch-dest"])
      if (classification === "PathAsset") return Effect.succeed(HttpServerResponse.empty({ status: 404 }))
      if (classification === "DestinationAsset")
        return Effect.succeed(withNegotiatedVary(HttpServerResponse.empty({ status: 404 })))
      return Server.acceptsHtml(request.headers.accept)
        ? renderRequest(request, requestUrl, template).pipe(Effect.map(withNegotiatedVary))
        : Effect.succeed(withNegotiatedVary(HttpServerResponse.empty({ status: 404 })))
    }

    const serveStaticOrRender = (request: HttpServerRequest.HttpServerRequest, requestUrl: string) =>
      staticFiles.pipe(
        Effect.provideService(HttpServerRequest.HttpServerRequest, request),
        Effect.map(HttpServerResponse.setHeader("cache-control", "no-cache")),
        Effect.catchIf(isRouteNotFound, () => staticMiss(request, requestUrl)),
      )

    const handler = HttpServerRequest.HttpServerRequest.use((request) => {
      const requestUrl = Server.resolveRequestUrl(request.url, options.origin)
      if (requestUrl === undefined) return Effect.succeed(HttpServerResponse.empty({ status: 400 }))

      const url = new URL(requestUrl)
      const routedRequest = request.modify({ url: `${url.pathname}${url.search}` })

      if (Server.isHostSettledMethod(routedRequest.method)) {
        return Effect.succeed(
          HttpServerResponse.empty({
            status: Server.HOST_METHOD_ANSWERS.refusedStatus,
            headers: { allow: Server.HOST_METHOD_ANSWERS.allow },
          }),
        )
      }
      if (routedRequest.method !== "GET" && routedRequest.method !== "HEAD")
        return renderRequest(routedRequest, requestUrl, template)
      if (Server.resolvesToIndexHtml(requestUrl)) return renderRequest(routedRequest, requestUrl, template)
      return serveStaticOrRender(routedRequest, requestUrl)
    })
    return { handler }
  })

const serverLayer = (port: number, origin: string) =>
  Layer.unwrap(Effect.map(makeHandler({ origin }), ({ handler }) => HttpServer.serve(handler))).pipe(
    HttpServer.withLogAddress,
    Layer.provide(BunHttpServer.layerServer({ hostname: "0.0.0.0", port })),
    Layer.provide(BunHttpPlatform.layer),
    Layer.provide(BunServices.layer),
  )

const main = Effect.gen(function* () {
  const port = yield* Config.port("PORT").pipe(Config.withDefault(3000))
  const origin = yield* Config.string("ORIGIN").pipe(Config.withDefault(`http://localhost:${port}`))
  return yield* Layer.launch(serverLayer(port, origin))
})

if (import.meta.main) BunRuntime.runMain(main)
