import type { Html } from "foldkit/html"
import { html } from "@/lib/html"

import { type SlotConfig, cn } from "@/lib/styles"

// VIEW

export type SeparatorConfig<ParentMessage> = SlotConfig<ParentMessage> &
  Readonly<{
    orientation?: "horizontal" | "vertical"
  }>

export const separator = <ParentMessage>(config: SeparatorConfig<ParentMessage>): Html => {
  const h = html<ParentMessage>()
  const orientation = config.orientation ?? "horizontal"
  return h.div(
    [
      ...(config.attributes ?? []),
      h.Attribute("role", "none"),
      h.DataAttribute("slot", "separator"),
      h.DataAttribute("orientation", orientation),
      h.Class(
        cn(
          "shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px",
          config.class,
        ),
      ),
    ],
    [],
  )
}
