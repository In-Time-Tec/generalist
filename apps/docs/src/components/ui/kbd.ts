import type { Html } from "foldkit/html"
import { html } from "@/lib/html"
import { dual } from "effect/Function"

import { type SlotConfig, cn } from "@/lib/styles"

// VIEW

const kbdClass = cn(
  "pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-sm bg-muted px-1 font-sans text-xs font-medium text-muted-foreground select-none",
  "[&_svg:not([class*='size-'])]:size-3",
  "[[data-slot=tooltip-content]_&]:bg-background/20 [[data-slot=tooltip-content]_&]:text-background dark:[[data-slot=tooltip-content]_&]:bg-background/10",
)

export const kbd: {
  <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html | string>): Html
  <ParentMessage>(children: ReadonlyArray<Html | string>): (config: SlotConfig<ParentMessage>) => Html
} = dual(2, <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html | string>): Html => {
  const h = html<ParentMessage>()
  return h.kbd(
    [...(config.attributes ?? []), h.DataAttribute("slot", "kbd"), h.Class(cn(kbdClass, config.class))],
    [...children],
  )
})
export const kbdGroup: {
  <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html | string>): Html
  <ParentMessage>(children: ReadonlyArray<Html | string>): (config: SlotConfig<ParentMessage>) => Html
} = dual(2, <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html | string>): Html => {
  const h = html<ParentMessage>()
  return h.kbd(
    [
      ...(config.attributes ?? []),
      h.DataAttribute("slot", "kbd-group"),
      h.Class(cn("inline-flex items-center gap-1", config.class)),
    ],
    [...children],
  )
})
