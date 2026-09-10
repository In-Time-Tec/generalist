import { Effect } from "effect"
import { Server } from "foldkit/experimental"
import { application } from "./main"
import { highlightCode } from "./highlight.server"
import { pageForPath } from "./pages"

const cachedHighlights = Effect.runSync(Effect.cached(highlightCode))

export const renderPage = (request: Request): Promise<Server.EntryResult> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const url = new URL(request.url)
      if (request.method !== "GET" && request.method !== "HEAD") {
        return Server.Responded(
          new Response(null, {
            status: request.method === "OPTIONS" ? 204 : 405,
            headers: { allow: "GET, HEAD, OPTIONS" },
          }),
        )
      }
      if (url.pathname === "/health") {
        return Server.Responded(
          new Response(request.method === "HEAD" ? null : "ok", {
            headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
          }),
        )
      }
      if (pageForPath(url.pathname) === undefined) {
        return Server.Responded(
          new Response(request.method === "HEAD" ? null : "Page not found. Read the documentation at /.", {
            status: 404,
            headers: { "content-type": "text/plain; charset=utf-8", "x-content-type-options": "nosniff" },
          }),
        )
      }
      const code = yield* cachedHighlights
      const rendered = yield* Server.renderToString(application, {
        url: request.url,
        flags: { code },
        buildId: import.meta.env.FOLDKIT_BUILD_ID,
      })
      return Server.Rendered(rendered, {
        headers: {
          "cache-control": "no-cache",
          "x-content-type-options": "nosniff",
          "referrer-policy": "strict-origin-when-cross-origin",
          "x-frame-options": "DENY",
        },
      })
    }),
  )
