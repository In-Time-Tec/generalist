import type { Html } from "foldkit/html"
import { html } from "@/lib/html"
import { dual } from "effect/Function"

import { type SlotConfig, cn } from "@/lib/styles"

// VIEW

export type ScrollAreaConfig<ParentMessage> = SlotConfig<ParentMessage> &
  Readonly<{
    fade?: boolean
  }>

export const scrollArea: {
  <ParentMessage>(config: ScrollAreaConfig<ParentMessage>, children: ReadonlyArray<Html | string>): Html
  <ParentMessage>(children: ReadonlyArray<Html | string>): (config: ScrollAreaConfig<ParentMessage>) => Html
} = dual(2, <ParentMessage>(config: ScrollAreaConfig<ParentMessage>, children: ReadonlyArray<Html | string>): Html => {
  const h = html<ParentMessage>()
  return h.div(
    [
      ...(config.attributes ?? []),
      h.DataAttribute("slot", "scroll-area"),
      h.Class(
        cn(
          "relative size-full overflow-auto rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1",
          config.fade === true && "scroll-fade",
          config.class,
        ),
      ),
    ],
    [...children],
  )
})
