import type { Html } from "foldkit/html"
import { html } from "foldkit/html"

import { cn } from "@/lib/utils"

import { SelectedThemePreference, type Message } from "../app/message"
import type { ThemePreference } from "../app/model"
import { computer, moon, sun } from "./icon"

const h = html<Message>()

const themeSelectorButton = (
  preference: ThemePreference,
  activePreference: ThemePreference,
  icon: Html,
  label: string,
): Html => {
  const isActive = preference === activePreference
  return h.button(
    [
      h.AriaPressed(isActive.toString()),
      h.AriaLabel(label),
      h.OnClick(SelectedThemePreference({ preference })),
      h.Class(
        cn(
          "cursor-pointer rounded-md p-2 transition",
          isActive
            ? "bg-gray-300 text-gray-900 dark:bg-gray-600 dark:text-white"
            : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200",
        ),
      ),
    ],
    [icon],
  )
}

export const themeSelector = (activePreference: ThemePreference): Html =>
  h.div(
    [
      h.Role("group"),
      h.AriaLabel("Theme preference"),
      h.Class(
        "flex items-center gap-0.5 rounded-lg border border-gray-300 bg-gray-100 p-0.5 dark:border-gray-700 dark:bg-gray-800",
      ),
    ],
    [
      themeSelectorButton("Light", activePreference, sun("size-4"), "Light mode"),
      themeSelectorButton("System", activePreference, computer("size-4"), "System mode"),
      themeSelectorButton("Dark", activePreference, moon("size-4"), "Dark mode"),
    ],
  )
