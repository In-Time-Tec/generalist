import type { Html } from "foldkit/html"
import { html } from "@/lib/html"

import { spinner } from "@/components/ui/spinner"
import { cn, type SlotConfig } from "@/lib/styling"

// VIEW

export type LoaderConfig<ParentMessage> = SlotConfig<ParentMessage> &
  Readonly<{
    size?: number
  }>

/**
 * Spinning loader composing the spinner component. `size` sets the icon's
 * width and height in pixels (defaulting to the spinner's 16px).
 */
export const loader = <ParentMessage>(config: LoaderConfig<ParentMessage>): Html => {
  const h = html<ParentMessage>()
  return spinner({
    class: cn(config.class),
    dataSlot: "loader",
    attributes: [
      ...(config.size === undefined ? [] : [h.Attribute("style", `width: ${config.size}px; height: ${config.size}px`)]),
      ...(config.attributes ?? []),
    ],
  })
}
