import { props } from "@stylexjs/stylex"
import { Option } from "effect"
import { createKeyedLazy, type Document, type Html, type HtmlBuilder } from "foldkit/html"
import { sections, type Block, type CodeExample, type Section } from "./content"
import { DialogLifetime } from "./browser"
import type { CodeHighlights, CodeLines } from "./code"
import type { Message, Model } from "./main"
import { groups, headingId, outline, pageForPath, pathFor, searchPages } from "./pages"
import { diagramView } from "./diagrams"
import { className, styles } from "./styles"
import { darkTheme, lightTheme } from "./theme.stylex"

type H = HtmlBuilder<Message>
const icons = {
  search: "m21 21-4.4-4.4M19 10.5a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0Z",
  arrow: "M5 12h14m-5-5 5 5-5 5",
  back: "M19 12H5m5-5-5 5 5 5",
  chevron: "m9 6 6 6-6 6",
  menu: "M4 7h16M4 12h16M4 17h16",
  close: "m6 6 12 12M6 18 18 6",
  copy: "M9 8h11v13H9zM5 16H3V3h11v2",
  check: "m5 12 4 4L19 6",
  moon: "M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z",
  sun: "M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  monitor: "M3 4h18v13H3zM8 21h8m-4-4v4",
  page: "M14 2H4v20h16V8l-6-6Zm0 0v6h6M8 12h8M8 16h6",
  enter: "M20 5v9H5m5-5-5 5 5 5",
}

const icon = (h: H, name: keyof typeof icons): Html =>
  h.svg(
    [
      h.ViewBox("0 0 24 24"),
      h.Fill("none"),
      h.Stroke("currentColor"),
      h.StrokeWidth("1.5"),
      h.StrokeLinecap("round"),
      h.StrokeLinejoin("round"),
      h.AriaHidden(true),
      h.Class(className(props(styles.icon))),
    ],
    [h.path([h.D(icons[name])])],
  )

const brand = (h: H): Html =>
  h.a(
    [h.Href("/"), h.Class(className(props(styles.link, styles.focus, styles.brand))), h.AriaLabel("Generalist home")],
    [
      h.svg(
        [
          h.ViewBox("0 0 36 36"),
          h.Fill("currentColor"),
          h.AriaHidden(true),
          h.Class(className(props(styles.brandIcon))),
        ],
        [h.path([h.D("M10 2h22v7H10zM3 9h7v19H3zM10 28h18v7H10zM20 16h13v12h-7v-5h-6z")])],
      ),
      "Generalist",
    ],
  )

const dynamic = (
  h: H,
  properties: {
    readonly className?: string | undefined
    readonly style?: Readonly<Record<string, string | number>> | undefined
  },
) => [
  h.Class(className(properties)),
  h.Style(Object.fromEntries(Object.entries(properties.style ?? {}).map(([key, value]) => [key, String(value)]))),
]

const inline = (h: H, text: string): ReadonlyArray<Html | string> =>
  text
    .split(/`([^`]+)`/g)
    .map((part, index) => (index % 2 === 0 ? part : h.code([h.Class(className(props(styles.inlineCode)))], [part])))

const searchTrigger = (h: H, id: string): Html =>
  h.button(
    [
      h.Id(id),
      h.Type("button"),
      h.Class(className(props(styles.button, styles.focus, styles.searchTrigger))),
      h.OnClick({ _tag: "OpenedSearch" }),
      h.AriaLabel("Search documentation"),
      h.AriaHasPopup("dialog"),
      h.AriaKeyshortcuts("Meta+K Control+K"),
    ],
    [icon(h, "search"), "Search documentation", h.kbd([h.Class(className(props(styles.shortcut)))], ["⌘ K"])],
  )

const navigation = (h: H, model: Model): Html =>
  h.nav(
    [
      h.AriaLabel("Documentation"),
      h.Class(className(props(styles.navScroll))),
      h.OnPointerLeave(() => Option.some({ _tag: "LeftNavigation" })),
    ],
    groups.map((group) => {
      const pages = sections.filter((section) => section.group === group)
      if (pages.length === 0) return h.empty
      return h.div(
        [h.Class(className(props(styles.navGroup)))],
        [
          group === "Start"
            ? h.empty
            : h.p(
                [h.Class(className(props(styles.navGroupTitle)))],
                [group, h.span([h.Class(className(props(styles.navCount)))], [String(pages.length)])],
              ),
          h.div(
            [h.Class(className(props(styles.navItems)))],
            [
              h.div(
                [
                  ...dynamic(
                    h,
                    props(
                      styles.hoverTrack(
                        model.hoverY.value,
                        model.hoverGroup === group ? model.hoverAlpha.value : 0,
                        36,
                      ),
                    ),
                  ),
                  h.DataAttribute("nav-highlight", group),
                  h.AriaHidden(true),
                ],
                [],
              ),
              ...pages.map((section, index) =>
                h.a(
                  [
                    h.Href(pathFor(section)),
                    h.Class(
                      className(
                        props(
                          styles.link,
                          styles.focus,
                          styles.navLink,
                          model.path === pathFor(section) && styles.navActive,
                        ),
                      ),
                    ),
                    h.AriaCurrent(model.path === pathFor(section) ? "page" : "false"),
                    h.OnPointerMove((_x, _y, pointer) =>
                      pointer === "touch" ? Option.none() : Option.some({ _tag: "HoveredItem", group, index }),
                    ),
                    h.OnFocus({ _tag: "HoveredItem", group, index }),
                  ],
                  [section.label],
                ),
              ),
            ],
          ),
        ],
      )
    }),
  )

const sidebarFooter = (h: H, model: Model): Html => {
  const next = { system: "dark", dark: "light", light: "system" } as const
  const names = { system: "System", dark: "Dark", light: "Light" }
  const symbols = { system: "monitor", dark: "moon", light: "sun" } as const
  return h.div(
    [h.Class(className(props(styles.sidebarFooter)))],
    [
      h.button(
        [
          h.Type("button"),
          h.Class(className(props(styles.button, styles.focus, styles.themeButton))),
          h.AriaLabel(`Theme: ${names[model.theme]}. Switch to ${next[model.theme]}.`),
          h.OnClick({ _tag: "ChangedTheme", theme: next[model.theme] }),
        ],
        [icon(h, symbols[model.theme]), names[model.theme]],
      ),
    ],
  )
}

const tokenLines = (h: H, lines: CodeLines): Html =>
  h.code(
    [h.Class(className(props(styles.code)))],
    lines.map((line) =>
      h.span(
        [h.Class(className(props(styles.codeLine)))],
        line.map((token) =>
          h.span(
            [...dynamic(h, props(styles.token(token.light || "inherit", token.dark || "inherit")))],
            [token.text.replace(/\n$/, "")],
          ),
        ),
      ),
    ),
  )
const lazyTokens = createKeyedLazy()

const codeView = (h: H, example: CodeExample, highlights: CodeHighlights, copyStatus: Model["copyStatus"]): Html => {
  if (example.language === "text")
    return h.div(
      [h.Class(className(props(styles.output)))],
      [h.span([h.Class(className(props(styles.outputLabel)))], ["Output"]), example.source.trim()],
    )
  const status = copyStatus?.id === example.id ? copyStatus : null
  const copied = status !== null && !status.failed
  const lines =
    highlights[example.id] ??
    example.source
      .trim()
      .split("\n")
      .map((text) => [{ text, light: "", dark: "" }])
  return h.figure(
    [h.Class(className(props(styles.codeFigure))), h.Id(`example-${example.id}`)],
    [
      h.button(
        [
          h.Type("button"),
          h.Class(className(props(styles.button, styles.focus, styles.copyButton))),
          h.AriaLabel(copied ? "Code copied" : "Copy code"),
          h.DataAttribute("copy-id", example.id),
          h.OnClick({ _tag: "ClickedCopy", id: example.id }),
        ],
        [icon(h, copied ? "check" : "copy")],
      ),
      copied ? h.span([h.Class(className(props(styles.copyStatus)))], ["Copied"]) : h.empty,
      h.pre(
        [
          h.Class(className(props(styles.pre, styles.focus))),
          h.Tabindex(0),
          h.Role("region"),
          h.AriaLabel(`${example.language} example`),
        ],
        [lazyTokens(example.id, tokenLines, [h, lines])],
      ),
      status?.failed === true
        ? h.p(
            [h.Class(className(props(styles.copyError)))],
            ["Clipboard access was denied. Select the code and copy it manually."],
          )
        : h.empty,
    ],
  )
}

const blockView = (
  h: H,
  block: Block,
  highlights: CodeHighlights,
  copyStatus: Model["copyStatus"],
  id: string,
): Html => {
  switch (block.kind) {
    case "paragraph":
      return h.p([h.Class(className(props(styles.p)))], inline(h, block.text))
    case "heading":
      return h.h2(
        [h.Id(headingId(block.text)), h.Tabindex(-1), h.Class(className(props(styles.h2, styles.focusReset)))],
        [
          h.a(
            [
              h.Href(`#${headingId(block.text)}`),
              h.Class(className(props(styles.link, styles.focus, styles.headingLink))),
            ],
            [block.text],
          ),
        ],
      )
    case "code":
      return codeView(h, block.example, highlights, copyStatus)
    case "note":
      return h.aside(
        [h.Class(className(props(styles.note)))],
        [
          h.p([h.Class(className(props(styles.noteTitle)))], [block.title]),
          h.p([h.Class(className(props(styles.noteText)))], inline(h, block.text)),
        ],
      )
    case "list":
      return h.ul(
        [h.Class(className(props(styles.list)))],
        block.items.map((item) => h.li([h.Class(className(props(styles.listItem)))], inline(h, item))),
      )
    case "table":
      return h.div(
        [h.Class(className(props(styles.tableScroll)))],
        [
          h.table(
            [h.Class(className(props(styles.table)))],
            [
              h.thead(
                [],
                [
                  h.tr(
                    [],
                    block.headings.map((title) =>
                      h.th([h.Scope("col"), h.Class(className(props(styles.cell, styles.tableHeading)))], [title]),
                    ),
                  ),
                ],
              ),
              h.tbody(
                [],
                block.rows.map(([name, value]) =>
                  h.tr(
                    [],
                    [
                      h.th(
                        [h.Scope("row"), h.Class(className(props(styles.cell, styles.tableHeading)))],
                        inline(h, name),
                      ),
                      h.td([h.Class(className(props(styles.cell)))], inline(h, value)),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ],
      )
    case "links":
      return h.div(
        [h.Class(className(props(styles.related)))],
        block.items.map((item) =>
          h.a(
            [h.Href(item.href), h.Class(className(props(styles.link, styles.focus, styles.relatedLink)))],
            [
              h.span(
                [],
                [item.title, h.span([h.Class(className(props(styles.relatedDescription)))], [item.description])],
              ),
              icon(h, "arrow"),
            ],
          ),
        ),
      )
    case "diagram":
      return diagramView({ h, name: block.name, id })
  }
}

const article = (h: H, section: Section, highlights: CodeHighlights, copyStatus: Model["copyStatus"]): Html => {
  const home = section.id === "home"
  const index = sections.findIndex((page) => page.id === section.id)
  const previous = sections[index - 1]
  const next = sections[index + 1]
  return h.article(
    [h.Id("article"), h.Tabindex(-1), h.Class(className(props(styles.article, styles.focusReset)))],
    [
      h.header(
        [h.Class(className(props(styles.articleHeader, home && styles.homeHeader)))],
        [
          h.p(
            [h.Class(className(props(styles.eyebrow)))],
            [home ? "The Effect-native agent framework" : section.group],
          ),
          h.h1([h.Class(className(props(styles.h1, home && styles.homeTitle)))], [section.title]),
          h.p([h.Class(className(props(styles.description)))], [section.description]),
          home
            ? h.div(
                [h.Class(className(props(styles.ctaRow)))],
                [
                  h.a(
                    [
                      h.Href("/docs/quickstart"),
                      h.Class(className(props(styles.link, styles.focus, styles.cta, styles.ctaPrimary))),
                    ],
                    ["Start building", icon(h, "arrow")],
                  ),
                  h.a(
                    [
                      h.Href("/why"),
                      h.Class(className(props(styles.link, styles.focus, styles.cta, styles.ctaSecondary))),
                    ],
                    ["Why Generalist"],
                  ),
                ],
              )
            : h.empty,
        ],
      ),
      ...section.blocks.map((block, blockIndex) =>
        blockView(h, block, highlights, copyStatus, `${section.id}-${blockIndex}`),
      ),
      h.nav(
        [h.AriaLabel("Previous and next pages"), h.Class(className(props(styles.pageFooter)))],
        [
          previous === undefined
            ? h.empty
            : h.a(
                [h.Href(pathFor(previous)), h.Class(className(props(styles.link, styles.focus, styles.footerLink)))],
                [
                  icon(h, "back"),
                  h.span([], [h.span([h.Class(className(props(styles.footerLabel)))], ["Previous"]), previous.label]),
                ],
              ),
          next === undefined
            ? h.empty
            : h.a(
                [
                  h.Href(pathFor(next)),
                  h.Class(className(props(styles.link, styles.focus, styles.footerLink, styles.footerRight))),
                ],
                [
                  h.span([], [h.span([h.Class(className(props(styles.footerLabel)))], ["Next"]), next.label]),
                  icon(h, "arrow"),
                ],
              ),
        ],
      ),
      h.footer(
        [h.Class(className(props(styles.colophon)))],
        [h.span([], ["Generalist"]), h.span([], ["Built with Effect. Designed for work."])],
      ),
    ],
  )
}
const lazyArticle = createKeyedLazy()

const searchDialog = (h: H, model: Model): Html => {
  const results = searchPages(model.query)
  return h.dialog(
    [
      h.Id("search-dialog"),
      h.Class(className(props(styles.dialog))),
      h.AriaLabel("Search documentation"),
      h.DataAttribute("present", String(model.searchOpen || model.searchMotion.value > 0)),
      h.DataAttribute("focus-after-close", model.focusAfterNavigation),
      h.OnCancel({ _tag: "ClosedSearch" }),
      h.OnMount(DialogLifetime()),
      h.OnKeyDownPreventDefault((key) => (key === "Escape" ? Option.some({ _tag: "ClosedSearch" }) : Option.none())),
    ],
    [
      h.div(
        [
          ...dynamic(h, props(styles.backdrop(model.searchMotion.value))),
          h.OnClick({ _tag: "ClosedSearch" }),
          h.AriaHidden(true),
        ],
        [],
      ),
      h.div(
        [...dynamic(h, props(styles.searchPanel(model.searchMotion.value)))],
        [
          h.div(
            [h.Class(className(props(styles.searchInputRow)))],
            [
              icon(h, "search"),
              h.input([
                h.Id("search-input"),
                h.Type("search"),
                h.Value(model.query),
                h.Placeholder("Search the documentation…"),
                h.Class(className(props(styles.searchInput))),
                h.AriaLabel("Search documentation"),
                h.Role("combobox"),
                h.AriaExpanded(true),
                h.AriaControls("search-results"),
                h.AriaAutocomplete("list"),
                h.AriaActiveDescendant(results.length === 0 ? "" : `search-result-${model.searchIndex}`),
                h.Autocomplete("off"),
                h.OnInput((query) => ({ _tag: "ChangedQuery", query })),
                h.OnKeyDownPreventDefault((key) => {
                  if (key === "ArrowDown") return Option.some({ _tag: "MovedSelection", direction: 1 })
                  if (key === "ArrowUp") return Option.some({ _tag: "MovedSelection", direction: -1 })
                  if (key === "Enter") return Option.some({ _tag: "ActivatedResult" })
                  return Option.none()
                }),
              ]),
              h.button(
                [
                  h.Type("button"),
                  h.AriaLabel("Close search"),
                  h.Class(className(props(styles.button, styles.focus, styles.iconButton))),
                  h.OnClick({ _tag: "ClosedSearch" }),
                ],
                [icon(h, "close")],
              ),
            ],
          ),
          h.p(
            [h.Class(className(props(styles.searchHint)))],
            [model.query.trim().length === 0 ? "Quick links" : `${results.length} results`],
          ),
          h.div(
            [h.Class(className(props(styles.searchList)))],
            [
              h.div(
                [
                  h.Id("search-results"),
                  h.Role("listbox"),
                  h.AriaLabel("Search results"),
                  h.Class(className(props(styles.searchListInner))),
                ],
                [
                  results.length === 0
                    ? h.p(
                        [h.Class(className(props(styles.emptySearch)))],
                        ["No results. Try a topic like tools, approvals, or recovery."],
                      )
                    : h.div(
                        [
                          ...dynamic(h, props(styles.hoverTrack(model.searchHighlight.value, 1, 64))),
                          h.AriaHidden(true),
                          h.DataAttribute("search-highlight", "true"),
                        ],
                        [],
                      ),
                  ...results.map((result, index) =>
                    h.a(
                      [
                        h.Id(`search-result-${index}`),
                        h.Href(result.href),
                        h.Role("option"),
                        h.Tabindex(-1),
                        h.AriaSelected(index === model.searchIndex),
                        h.Class(className(props(styles.link, styles.searchResult))),
                        h.OnMouseEnter({ _tag: "SelectedResult", index }),
                      ],
                      [
                        icon(h, "page"),
                        h.span(
                          [h.Class(className(props(styles.resultText)))],
                          [
                            h.span([h.Class(className(props(styles.resultCategory)))], [result.category]),
                            h.span([h.Class(className(props(styles.resultTitle)))], [result.title]),
                          ],
                        ),
                        index === model.searchIndex
                          ? h.span([h.Class(className(props(styles.resultArrow)))], [icon(h, "enter")])
                          : h.empty,
                      ],
                    ),
                  ),
                ],
              ),
            ],
          ),
          h.div(
            [h.Class(className(props(styles.searchFooter)))],
            [
              h.span([], ["Navigate ", h.kbd([h.Class(className(props(styles.key)))], ["↑ ↓"])]),
              h.span([], ["Open ", h.kbd([h.Class(className(props(styles.key)))], ["↵"])]),
              h.span([], ["Close ", h.kbd([h.Class(className(props(styles.key)))], ["Esc"])]),
            ],
          ),
        ],
      ),
    ],
  )
}

const drawer = (h: H, model: Model): Html =>
  h.dialog(
    [
      h.Id("navigation-dialog"),
      h.Class(className(props(styles.dialog))),
      h.AriaLabel("Documentation navigation"),
      h.DataAttribute("present", String(model.drawerOpen || model.drawerMotion.value > 0)),
      h.DataAttribute("focus-after-close", model.focusAfterNavigation),
      h.OnCancel({ _tag: "ClosedDrawer" }),
      h.OnMount(DialogLifetime()),
      h.OnKeyDownPreventDefault((key) => (key === "Escape" ? Option.some({ _tag: "ClosedDrawer" }) : Option.none())),
    ],
    [
      h.div(
        [
          ...dynamic(h, props(styles.backdrop(model.drawerMotion.value))),
          h.OnClick({ _tag: "ClosedDrawer" }),
          h.AriaHidden(true),
        ],
        [],
      ),
      h.div(
        [...dynamic(h, props(styles.drawer(model.drawerMotion.value)))],
        [
          h.div(
            [h.Class(className(props(styles.drawerHeader)))],
            [
              brand(h),
              h.button(
                [
                  h.Type("button"),
                  h.Class(className(props(styles.button, styles.focus, styles.iconButton))),
                  h.AriaLabel("Close navigation"),
                  h.OnClick({ _tag: "ClosedDrawer" }),
                ],
                [icon(h, "close")],
              ),
            ],
          ),
          searchTrigger(h, "drawer-search"),
          navigation(h, model),
          sidebarFooter(h, model),
        ],
      ),
    ],
  )

const fallback: Section = {
  id: "not-found",
  title: "Page not found",
  label: "Page not found",
  description: "That page does not exist. Start from the documentation home.",
  group: "Start",
  blocks: [],
}

const view = (model: Model, h: H): Document => {
  const section = pageForPath(model.path) ?? fallback
  const home = section.id === "home"
  const toc = outline(section)
  const copyStatus =
    model.copyStatus?.failed === true
      ? "Copy failed. Select the code to copy it manually."
      : "Code copied to clipboard."
  return {
    title: home ? "Generalist — Build an agent. Keep its work." : `${section.label} — Generalist`,
    lang: "en",
    canonical: `${model.origin}${pathFor(section)}`,
    body: h.div(
      [
        h.Class(
          className(
            props(
              styles.page,
              model.theme === "dark" && darkTheme,
              model.theme === "light" && lightTheme,
              model.theme === "dark" && styles.dark,
              model.theme === "light" && styles.light,
            ),
          ),
        ),
      ],
      [
        h.a([h.Href("#article"), h.Class(className(props(styles.link, styles.skip)))], ["Skip to content"]),
        h.aside(
          [h.Class(className(props(styles.sidebar)))],
          [
            h.div([h.Class(className(props(styles.sidebarBrand)))], [brand(h)]),
            searchTrigger(h, "desktop-search"),
            navigation(h, model),
            sidebarFooter(h, model),
          ],
        ),
        h.header(
          [h.Class(className(props(styles.mobileBar)))],
          [
            brand(h),
            h.div(
              [h.Class(className(props(styles.mobileActions)))],
              [
                h.button(
                  [
                    h.Id("mobile-search"),
                    h.Type("button"),
                    h.Class(className(props(styles.button, styles.focus, styles.iconButton))),
                    h.AriaLabel("Search documentation"),
                    h.OnClick({ _tag: "OpenedSearch" }),
                  ],
                  [icon(h, "search")],
                ),
                h.button(
                  [
                    h.Id("mobile-menu"),
                    h.Type("button"),
                    h.Class(className(props(styles.button, styles.focus, styles.iconButton))),
                    h.AriaLabel("Open navigation"),
                    h.AriaHasPopup("dialog"),
                    h.OnClick({ _tag: "OpenedDrawer" }),
                  ],
                  [icon(h, "menu")],
                ),
              ],
            ),
          ],
        ),
        h.main(
          [h.Class(className(props(styles.main)))],
          [
            h.div(
              [h.Class(className(props(styles.contentGrid, home && styles.homeGrid)))],
              [
                lazyArticle(section.id, article, [h, section, model.code, model.copyStatus]),
                home || toc.length === 0
                  ? h.empty
                  : h.nav(
                      [h.AriaLabel("On this page"), h.Class(className(props(styles.toc)))],
                      [
                        h.p([h.Class(className(props(styles.tocTitle)))], ["On this page"]),
                        ...toc.map((heading) =>
                          h.a(
                            [
                              h.Href(`#${heading.id}`),
                              h.Class(className(props(styles.link, styles.focus, styles.tocLink))),
                            ],
                            [heading.title],
                          ),
                        ),
                      ],
                    ),
              ],
            ),
          ],
        ),
        drawer(h, model),
        searchDialog(h, model),
        h.div(
          [h.Class(className(props(styles.srOnly))), h.Role("status"), h.AriaLive("polite")],
          [model.copyStatus === null ? "" : copyStatus],
        ),
      ],
    ),
  }
}

export const page = { view }
