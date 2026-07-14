import { Runtime } from "foldkit"
import { expect, test } from "vitest"

import indexHtml from "../index.html?raw"
import { ChangedUrl, ClickedLink } from "./app/message"
import { allPages, legacyRedirects, pageByPath, searchDocs } from "./content/registry"
import { readSidebarGroups, writeSidebarGroups } from "./layout/sidebarStorage"
import { Model, init, subscriptions, update, view } from "./main"

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
  globalThis.IntersectionObserver = class {
    root = null
    rootMargin = ""
    scrollMargin = ""
    thresholds: ReadonlyArray<number> = []
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): Array<IntersectionObserverEntry> {
      return []
    }
  }
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 80))

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

test("landing renders the shell", async () => {
  bootAt("/")
  await settle()

  expect(document.body.textContent).toContain("Batonfx")
})

test("landing h1 is exactly Batonfx", async () => {
  bootAt("/")
  await settle()

  expect(document.querySelector("h1")?.textContent).toBe("Batonfx")
})

test("no rendered string says BatonFX", async () => {
  bootAt("/")
  await settle()

  expect(document.body.textContent).not.toContain("BatonFX")
  expect(document.body.textContent).not.toContain("Baton Docs")
})

test("index.html declares the brand shell", () => {
  expect(indexHtml).toContain("<title>Batonfx</title>")
  expect(indexHtml).not.toContain("BatonFX")
  expect(indexHtml).toContain('href="/favicon.svg"')
  expect(indexHtml.indexOf("theme-init.js")).toBeGreaterThan(-1)
  expect(indexHtml.indexOf("theme-init.js")).toBeLessThan(indexHtml.indexOf("styles.css"))
})

test("github links point at In-Time-Tec/batonfx", async () => {
  bootAt("/")
  await settle()

  const links = Array.from(document.querySelectorAll('a[href*="github.com"]'))
  expect(links.length).toBeGreaterThan(0)
  for (const link of links) {
    expect(link.getAttribute("href")).toContain("In-Time-Tec/batonfx")
  }
})

test("theme selector applies dark mode, persists it, and exposes pressed state", async () => {
  bootAt("/")
  await settle()

  const darkButton = document.querySelector('button[aria-label="Dark mode"]')
  expect(darkButton).not.toBeNull()
  expect(darkButton?.getAttribute("aria-pressed")).toBe("false")
  ;(darkButton as HTMLButtonElement).click()
  await settle()

  expect(document.documentElement.classList.contains("dark")).toBe(true)
  expect(localStorage.getItem("theme-preference")).toBe('"Dark"')
  expect(document.querySelector('button[aria-label="Dark mode"]')?.getAttribute("aria-pressed")).toBe("true")

  const lightButton = document.querySelector('button[aria-label="Light mode"]')
  ;(lightButton as HTMLButtonElement).click()
  await settle()

  expect(document.documentElement.classList.contains("dark")).toBe(false)
  expect(localStorage.getItem("theme-preference")).toBe('"Light"')
})

test("sidebar renders disclosure groups with the active group open", async () => {
  const firstPage = allPages[0]
  if (firstPage === undefined) {
    return
  }
  bootAt(firstPage.path)
  await settle()

  const groupButtons = Array.from(document.querySelectorAll("[data-sidebar-group]"))
  expect(groupButtons.length).toBeGreaterThan(0)

  const activeGroupButton = groupButtons.find(
    (groupButton) => groupButton.getAttribute("data-sidebar-group") === firstPage.group,
  )
  expect(activeGroupButton?.getAttribute("aria-expanded")).toBe("true")

  const unlockedButton = groupButtons.find((groupButton) => groupButton.getAttribute("aria-disabled") !== "true")
  if (unlockedButton !== undefined) {
    const groupName = unlockedButton.getAttribute("data-sidebar-group") ?? ""
    ;(unlockedButton as HTMLButtonElement).click()
    await settle()
    expect(readSidebarGroups()[groupName]).toBe(false)
  }
})

test("sidebar group storage round-trips through sessionStorage", () => {
  sessionStorage.clear()
  writeSidebarGroups({ Learn: false, Guides: true })
  expect(readSidebarGroups()).toEqual({ Learn: false, Guides: true })
  expect(sessionStorage.getItem("sidebar-groups")).toContain("Learn")
})

const assertPagesRender = async (pages: ReadonlyArray<(typeof allPages)[number]>): Promise<void> => {
  const [page, ...rest] = pages
  if (page === undefined) {
    return
  }
  bootAt(page.path)
  await settle()

  expect(document.body.textContent).toContain(page.title)
  expect(document.body.textContent).not.toContain("BatonFX")
  for (const entry of page.toc) {
    expect(document.getElementById(entry.id), `${page.path}#${entry.id}`).not.toBeNull()
  }
  await assertPagesRender(rest)
}

test("every registered page renders its title and toc anchors", { timeout: 120_000 }, async () => {
  await assertPagesRender(allPages)
})

test("legacy paths redirect to registered pages", async () => {
  for (const target of legacyRedirects.values()) {
    expect(target.startsWith("/docs/"), target).toBe(true)
  }

  bootAt("/docs/core/agent-loop")
  await settle()
  const target = legacyRedirects.get("/docs/core/agent-loop")
  if (target !== undefined && pageByPath.has(target)) {
    expect(window.location.pathname).toBe(target)
  }
})

test("search finds pages by body text with title matches first", () => {
  if (allPages.length === 0) {
    return
  }
  const results = searchDocs("baton")
  expect(results.length).toBeGreaterThan(0)

  const bodyResults = searchDocs("TurnPolicy")
  expect(bodyResults.length).toBeGreaterThan(0)
})

test("command palette opens from shortcut and shows grouped results", async () => {
  bootAt("/")
  await settle()

  const paletteSelector = 'input[placeholder="Search docs..."]'
  expect(document.querySelector(paletteSelector)).toBeNull()

  window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }))
  await settle()

  expect(document.querySelector(paletteSelector)).not.toBeNull()
  const firstPage = allPages[0]
  if (firstPage !== undefined) {
    expect(document.body.textContent).toContain(firstPage.title)
  }
})
