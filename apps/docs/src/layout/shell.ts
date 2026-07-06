import type { Html } from "foldkit/html"
import { html } from "foldkit/html"

import { button } from "@/components/ui/button"
import * as Command from "@/components/ui/command"
import * as Dialog from "@/components/ui/dialog"
import { kbd } from "@/components/ui/kbd"
import * as NavigationMenu from "@/components/ui/navigation-menu"

import { GotSearchCommandMessage, GotSearchDialogMessage, PressedSearchShortcut, type Message } from "../app/message"
import type { Model } from "../app/model"
import { SearchCommand, filterSearchItems } from "../app/searchPalette"
import { type Route, toPath } from "../route/route"

const h = html<Message>()

const githubUrl = "https://github.com/dallen-pyrah/batonfx"

const isDocsRoute = (route: Route): boolean => route._tag === "GettingStarted" || route._tag === "DocsPage"

const mark = (): Html =>
  h.svg(
    [
      h.Attribute("xmlns", "http://www.w3.org/2000/svg"),
      h.Attribute("viewBox", "0 0 32 32"),
      h.Attribute("fill", "none"),
      h.AriaHidden(true),
      h.Class("size-6"),
    ],
    [
      h.rect([h.X("4"), h.Y("7"), h.Width("24"), h.Height("18"), h.Rx("4"), h.Class("fill-primary")], []),
      h.path(
        [h.Attribute("d", "M9 16h14M16 10v12"), h.Class("stroke-primary-foreground"), h.Attribute("stroke-width", "2")],
        [],
      ),
    ],
  )

const searchButton = (): Html =>
  button(
    {
      variant: "ghost",
      onClick: PressedSearchShortcut(),
      class:
        "text-muted-foreground bg-muted/50 hover:bg-muted h-9 w-56 justify-start gap-2 border px-3 text-sm font-normal whitespace-nowrap lg:w-64",
      attributes: [h.AriaLabel("Search Baton docs")],
    },
    [h.span([], ["Search docs"]), kbd({ class: "ml-auto" }, ["⌘K"])],
  )

const searchPalette = (model: Model): Html =>
  h.submodel({
    slotId: "search-dialog",
    model: model.searchDialog,
    view: Dialog.view,
    viewInputs: Dialog.content(Command.commandDialog({ showCloseButton: false, class: "gap-0" }), () => [
      Dialog.title({ model: model.searchDialog, class: "sr-only" }, ["Search"]),
      Dialog.description({ model: model.searchDialog, class: "sr-only" }, ["Search BatonFX documentation."]),
      h.submodel({
        slotId: "search-command",
        model: model.searchCommand,
        view: SearchCommand.view,
        viewInputs: Command.root({
          items: filterSearchItems(model.searchCommand.inputValue),
          itemToConfig: (item) => Command.item({}, [item]),
          placeholder: "Search Baton docs…",
          openOnFocus: true,
          ariaLabel: "Search Baton docs",
          class: "!static w-full rounded-none border-0 shadow-none transition-none",
          anchor: { placement: "bottom-start", gap: 0, portal: false },
        }),
        toParentMessage: (message) => GotSearchCommandMessage({ message }),
      }),
    ]),
    toParentMessage: (message) => GotSearchDialogMessage({ message }),
  })

const navLink = (href: string, label: string, isActive: boolean): Html =>
  NavigationMenu.item({}, [
    NavigationMenu.link(
      {
        href,
        isActive,
        class: "px-3 py-2",
      },
      [label],
    ),
  ])

const topNav = (model: Model): Html =>
  h.header(
    [h.Class("bg-background/95 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-40 border-b backdrop-blur")],
    [
      h.div(
        [h.Class("mx-auto flex h-14 w-full max-w-7xl items-center gap-6 px-4 sm:px-6")],
        [
          h.a(
            [h.Href("/"), h.Class("flex items-center gap-2 text-lg font-semibold tracking-tight")],
            [mark(), h.span([], ["BatonFX"])],
          ),
          NavigationMenu.navigationMenu({ class: "hidden md:flex" }, [
            NavigationMenu.list({}, [
              navLink("/", "Home", model.route._tag === "Home"),
              navLink("/docs/getting-started", "Docs", isDocsRoute(model.route)),
              navLink("/docs/reference/decisions", "ADRs", toPath(model.route) === "/docs/reference/decisions"),
            ]),
          ]),
          h.div(
            [h.Class("flex flex-1 items-center justify-end gap-2")],
            [
              h.div([h.Class("hidden sm:block")], [searchButton()]),
              h.a(
                [
                  h.Href(githubUrl),
                  h.Target("_blank"),
                  h.Rel("noreferrer"),
                  h.Class("text-muted-foreground hover:text-foreground text-sm font-medium"),
                ],
                ["GitHub"],
              ),
            ],
          ),
        ],
      ),
    ],
  )

export const shell = (model: Model, content: Html): Html =>
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
      topNav(model),
      content,
      searchPalette(model),
    ],
  )
