import type { Html } from "foldkit/html"
import { html } from "@/lib/html"

import { cn, type SlotConfig } from "@/lib/styling"

// VIEW

export type SpinnerConfig<ParentMessage> = SlotConfig<ParentMessage> &
  Readonly<{
    // Overrides the stamped `data-slot`. Composing wrappers (e.g. `loader`)
    // set this so their own slot survives instead of the default "spinner".
    dataSlot?: string
  }>

export const spinner = <ParentMessage>(config: SpinnerConfig<ParentMessage>): Html => {
  const h = html<ParentMessage>()
  const { dataSlot = "spinner" } = config
  return h.svg(
    [
      h.Attribute("xmlns", "http://www.w3.org/2000/svg"),
      h.Attribute("viewBox", "0 0 24 24"),
      h.Attribute("fill", "none"),
      h.Attribute("stroke", "currentColor"),
      h.Attribute("stroke-width", "2"),
      h.Attribute("stroke-linecap", "round"),
      h.Attribute("stroke-linejoin", "round"),
      ...(config.attributes ?? []),
      h.DataAttribute("slot", dataSlot),
      h.Attribute("role", "status"),
      h.AriaLabel("Loading"),
      h.Class(cn("size-4 animate-spin", config.class)),
    ],
    [h.path([h.Attribute("d", "M21 12a9 9 0 1 1-6.219-8.56")], [])],
  )
}
