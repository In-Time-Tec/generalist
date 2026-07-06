import { Match, Schema, pipe } from "effect"
import { literal, mapTo, oneOf, parseUrlWithFallback, r, root, slash, string } from "foldkit/route"

export const HomeRoute = r("Home")
export const GettingStartedRoute = r("GettingStarted")
export const DocsPageRoute = r("DocsPage", { section: Schema.String, slug: Schema.String })
export const NotFoundRoute = r("NotFound", { path: Schema.String })

export const Route = Schema.Union([HomeRoute, GettingStartedRoute, DocsPageRoute, NotFoundRoute])
export type Route = typeof Route.Type

const homeRouter = pipe(root, mapTo(HomeRoute))
const gettingStartedRouter = pipe(literal("docs"), slash(literal("getting-started")), mapTo(GettingStartedRoute))
const docsPageRouter = pipe(literal("docs"), slash(string("section")), slash(string("slug")), mapTo(DocsPageRoute))

const routeParser = oneOf(docsPageRouter, gettingStartedRouter, homeRouter)

export const urlToRoute = parseUrlWithFallback(routeParser, NotFoundRoute)

export const toPath = (route: Route): string =>
  Match.value(route).pipe(
    Match.tag("Home", () => "/"),
    Match.tag("GettingStarted", () => "/docs/getting-started"),
    Match.tag("DocsPage", ({ section, slug }) => `/docs/${section}/${slug}`),
    Match.tag("NotFound", ({ path }) => path),
    Match.exhaustive,
  )
