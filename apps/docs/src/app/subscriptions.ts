import { Stream } from "effect"
import { Subscription } from "foldkit"

import { PressedSearchShortcut, type Message } from "./message"
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

export const subscriptions = Subscription.aggregate<Model, Message>()(searchShortcut)
