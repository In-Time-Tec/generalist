import { Effect, HashSet, MutableRef, Queue, Schema, Stream } from "effect"
import { Render, Subscription } from "foldkit"

import { pageByPath } from "../content/registry"
import { toPath } from "../route/route"
import { ChangedActiveSection, ChangedSystemTheme, PressedSearchShortcut, type Message } from "./message"
import type { Model } from "./model"

const isSearchChord = (event: KeyboardEvent): boolean =>
  (event.key === "k" || event.key === "K") && (event.metaKey || event.ctrlKey)

const searchShortcut = Subscription.make<Model, Message>()(() => ({
  searchShortcut: Subscription.persistent(
    Subscription.fromEvent<KeyboardEvent, KeyboardEvent>({
      target: window,
      type: "keydown",
      toMessage: (event) => {
        if (isSearchChord(event)) {
          event.preventDefault()
        }
        return event
      },
    }).pipe(
      Stream.filter(isSearchChord),
      Stream.map(() => PressedSearchShortcut()),
    ),
  ),
}))

const systemTheme = Subscription.make<Model, Message>()((entry) => ({
  systemTheme: entry(
    { isSystemPreference: Schema.Boolean },
    {
      modelToDependencies: (model) => ({ isSystemPreference: model.themePreference === "System" }),
      dependenciesToStream: ({ isSystemPreference }) =>
        Stream.when(
          Stream.callback<typeof ChangedSystemTheme.Type>((queue) =>
            Effect.acquireRelease(
              Effect.sync(() => {
                const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
                const handler = (event: MediaQueryListEvent) => {
                  Queue.offerUnsafe(queue, ChangedSystemTheme({ theme: event.matches ? "Dark" : "Light" }))
                }
                mediaQuery.addEventListener("change", handler)
                return { mediaQuery, handler }
              }),
              ({ mediaQuery, handler }) => Effect.sync(() => mediaQuery.removeEventListener("change", handler)),
            ).pipe(Effect.flatMap(() => Effect.never)),
          ),
          Effect.sync(() => isSystemPreference && typeof window.matchMedia === "function"),
        ),
    },
  ),
}))

const SECTION_OBSERVER_ROOT_MARGIN = "-100px 0px -80% 0px"

const activeSection = Subscription.make<Model, Message>()((entry) => ({
  activeSection: entry(
    {
      path: Schema.String,
      sections: Schema.Array(Schema.String),
    },
    {
      modelToDependencies: (model) => {
        const path = toPath(model.route)
        const toc = pageByPath.get(path)?.toc ?? []
        return { path, sections: toc.map(({ id }) => id) }
      },
      dependenciesToStream: ({ sections }) =>
        Stream.callback<typeof ChangedActiveSection.Type>((queue) =>
          Effect.gen(function* () {
            if (sections.length === 0 || typeof IntersectionObserver === "undefined") {
              return yield* Effect.never
            }

            yield* Render.afterCommit

            yield* Effect.acquireRelease(
              Effect.sync(() => {
                const visibleSections = MutableRef.make(HashSet.empty<string>())
                const observer = new IntersectionObserver(
                  (observed) => {
                    for (const { isIntersecting, target } of observed) {
                      if (isIntersecting) {
                        MutableRef.update(visibleSections, HashSet.add(target.id))
                      } else {
                        MutableRef.update(visibleSections, HashSet.remove(target.id))
                      }
                    }
                    const activeSectionId = sections.find((sectionId) =>
                      HashSet.has(MutableRef.get(visibleSections), sectionId),
                    )
                    if (activeSectionId !== undefined) {
                      Queue.offerUnsafe(queue, ChangedActiveSection({ sectionId: activeSectionId }))
                    }
                  },
                  { rootMargin: SECTION_OBSERVER_ROOT_MARGIN },
                )
                for (const sectionId of sections) {
                  const element = document.getElementById(sectionId)
                  if (element !== null) {
                    observer.observe(element)
                  }
                }
                return observer
              }),
              (observer) => Effect.sync(() => observer.disconnect()),
            )

            return yield* Effect.never
          }),
        ),
    },
  ),
}))

export const subscriptions = Subscription.aggregate<Model, Message>()(searchShortcut, systemTheme, activeSection)
