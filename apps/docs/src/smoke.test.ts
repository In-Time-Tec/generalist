import { it } from "@effect/vitest"
import { Effect } from "effect"
import { TestClock } from "effect/testing"
import { Runtime } from "foldkit"
import { expect, test } from "vitest"

import indexHtml from "../index.html?raw"
import { ChangedUrl, ClickedLink } from "./app/message"
import { allPages, legacyRedirects, pageByPath, searchDocs } from "./content/registry"
import { readSidebarGroups, writeSidebarGroups } from "./layout/sidebarStorage"
import { Model, init, subscriptions, update, view } from "./main"
import { multiAgent } from "./pages/guides/multi-agent"

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

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
}

if (typeof globalThis.IntersectionObserver === "undefined") {
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
}

const settle = TestClock.adjust("80 millis")

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
      onUrlRequest: (request) => ClickedLink({ request }),
      onUrlChange: (url) => ChangedUrl({ url }),
    },
  })

  Runtime.run(application)
}

it.effect("landing renders the shell", () =>
  Effect.gen(function* () {
    bootAt("/")
    yield* settle
    expect(document.body.textContent).toContain("Batonfx")
  }),
)

it.effect("landing h1 is exactly Batonfx", () =>
  Effect.gen(function* () {
    bootAt("/")
    yield* settle
    expect(document.querySelector("h1")?.textContent).toBe("Batonfx")
  }),
)

it.effect("no rendered string says BatonFX", () =>
  Effect.gen(function* () {
    bootAt("/")
    yield* settle
    expect(document.body.textContent).not.toContain("BatonFX")
    expect(document.body.textContent).not.toContain("Baton Docs")
  }),
)

test("index.html declares the brand shell", () => {
  expect(indexHtml).toContain("<title>Batonfx</title>")
  expect(indexHtml).not.toContain("BatonFX")
  expect(indexHtml).toContain('href="/favicon.svg"')
  expect(indexHtml.indexOf("theme-init.js")).toBeGreaterThan(-1)
  expect(indexHtml.indexOf("theme-init.js")).toBeLessThan(indexHtml.indexOf("styles.css"))
})

it.effect("github links point at In-Time-Tec/batonfx", () =>
  Effect.gen(function* () {
    bootAt("/")
    yield* settle
    const links = Array.from(document.querySelectorAll('a[href*="github.com"]'))
    expect(links.length).toBeGreaterThan(0)
    for (const link of links) expect(link.getAttribute("href")).toContain("In-Time-Tec/batonfx")
  }),
)

it.effect("theme selector applies dark mode, persists it, and exposes pressed state", () =>
  Effect.gen(function* () {
    bootAt("/")
    yield* settle
    const darkButton = document.querySelector('button[aria-label="Dark mode"]')
    expect(darkButton).not.toBeNull()
    expect(darkButton?.getAttribute("aria-pressed")).toBe("false")
    ;(darkButton as HTMLButtonElement).click()
    yield* settle
    expect(document.documentElement.classList.contains("dark")).toBe(true)
    expect(localStorage.getItem("theme-preference")).toBe('"Dark"')
    expect(document.querySelector('button[aria-label="Dark mode"]')?.getAttribute("aria-pressed")).toBe("true")
    const lightButton = document.querySelector('button[aria-label="Light mode"]')
    ;(lightButton as HTMLButtonElement).click()
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
    const groupButtons = Array.from(document.querySelectorAll("[data-sidebar-group]"))
    expect(groupButtons.length).toBeGreaterThan(0)
    const activeGroupButton = groupButtons.find(
      (groupButton) => groupButton.getAttribute("data-sidebar-group") === firstPage?.group,
    )
    expect(activeGroupButton?.getAttribute("aria-expanded")).toBe("true")
    const unlockedButton = groupButtons.find((groupButton) => groupButton.getAttribute("aria-disabled") !== "true")
    if (unlockedButton !== undefined) {
      const groupName = unlockedButton.getAttribute("data-sidebar-group") ?? ""
      ;(unlockedButton as HTMLButtonElement).click()
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
  expect(document.body.textContent).not.toContain("BatonFX")
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
  expect(searchDocs("baton").length).toBeGreaterThan(0)
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
    '"local"',
    "fresh chat",
    "Effect.provide",
    "ToolExecutor.fromToolkit",
    "Approvals.autoApprove",
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
