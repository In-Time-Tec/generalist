import { Effect, Schema } from "effect"
import { Command, Dom, Mount, Navigation } from "foldkit"
import { afterCommit } from "foldkit/render"
import { m } from "foldkit/message"
import { codeExamples } from "./content"

export const Theme = Schema.Literals(["system", "light", "dark"])
export type Theme = typeof Theme.Type
export const EffectCompleted = m("EffectCompleted")
export const FinishedCopy = m("FinishedCopy", { id: Schema.String, failed: Schema.Boolean })
export const LoadedPreferences = m("LoadedPreferences", { theme: Theme, reducedMotion: Schema.Boolean })

export const CopyCode = Command.define("CopyCode", {
  args: { id: Schema.String },
  messages: [FinishedCopy],
  execute: ({ id }) =>
    Effect.tryPromise(() =>
      navigator.clipboard.writeText(codeExamples.find((example) => example.id === id)?.source.trim() ?? ""),
    ).pipe(
      Effect.as(FinishedCopy({ id, failed: false })),
      Effect.orElseSucceed(() => FinishedCopy({ id, failed: true })),
    ),
})

export const ReadPreferences = Command.define("ReadPreferences", {
  messages: [LoadedPreferences],
  execute: Effect.sync(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches).pipe(
    Effect.flatMap((reducedMotion) =>
      Effect.try(() => localStorage.getItem("generalist-theme")).pipe(
        Effect.map((stored) =>
          LoadedPreferences({ theme: Schema.is(Theme)(stored) ? stored : "system", reducedMotion }),
        ),
        Effect.orElseSucceed(() => LoadedPreferences({ theme: "system", reducedMotion })),
      ),
    ),
  ),
})

export const PersistTheme = Command.define("PersistTheme", {
  args: { theme: Theme },
  messages: [EffectCompleted],
  execute: ({ theme }) =>
    Effect.try(() => localStorage.setItem("generalist-theme", theme)).pipe(Effect.ignore, Effect.as(EffectCompleted())),
})

export const Navigate = Command.define("Navigate", {
  args: { href: Schema.String, external: Schema.Boolean },
  messages: [EffectCompleted],
  execute: ({ href, external }) =>
    (external ? Navigation.load(href) : Navigation.pushUrl(href)).pipe(Effect.as(EffectCompleted())),
})

export const FocusArticle = Command.define("FocusArticle", {
  args: { hash: Schema.String },
  messages: [EffectCompleted],
  execute: ({ hash }) =>
    Effect.gen(function* () {
      const selector = hash.length > 0 ? `#${CSS.escape(hash)}` : "#article"
      yield* Dom.scrollIntoViewAfterPaint(selector, { block: "start" }).pipe(Effect.ignore)
      yield* Dom.focus(selector, { preventScroll: true, makeFocusable: true }).pipe(Effect.ignore)
      return EffectCompleted()
    }),
})

export const SyncDialog = Command.define("SyncDialog", {
  args: { id: Schema.String },
  messages: [EffectCompleted],
  execute: ({ id }) =>
    Effect.gen(function* () {
      yield* afterCommit
      yield* Effect.sync(() => {
        const dialog = document.getElementById(id)
        if (!(dialog instanceof HTMLDialogElement)) return
        const present = dialog.dataset.present === "true"
        if (present && !dialog.open) {
          dialog.showModal()
          dialog.querySelector<HTMLInputElement>("input")?.focus()
        }
        if (!present && dialog.open) {
          dialog.close()
          const focus = dialog.dataset.focusAfterClose
          if (focus !== undefined && focus.length > 0) document.getElementById(focus)?.focus({ preventScroll: true })
        }
      })
      return EffectCompleted()
    }),
})

export const ScrollSearchResult = Command.define("ScrollSearchResult", {
  args: { id: Schema.String },
  messages: [EffectCompleted],
  execute: ({ id }) =>
    Dom.scrollIntoView(`#${id}`, { block: "nearest" }).pipe(Effect.ignore, Effect.as(EffectCompleted())),
})

export const DialogLifetime = Mount.define(
  "DialogLifetime",
  EffectCompleted,
)((element) =>
  Effect.addFinalizer(() =>
    Effect.sync(() => {
      if (element instanceof HTMLDialogElement && element.open) element.close()
    }),
  ).pipe(Effect.as(EffectCompleted())),
)
