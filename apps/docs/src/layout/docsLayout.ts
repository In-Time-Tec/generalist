import type { Html } from "foldkit/html"
import { html } from "foldkit/html"

import {
  breadcrumb,
  breadcrumbItem,
  breadcrumbLink,
  breadcrumbList,
  breadcrumbPage,
  breadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { scrollArea } from "@/components/ui/scroll-area"
import { separator } from "@/components/ui/separator"

import type { Message } from "../app/message"
import { navGroups, pageByPath } from "../content/docs"
import { toPath, type Route } from "../route/route"
import type { DocsPageView, TocEntry } from "./types"

const h = html<Message>()

const activeItemClass = "bg-accent text-accent-foreground rounded-md px-3 py-1.5 text-sm font-medium"
const itemClass = "text-muted-foreground hover:text-foreground rounded-md px-3 py-1.5 text-sm transition-colors"

const sidebarLink = (href: string, label: string, isActive: boolean): Html =>
  h.a([h.Href(href), h.Class(isActive ? activeItemClass : itemClass)], [label])

const sidebar = (path: string): Html =>
  h.aside(
    [h.Class("sticky top-14 hidden h-[calc(100vh-3.5rem)] w-64 shrink-0 py-8 pr-4 lg:block")],
    [
      scrollArea(
        { fade: true, class: "rounded-none pr-2" },
        navGroups.flatMap((group) => [
          h.div(
            [h.Class("mt-2 first:mt-0")],
            [
              h.p([h.Class("mb-1 px-3 text-sm font-semibold")], [group.title]),
              h.nav(
                [h.AriaLabel(group.title), h.Class("flex flex-col gap-1")],
                group.pages.map((page) => sidebarLink(page.path, page.navTitle, path === page.path)),
              ),
            ],
          ),
        ]),
      ),
    ],
  )

const tocLink = (entry: TocEntry): Html =>
  h.a(
    [
      h.Href(`#${entry.id}`),
      h.Class("text-muted-foreground hover:text-foreground block py-1 text-sm transition-colors"),
    ],
    [entry.label],
  )

const rightRail = (toc: ReadonlyArray<TocEntry>): Html =>
  h.aside(
    [h.Class("sticky top-14 hidden h-[calc(100vh-3.5rem)] w-56 shrink-0 py-10 xl:block")],
    [
      h.p([h.Class("mb-2 text-sm font-semibold")], ["On this page"]),
      h.nav([h.AriaLabel("On this page"), h.Class("flex flex-col")], toc.map(tocLink)),
    ],
  )

const breadcrumbs = (path: string, title: string): Html =>
  breadcrumb({}, [
    breadcrumbList({}, [
      breadcrumbItem({}, [breadcrumbLink({ href: "/" }, ["BatonFX"])]),
      breadcrumbSeparator({}),
      breadcrumbItem({}, [breadcrumbLink({ href: "/docs/getting-started" }, ["Docs"])]),
      breadcrumbSeparator({}),
      breadcrumbItem({}, [breadcrumbPage({}, [title])]),
    ]),
  ])

export const docsLayout = (route: Route, page: DocsPageView): Html => {
  const path = toPath(route)
  const current = pageByPath.get(path)
  return h.div(
    [h.Class("mx-auto flex w-full max-w-7xl gap-8 px-4 sm:px-6")],
    [
      sidebar(path),
      h.main(
        [h.Id("main-content"), h.Class("min-w-0 flex-1 py-10")],
        [
          h.div(
            [h.Class("mx-auto max-w-3xl")],
            [breadcrumbs(path, current?.navTitle ?? page.title), separator({ class: "my-6" }), page.body],
          ),
        ],
      ),
      rightRail(page.toc),
    ],
  )
}
