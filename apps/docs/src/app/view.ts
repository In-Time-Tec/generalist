import { Match } from "effect"
import type { Document, Html } from "foldkit/html"
import { html } from "foldkit/html"

import { pageByPath } from "../content/docs"
import { docsLayout } from "../layout/docsLayout"
import { shell } from "../layout/shell"
import { landing } from "../page/landing"
import { notFound } from "../page/notFound"
import { renderDocsPage } from "../page/docsPage"
import { toPath, type Route } from "../route/route"
import type { Message } from "./message"
import type { Model } from "./model"

const site = "BatonFX Docs"

const h = html<Message>()

const routeTitle = (route: Route): string =>
  Match.value(route).pipe(
    Match.tag("Home", () => "BatonFX"),
    Match.tag("GettingStarted", () => `Getting started | ${site}`),
    Match.tag("DocsPage", () => `${pageByPath.get(toPath(route))?.title ?? "Docs"} | ${site}`),
    Match.tag("NotFound", () => `Not found | ${site}`),
    Match.exhaustive,
  )

const docsContent = (model: Model): Html => {
  const page = pageByPath.get(toPath(model.route))
  return page === undefined ? shell(model, notFound()) : shell(model, docsLayout(model.route, renderDocsPage(page)))
}

const routedContent = (model: Model): Html =>
  Match.value(model.route).pipe(
    Match.withReturnType<Html>(),
    Match.tag("Home", () => shell(model, landing())),
    Match.tag("GettingStarted", () => docsContent(model)),
    Match.tag("DocsPage", () => docsContent(model)),
    Match.tag("NotFound", () => shell(model, notFound())),
    Match.exhaustive,
  )

export const view = (model: Model): Document => ({
  title: routeTitle(model.route),
  body: h.div(
    [h.Class("bg-background text-foreground min-h-screen antialiased")],
    [h.keyed("div")(toPath(model.route), [], [routedContent(model)])],
  ),
})
