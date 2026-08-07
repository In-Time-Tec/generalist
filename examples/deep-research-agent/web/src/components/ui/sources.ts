import { Function } from "effect"
import type { Html } from "foldkit/html"
import { html } from "foldkit/html"

import type { SlotConfig } from "@/lib/utils"
import { cn } from "@/lib/utils"

// VIEW

const bookIcon = <ParentMessage>(): Html => {
  const h = html<ParentMessage>()
  return h.svg(
    [
      h.Attribute("xmlns", "http://www.w3.org/2000/svg"),
      h.Attribute("viewBox", "0 0 24 24"),
      h.Attribute("fill", "none"),
      h.Attribute("stroke", "currentColor"),
      h.Attribute("stroke-width", "2"),
      h.Attribute("stroke-linecap", "round"),
      h.Attribute("stroke-linejoin", "round"),
      h.AriaHidden(true),
      h.Class("size-4"),
    ],
    [
      h.path(
        [h.Attribute("d", "M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20")],
        [],
      ),
    ],
  )
}

const chevronDownIcon = <ParentMessage>(isOpen: boolean): Html => {
  const h = html<ParentMessage>()
  return h.svg(
    [
      h.Attribute("xmlns", "http://www.w3.org/2000/svg"),
      h.Attribute("viewBox", "0 0 24 24"),
      h.Attribute("fill", "none"),
      h.Attribute("stroke", "currentColor"),
      h.Attribute("stroke-width", "2"),
      h.Attribute("stroke-linecap", "round"),
      h.Attribute("stroke-linejoin", "round"),
      h.AriaHidden(true),
      h.Class(cn("size-4 transition-transform", isOpen ? "rotate-180" : "rotate-0")),
    ],
    [h.path([h.Attribute("d", "m6 9 6 6 6-6")], [])],
  )
}

/**
 * Collapsible list of the sources a response used. Uses the simple accordion
 * pattern: the consumer keeps an `isOpen` boolean in its Model, flips it on
 * the trigger's `onToggled`, and renders `sourcesContent` conditionally.
 */
export const sources: {
  <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html>): Html
  <ParentMessage>(children: ReadonlyArray<Html>): (config: SlotConfig<ParentMessage>) => Html
} = Function.dual(2, <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html>): Html => {
  const h = html<ParentMessage>()
  return h.div(
    [
      ...(config.attributes ?? []),
      h.DataAttribute("slot", "sources"),
      h.Class(cn("not-prose mb-4 text-xs text-primary", config.class)),
    ],
    [...children],
  )
})

export type SourcesTriggerConfig<ParentMessage> = SlotConfig<ParentMessage> &
  Readonly<{
    count: number
    isOpen: boolean
    onToggled: ParentMessage
  }>

/** Trigger row reading "Used N sources" with a chevron that flips with `isOpen`. Children replace the default row. */
export const sourcesTrigger: {
  <ParentMessage>(config: SourcesTriggerConfig<ParentMessage>, children?: ReadonlyArray<Html | string>): Html
  <ParentMessage>(children?: ReadonlyArray<Html | string>): (config: SourcesTriggerConfig<ParentMessage>) => Html
} = Function.dual(
  (args) => args.length > 0 && !Array.isArray(args[0]),
  <ParentMessage>(config: SourcesTriggerConfig<ParentMessage>, children: ReadonlyArray<Html | string> = []): Html => {
    const h = html<ParentMessage>()
    const defaultChildren: ReadonlyArray<Html> = [
      h.span([h.Class("font-medium")], [`Used ${config.count} sources`]),
      chevronDownIcon<ParentMessage>(config.isOpen),
    ]
    return h.button(
      [
        h.Type("button"),
        h.OnClick(config.onToggled),
        h.AriaExpanded(config.isOpen),
        ...(config.attributes ?? []),
        h.DataAttribute("slot", "sources-trigger"),
        h.DataAttribute("state", config.isOpen ? "open" : "closed"),
        h.Class(cn("flex items-center gap-2", config.class)),
      ],
      children.length > 0 ? [...children] : defaultChildren,
    )
  },
)

/** Column of source links. Render it conditionally on the consumer's `isOpen` state. */
export const sourcesContent: {
  <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html>): Html
  <ParentMessage>(children: ReadonlyArray<Html>): (config: SlotConfig<ParentMessage>) => Html
} = Function.dual(2, <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html>): Html => {
  const h = html<ParentMessage>()
  return h.div(
    [
      ...(config.attributes ?? []),
      h.DataAttribute("slot", "sources-content"),
      h.Class(cn("mt-3 flex w-fit flex-col gap-2 outline-none", config.class)),
    ],
    [...children],
  )
})

export type SourceConfig<ParentMessage> = SlotConfig<ParentMessage> &
  Readonly<{
    href: string
    title?: string
  }>

/** One source link row: a book icon and the source title, opening in a new tab. Children replace the default row. */
export const source: {
  <ParentMessage>(config: SourceConfig<ParentMessage>, children?: ReadonlyArray<Html | string>): Html
  <ParentMessage>(children?: ReadonlyArray<Html | string>): (config: SourceConfig<ParentMessage>) => Html
} = Function.dual(
  (args) => args.length > 0 && !Array.isArray(args[0]),
  <ParentMessage>(config: SourceConfig<ParentMessage>, children: ReadonlyArray<Html | string> = []): Html => {
    const h = html<ParentMessage>()
    const defaultChildren: ReadonlyArray<Html> = [
      bookIcon<ParentMessage>(),
      h.span([h.Class("block font-medium")], [config.title ?? config.href]),
    ]
    return h.a(
      [
        h.Href(config.href),
        h.Target("_blank"),
        h.Rel("noreferrer"),
        ...(config.attributes ?? []),
        h.DataAttribute("slot", "source"),
        h.Class(cn("flex items-center gap-2", config.class)),
      ],
      children.length > 0 ? [...children] : defaultChildren,
    )
  },
)
