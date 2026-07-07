// @vitest-environment happy-dom
import { Runtime } from "foldkit"
import { expect, test } from "vitest"

import { ChangedUrl, ClickedLink } from "./app/message"
import { Model, init, subscriptions, update, view } from "./main"

Element.prototype.getAnimations = () => []

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 80))

const bootAt = (path: string): void => {
  document.body.innerHTML = '<div id="root"></div>'
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

test("landing renders the BatonFX docs shell", async () => {
  bootAt("/")
  await settle()

  expect(document.body.textContent).toContain("BatonFX")
  expect(document.body.textContent).toContain("A standalone agent loop over Effect AI")
  expect(document.body.textContent).toContain("Package pages")
})

test("docs pages render", async () => {
  bootAt("/docs/core/agent-loop")
  await settle()

  expect(document.body.textContent).toContain("Core agent loop")
  expect(document.body.textContent).toContain("Exports")
  expect(document.body.textContent).toContain("ToolExecutor")

  bootAt("/docs/packages/foldkit")
  await settle()

  expect(document.body.textContent).toContain("FoldKit adapter")
  expect(document.body.textContent).toContain("@batonfx/foldkit adapts Baton transport")
  expect(document.body.textContent).toContain("Chat")
})

test("command palette opens from shortcut", async () => {
  bootAt("/")
  await settle()

  const paletteSelector = 'input[placeholder="Search Baton docs…"]'
  expect(document.querySelector(paletteSelector)).toBeNull()

  window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }))
  await settle()

  expect(document.querySelector(paletteSelector)).not.toBeNull()
  expect(document.body.textContent).toContain("Core agent loop")
})
