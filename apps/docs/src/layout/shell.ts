import type { Html } from "foldkit/html"
import { html } from "foldkit/html"
import { dual } from "effect/Function"

import { button } from "@/components/ui/button"
import { commandDialog, item, root } from "@/components/ui/command"
import { description, dialogContent, title, view } from "@/components/ui/dialog"
import { kbd } from "@/components/ui/kbd"

import {
  GotSearchCommandMessage,
  GotSearchDialogMessage,
  PressedSearchShortcut,
  ToggledMobileNav,
  type Message,
} from "../app/message"
import type { Model } from "../app/model"
import { SearchCommand, searchResultsFor } from "../app/searchPalette"
import { navGroups, type SearchResult } from "../content/registry"
import { toPath } from "../route/route"
import { brandLockup, betaBadge, mark } from "./brand"
import { close, github, menu, search } from "./icon"
import { themeSelector } from "./themeSelector"

const h = html<Message>()

export const githubUrl = "https://github.com/In-Time-Tec/batonfx"

const foldkitUrl = "https://foldkit.dev"

const searchButton = (): Html =>
  button(
    {
      variant: "ghost",
      onClick: PressedSearchShortcut(),
      class:
        "text-muted-foreground bg-muted/50 hover:bg-muted h-9 w-56 justify-start gap-2 border px-3 text-sm font-normal whitespace-nowrap lg:w-64",
      attributes: [h.AriaLabel("Search docs")],
    },
    [search("size-4"), h.span([], ["Search docs"]), kbd({ class: "ml-auto" }, ["⌘K"])],
  )

const searchResultView = (result: SearchResult): Html =>
  h.div(
    [h.Class("flex min-w-0 flex-1 flex-col gap-0.5 py-1")],
    [
      h.div(
        [h.Class("flex items-center gap-2")],
        [
          h.span([h.Class("truncate text-sm font-medium")], [result.title]),
          h.span(
            [
              h.Class(
                "shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase",
              ),
            ],
            [result.group],
          ),
        ],
      ),
      h.span([h.Class("truncate text-xs text-muted-foreground")], [result.excerpt]),
    ],
  )

const searchPalette = (model: Model): Html => {
  const results = searchResultsFor(model.searchCommand.inputValue)
  const resultByPath = new Map(results.map((result) => [result.path, result]))
  return h.submodel({
    slotId: "search-dialog",
    model: model.searchDialog,
    view: view,
    viewInputs: dialogContent(commandDialog({ showCloseButton: false, class: "gap-0" }), () => [
      title({ model: model.searchDialog, class: "sr-only" }, ["Search"]),
      description({ model: model.searchDialog, class: "sr-only" }, ["Search the documentation."]),
      h.submodel({
        slotId: "search-command",
        model: model.searchCommand,
        view: SearchCommand.view,
        viewInputs: root({
          items: results.map((result) => result.path),
          itemToConfig: (path) => {
            const result = resultByPath.get(path)
            return item({}, result === undefined ? [path] : [searchResultView(result)])
          },
          itemToDisplayText: (path) => resultByPath.get(path)?.title ?? path,
          placeholder: "Search docs...",
          openOnFocus: true,
          ariaLabel: "Search docs",
          class: "!static w-full rounded-none border-0 shadow-none transition-none",
          anchor: { placement: "bottom-start", gap: 0, portal: false },
        }),
        toParentMessage: (message) => GotSearchCommandMessage({ message }),
      }),
    ]),
    toParentMessage: (message) => GotSearchDialogMessage({ message }),
  })
}

const githubLink = (className: string): Html =>
  h.a(
    [h.Href(githubUrl), h.AriaLabel("GitHub"), h.Target("_blank"), h.Rel("noreferrer"), h.Class(className)],
    [github("size-4")],
  )

const header = (model: Model): Html =>
  h.header(
    [
      h.Class(
        "sticky top-0 z-40 h-[var(--header-height)] border-b border-gray-300 bg-cream/80 backdrop-blur-sm dark:border-gray-800 dark:bg-gray-900/80",
      ),
    ],
    [
      h.div(
        [h.Class("mx-auto flex h-full w-full max-w-7xl items-center gap-3 px-4 sm:px-6")],
        [
          h.button(
            [
              h.AriaLabel("Open navigation"),
              h.OnClick(ToggledMobileNav({ isOpen: true })),
              h.Class(
                "cursor-pointer rounded-md p-2 text-gray-700 transition hover:bg-gray-100 md:hidden dark:text-gray-300 dark:hover:bg-gray-800",
              ),
            ],
            [menu("size-5")],
          ),
          brandLockup(),
          h.div(
            [h.Class("flex flex-1 items-center justify-end gap-2")],
            [
              h.div([h.Class("hidden sm:block")], [searchButton()]),
              themeSelector(model.themePreference),
              githubLink(
                "inline-flex size-9 items-center justify-center rounded-md text-gray-700 transition hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800",
              ),
            ],
          ),
        ],
      ),
    ],
  )

const footer = (): Html =>
  h.footer(
    [h.Class("border-t border-gray-300 dark:border-gray-800")],
    [
      h.div(
        [
          h.Class(
            "mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-gray-600 sm:px-6 dark:text-gray-400",
          ),
        ],
        [
          h.p(
            [],
            [
              "Built with ",
              h.a(
                [
                  h.Href(foldkitUrl),
                  h.Target("_blank"),
                  h.Rel("noreferrer"),
                  h.Class("font-medium text-gray-900 hover:text-accent-600 dark:text-white dark:hover:text-accent-400"),
                ],
                ["FoldKit"],
              ),
              ".",
            ],
          ),
          h.p([], ["Batonfx"]),
        ],
      ),
    ],
  )

const mobileNavDrawer = (model: Model): Html => {
  if (!model.isMobileNavOpen) {
    return h.empty
  }
  const path = toPath(model.route)
  return h.div(
    [h.Class("fixed inset-0 z-50 flex flex-col bg-cream md:hidden dark:bg-gray-900")],
    [
      h.div(
        [
          h.Class(
            "flex h-[var(--header-height)] shrink-0 items-center justify-between border-b border-gray-300 px-4 dark:border-gray-800",
          ),
        ],
        [
          h.div(
            [h.Class("flex items-center gap-2")],
            [
              mark("size-6"),
              h.span([h.Class("text-lg font-medium tracking-tight text-gray-900 dark:text-white")], ["Batonfx"]),
              betaBadge(),
            ],
          ),
          h.button(
            [
              h.AriaLabel("Close navigation"),
              h.OnClick(ToggledMobileNav({ isOpen: false })),
              h.Class(
                "cursor-pointer rounded-md p-2 text-gray-700 transition hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800",
              ),
            ],
            [close("size-6")],
          ),
        ],
      ),
      h.nav(
        [h.AriaLabel("Documentation"), h.Class("flex-1 overflow-y-auto px-4 py-4")],
        navGroups.map((group) =>
          h.div(
            [h.Class("mb-4")],
            [
              h.p(
                [h.Class("mb-1 px-2 text-xs font-semibold tracking-wider text-gray-600 uppercase dark:text-gray-400")],
                [group.title],
              ),
              h.ul(
                [h.Class("space-y-0.5")],
                group.pages.map((page) =>
                  h.li(
                    [],
                    [
                      h.a(
                        [
                          h.Href(page.path),
                          ...(path === page.path ? [h.AriaCurrent("page")] : []),
                          h.Class(
                            path === page.path
                              ? "block rounded-md bg-accent-100 px-2.5 py-2 text-sm text-accent-700 dark:bg-accent-900/50 dark:text-accent-400"
                              : "block rounded-md px-2.5 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800",
                          ),
                        ],
                        [page.navTitle],
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
      h.div(
        [h.Class("flex shrink-0 items-center justify-center border-t border-gray-300 p-4 dark:border-gray-800")],
        [githubLink("inline-flex size-10 items-center justify-center rounded-md text-gray-700 dark:text-gray-300")],
      ),
    ],
  )
}

export const shell: {
  (model: Model, content: Html): Html
  (content: Html): (model: Model) => Html
} = dual(
  2,
  (model: Model, content: Html): Html =>
    h.div(
      [],
      [
        h.a(
          [
            h.Href("#main-content"),
            h.Class(
              "sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:shadow-md focus:ring-2 focus:ring-ring",
            ),
          ],
          ["Skip to content"],
        ),
        header(model),
        content,
        footer(),
        mobileNavDrawer(model),
        searchPalette(model),
      ],
    ),
)
