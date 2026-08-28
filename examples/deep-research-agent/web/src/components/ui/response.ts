import { Function } from "effect"
import type { Html } from "foldkit/html"
import { html } from "@/lib/html"

import { cn, type SlotConfig } from "@/lib/styling"

// VIEW

/**
 * Container for a rendered assistant response. AI Elements renders markdown
 * through Streamdown here; FoldKit has no markdown renderer (gap), so this
 * port ships the container styling only and the consumer supplies
 * already-rendered children (or plain text through `responseText`).
 */
export const response: {
  <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html | string>): Html
  <ParentMessage>(children: ReadonlyArray<Html | string>): (config: SlotConfig<ParentMessage>) => Html
} = Function.dual(
  2,
  <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html | string>): Html => {
    const h = html<ParentMessage>()
    return h.div(
      [
        ...(config.attributes ?? []),
        h.DataAttribute("slot", "response"),
        h.Class(cn("size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0", config.class)),
      ],
      [...children],
    )
  },
)

/** Plain streamed text convenience: renders the raw text with preserved whitespace and line breaks. */
export const responseText: {
  <ParentMessage>(config: SlotConfig<ParentMessage>, text: string): Html
  <ParentMessage>(text: string): (config: SlotConfig<ParentMessage>) => Html
} = Function.dual(2, <ParentMessage>(config: SlotConfig<ParentMessage>, text: string): Html => {
  const h = html<ParentMessage>()
  return h.div(
    [
      ...(config.attributes ?? []),
      h.DataAttribute("slot", "response-text"),
      h.Class(cn("whitespace-pre-wrap", config.class)),
    ],
    [text],
  )
})
