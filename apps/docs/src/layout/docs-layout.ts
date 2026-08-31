import type { Html } from "foldkit/html"
import { html } from "@/lib/html"
import { dual } from "effect/Function"

import {
  breadcrumb,
  breadcrumbItem,
  breadcrumbLink,
  breadcrumbList,
  breadcrumbPage,
  breadcrumbSeparator,
} from "@/components/ui/navigation/breadcrumb"
import { cn } from "@/lib/styles"
import { separator } from "@/components/ui/separator"

import { ToggledSidebarGroup, type Message } from "../app/message"
import type { Model } from "../app/model"
import { defaultDocsPath, navGroups, type NavGroup } from "../content/registry"
import { toPath } from "../route/match"
import { chevronDown } from "./icon"
import { pager } from "./pager"
import { isSidebarGroupOpen } from "./sidebar-storage"
import { mobileTableOfContents, tableOfContents } from "./table-of-contents"
import type { DocsPageView } from "./types"

const h = html<Message>()

const sidebarLink = (href: string, label: string, isActive: boolean): Html =>
  h.li(
    [],
    [
      h.a(
        [
          h.Href(href),
          ...(isActive ? [h.AriaCurrent("page")] : []),
          h.Class(
            isActive
              ? "block rounded-md bg-accent-100 px-2.5 py-1.5 text-sm text-accent-700 dark:bg-accent-900/50 dark:text-accent-400"
              : "block rounded-md px-2.5 py-1.5 text-sm text-gray-700 transition hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800",
          ),
        ],
        [label],
      ),
    ],
  )

const sidebarGroup = (group: NavGroup, path: string, openSidebarGroups: Model["openSidebarGroups"]): Html => {
  const isLocked = group.pages.some((page) => page.path === path)
  const isOpen = isLocked || isSidebarGroupOpen(openSidebarGroups, group.title)
  const panelId = `sidebar-group-${group.title.toLowerCase()}`
  return h.li(
    [],
    [
      h.button(
        [
          h.DataAttribute("sidebar-group", group.title),
          h.AriaExpanded(isOpen),
          h.AriaControls(panelId),
          ...(isLocked ? [h.AriaDisabled(true)] : [h.OnClick(ToggledSidebarGroup({ group: group.title }))]),
          h.Class(
            cn(
              "flex w-full items-center justify-between rounded-md px-2.5 py-2 text-xs font-semibold tracking-wider text-gray-600 uppercase transition dark:text-gray-400",
              isLocked
                ? "cursor-default"
                : "cursor-pointer hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-300",
            ),
          ),
        ],
        [
          h.span([], [group.title]),
          isLocked ? h.empty : h.span([h.Class(cn(isOpen && "rotate-180"))], [chevronDown("size-3")]),
        ],
      ),
      isOpen
        ? h.ul(
            [h.Id(panelId), h.Class("mt-1 mb-3 space-y-0.5")],
            group.pages.map((page) => sidebarLink(page.path, page.navTitle, path === page.path)),
          )
        : h.div([h.Id(panelId), h.Class("hidden")], []),
    ],
  )
}

const sidebar = (path: string, openSidebarGroups: Model["openSidebarGroups"]): Html =>
  h.aside(
    [
      h.AriaLabel("Documentation sidebar"),
      h.Class(
        "sticky top-[var(--header-height)] hidden h-[calc(100vh-var(--header-height))] w-64 shrink-0 overflow-y-auto py-6 pr-4 md:block",
      ),
    ],
    [
      h.nav(
        [h.AriaLabel("Documentation")],
        [
          h.ul(
            [h.Class("space-y-1")],
            navGroups.map((group) => sidebarGroup(group, path, openSidebarGroups)),
          ),
        ],
      ),
    ],
  )

const breadcrumbs = (title: string): Html =>
  breadcrumb({}, [
    breadcrumbList({}, [
      breadcrumbItem({}, [breadcrumbLink({ href: "/" }, ["Generalist"])]),
      breadcrumbSeparator({}),
      breadcrumbItem({}, [breadcrumbLink({ href: defaultDocsPath }, ["Docs"])]),
      breadcrumbSeparator({}),
      breadcrumbItem({}, [breadcrumbPage({}, [title])]),
    ]),
  ])

export const docsLayout: {
  (model: Model, page: DocsPageView): Html
  (page: DocsPageView): (model: Model) => Html
} = dual(2, (model: Model, page: DocsPageView): Html => {
  const path = toPath(model.route)
  return h.div(
    [h.Class("mx-auto flex w-full max-w-7xl gap-8 px-4 sm:px-6")],
    [
      sidebar(path, model.openSidebarGroups),
      h.main(
        [h.Id("main-content"), h.Class("min-w-0 flex-1")],
        [
          mobileTableOfContents(page.toc, model.maybeActiveSectionId, model.isMobileTocOpen),
          h.div(
            [h.Class("py-10")],
            [
              h.div(
                [h.Class("mx-auto max-w-3xl")],
                [breadcrumbs(page.navTitle), separator({ class: "my-6" }), page.body, pager(path)],
              ),
            ],
          ),
        ],
      ),
      tableOfContents(page.toc, model.maybeActiveSectionId),
    ],
  )
})
