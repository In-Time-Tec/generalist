import type { Html } from "foldkit/html"
import { html } from "foldkit/html"

import type { SlotConfig } from "@/lib/utils"
import { cn } from "@/lib/utils"

// VIEW

const part =
  (slot: string, baseClass: string) =>
  <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html | string>): Html => {
    const h = html<ParentMessage>()
    return h.div(
      [...(config.attributes ?? []), h.DataAttribute("slot", slot), h.Class(cn(baseClass, config.class))],
      [...children],
    )
  }

export const card = part("card", "flex flex-col gap-6 rounded-xl border bg-card py-6 text-card-foreground shadow-sm")

export const cardHeader = part(
  "card-header",
  "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
)

export const cardTitle = part("card-title", "leading-none font-semibold")

export const cardDescription = part("card-description", "text-sm text-muted-foreground")

export const cardAction = part("card-action", "col-start-2 row-span-2 row-start-1 self-start justify-self-end")

export const cardContent = part("card-content", "px-6")

export const cardFooter = part("card-footer", "flex items-center px-6 [.border-t]:pt-6")
