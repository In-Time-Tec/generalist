// @vitest-environment happy-dom
import { it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { TestClock } from "effect/testing"
import { Runtime } from "foldkit"
import type { UrlRequest } from "foldkit/navigation"
import type { Url } from "foldkit/url"
import { expect, test } from "vitest"

import indexHtmlSource from "virtual:source/index.html"
import { ChangedUrl, ClickedLink } from "../../src/app/message"
import { allPages, legacyRedirects, pageByPath, searchDocs } from "../../src/content/registry"
import { readSidebarGroups, writeSidebarGroups } from "../../src/layout/sidebar-storage"
import { Model, init, subscriptions, update, view } from "../../src/main"
import { multiAgent } from "../../src/pages/guides/agent/multi-agent"

const makeStorage = (): Storage => {
  const entries = new Map<string, string>()
  return {
    get length() {
      return entries.size
    },
    clear: () => entries.clear(),
    getItem: (key: string) => entries.get(key) ?? null,
    key: (index: number) => Array.from(entries.keys())[index] ?? null,
    removeItem: (key: string) => {
      entries.delete(key)
    },
    setItem: (key: string, value: string) => {
      entries.set(key, value)
    },
  }
}

Object.defineProperty(globalThis, "localStorage", { value: makeStorage(), configurable: true })
Object.defineProperty(globalThis, "sessionStorage", { value: makeStorage(), configurable: true })

Element.prototype.getAnimations = () => []

globalThis.ResizeObserver = class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.IntersectionObserver = class implements IntersectionObserver {
  readonly root: Element | Document | null = null
  readonly rootMargin = ""
  readonly scrollMargin = ""
  readonly thresholds: ReadonlyArray<number> = []
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): Array<IntersectionObserverEntry> {
    return []
  }
}

const settle = TestClock.adjust("80 millis")
const retiredBrand = ["Bat", "on"].join("")
const indexHtml = Schema.decodeUnknownSync(Schema.String)(indexHtmlSource)

const bootAt = (path: string): void => {
  document.body.innerHTML = '<div id="root"></div>'
  document.documentElement.classList.remove("dark")
  localStorage.clear()
  sessionStorage.clear()
  window.history.replaceState({}, "", path)

  const application = Runtime.makeApplication({
    Model,
    init,
    update,
    view,
    subscriptions,
    container: document.getElementById("root"),
    routing: {
      onUrlRequest: (request: UrlRequest) => ClickedLink({ request }),
      onUrlChange: (url: Url) => ChangedUrl({ url }),
    },
  })

  Runtime.run(application)
}

it.effect("landing renders the shell", () =>
  Effect.gen(function* () {
    bootAt("/")
    yield* settle
    expect(document.body.textContent).toContain("TenetKit")
  }),
)

it.effect("landing h1 is exactly TenetKit", () =>
  Effect.gen(function* () {
    bootAt("/")
    yield* settle
    expect(document.querySelector("h1")?.textContent).toBe("TenetKit")
  }),
)

it.effect("no rendered string says the retired brand", () =>
  Effect.gen(function* () {
    bootAt("/")
    yield* settle
    expect(document.body.textContent).not.toContain(retiredBrand)
  }),
)

test("index.html declares the brand shell", () => {
  expect(indexHtml).toContain("<title>TenetKit</title>")
  expect(indexHtml).not.toContain(retiredBrand)
  expect(indexHtml).toContain('href="/favicon.svg"')
  expect(indexHtml.indexOf("theme-init.js")).toBeGreaterThan(-1)
  expect(indexHtml.indexOf("theme-init.js")).toBeLessThan(indexHtml.indexOf("styles.css"))
})

it.effect("github links point at In-Time-Tec/tenetkit", () =>
  Effect.gen(function* () {
    bootAt("/")
    yield* settle
    const links = Array.from(document.querySelectorAll('a[href*="github.com"]'))
    expect(links.length).toBeGreaterThan(0)
    for (const link of links) expect(link.getAttribute("href")).toContain("In-Time-Tec/tenetkit")
  }),
)

it.effect("theme selector applies dark mode, persists it, and exposes pressed state", () =>
  Effect.gen(function* () {
    bootAt("/")
    yield* settle
    const darkButton = document.querySelector<HTMLButtonElement>('button[aria-label="Dark mode"]')
    expect(darkButton).not.toBeNull()
    expect(darkButton?.getAttribute("aria-pressed")).toBe("false")
    darkButton?.click()
    yield* settle
    expect(document.documentElement.classList.contains("dark")).toBe(true)
    expect(localStorage.getItem("theme-preference")).toBe('"Dark"')
    expect(document.querySelector('button[aria-label="Dark mode"]')?.getAttribute("aria-pressed")).toBe("true")
    const lightButton = document.querySelector<HTMLButtonElement>('button[aria-label="Light mode"]')
    lightButton?.click()
    yield* settle
    expect(document.documentElement.classList.contains("dark")).toBe(false)
    expect(localStorage.getItem("theme-preference")).toBe('"Light"')
  }),
)

it.effect("sidebar renders disclosure groups with the active group open", () =>
  Effect.gen(function* () {
    const firstPage = allPages[0]
    expect(firstPage).toBeDefined()
    bootAt(firstPage?.path ?? "/")
    yield* settle
    const groupButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-sidebar-group]"))
    expect(groupButtons.length).toBeGreaterThan(0)
    const activeGroupButton = groupButtons.find(
      (groupButton) => groupButton.getAttribute("data-sidebar-group") === firstPage?.group,
    )
    expect(activeGroupButton?.getAttribute("aria-expanded")).toBe("true")
    const unlockedButton = groupButtons.find((groupButton) => groupButton.getAttribute("aria-disabled") !== "true")
    if (unlockedButton !== undefined) {
      const groupName = unlockedButton.getAttribute("data-sidebar-group") ?? ""
      unlockedButton.click()
      yield* settle
      expect(readSidebarGroups()[groupName]).toBe(false)
    }
  }),
)

test("sidebar group storage round-trips through sessionStorage", () => {
  sessionStorage.clear()
  writeSidebarGroups({ Learn: false, Guides: true })
  expect(readSidebarGroups()).toEqual({ Learn: false, Guides: true })
  expect(sessionStorage.getItem("sidebar-groups")).toContain("Learn")
})

const assertPagesRender = Effect.fn("DocsSmokeTest.assertPagesRender")(function* (
  pages: ReadonlyArray<(typeof allPages)[number]>,
): Generator<Effect.Effect<void>, void, void> {
  const [page, ...rest] = pages
  if (page === undefined) return yield* Effect.void
  bootAt(page.path)
  yield* settle
  expect(document.body.textContent).toContain(page.title)
  expect(document.body.textContent).not.toContain(retiredBrand)
  for (const entry of page.toc) expect(document.getElementById(entry.id), `${page.path}#${entry.id}`).not.toBeNull()
  yield* assertPagesRender(rest)
})

it.effect("every registered page renders its title and toc anchors", () => assertPagesRender(allPages), 120_000)

it.effect(
  "legacy paths redirect to registered pages",
  () =>
    Effect.gen(function* () {
      for (const target of legacyRedirects.values()) expect(target.startsWith("/docs/"), target).toBe(true)
      bootAt("/docs/core/agent-loop")
      yield* settle
      const target = legacyRedirects.get("/docs/core/agent-loop")
      if (target !== undefined && pageByPath.has(target)) expect(window.location.pathname).toBe(target)
    }),
  120_000,
)

test("search finds pages by body text with title matches first", () => {
  if (allPages.length === 0) return
  expect(searchDocs("Runtime").length).toBeGreaterThan(0)
  expect(searchDocs("TurnPolicy").length).toBeGreaterThan(0)
})

test("multi-agent guide preserves the two-channel child-run contract", () => {
  for (const marker of [
    "Channel 1: Effect Context",
    "Channel 2: run options / orchestration",
    "LanguageModel.LanguageModel",
    "ToolExecutor",
    "Approvals",
    "ModelMiddleware",
    "sessionId",
    "persistence.chatId",
    "runId",
    "Queue position",
    "Scheduling and run permits",
    "fresh chat",
    "Effect.provide",
    "ToolExecutor.layerToolkit",
    "Approvals.layerAutoApprove",
    "ModelMiddleware.layerIdentity",
  ]) {
    expect(multiAgent.markdown, marker).toContain(marker)
  }
})

it.effect("command palette opens from shortcut and shows grouped results", () =>
  Effect.gen(function* () {
    bootAt("/")
    yield* settle
    const paletteSelector = 'input[placeholder="Search docs..."]'
    expect(document.querySelector(paletteSelector)).toBeNull()
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }))
    yield* settle
    expect(document.querySelector(paletteSelector)).not.toBeNull()
    const firstPage = allPages[0]
    if (firstPage !== undefined) expect(document.body.textContent).toContain(firstPage.title)
  }),
)
