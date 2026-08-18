import { Match } from "effect"
import type { Document, Html } from "foldkit/html"
import { html } from "foldkit/html"

import { pageByPath } from "../content/registry"
import { docsLayout } from "../layout/docsLayout"
import { shell } from "../layout/shell"
import { landing } from "../page/landing"
import { notFound } from "../page/notFound"
import { render } from "../prose/render"
import { toPath, type Route } from "../route/route"
import type { Message } from "./message"
import type { Model } from "./model"

const site = "TenetKit"

const h = html<Message>()

const routeTitle = (route: Route): string =>
  Match.value(route).pipe(
    Match.tag("Home", () => site),
    Match.tag("GettingStarted", () => `Docs · ${site}`),
    Match.tag("DocsPage", () => {
      const page = pageByPath.get(toPath(route))
      return page === undefined ? `Not found · ${site}` : `${page.title} · ${site}`
    }),
    Match.tag("NotFound", () => `Not found · ${site}`),
    Match.exhaustive,
  )

const docsContent = (model: Model): Html => {
  const page = pageByPath.get(toPath(model.route))
  return page === undefined
    ? shell(model, notFound())
    : shell(
        model,
        docsLayout(model, {
          title: page.title,
          navTitle: page.navTitle,
          toc: page.toc,
          body: render(page.title, page.description, page.content, { copiedSource: model.copiedCode }),
        }),
      )
}

const routedContent = (model: Model): Html =>
  Match.value(model.route).pipe(
    Match.withReturnType<Html>(),
    Match.tag("Home", () => shell(model, landing(model))),
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
