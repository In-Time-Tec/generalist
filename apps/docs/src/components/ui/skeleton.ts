import type { Html } from "foldkit/html"
import { html } from "@/lib/html"

import { type SlotConfig, cn } from "@/lib/styles"

// VIEW

export const skeleton = <ParentMessage>(config: SlotConfig<ParentMessage>): Html => {
  const h = html<ParentMessage>()
  return h.div(
    [
      ...(config.attributes ?? []),
      h.DataAttribute("slot", "skeleton"),
      h.Class(cn("animate-pulse rounded-md bg-accent", config.class)),
    ],
    [],
  )
}
