import type { Html } from "foldkit/html"
import { html } from "foldkit/html"

import type { SlotConfig } from "@/lib/utils"
import { cn } from "@/lib/utils"

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
