import { cva } from "class-variance-authority"
import type { Html } from "foldkit/html"
import { html } from "foldkit/html"
import { dual } from "effect/Function"

import type { SlotConfig } from "@/lib/utils"
import { cn } from "@/lib/utils"

// VIEW

export const navigationMenuTriggerStyle = cva(
  "group inline-flex h-9 w-max items-center justify-center rounded-md bg-background px-4 py-2 text-sm font-medium transition-[color,box-shadow] outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 data-open:bg-accent/50 data-open:text-accent-foreground data-open:hover:bg-accent data-open:focus:bg-accent",
)

const navigationMenuClass = "group/navigation-menu relative flex max-w-max flex-1 items-center justify-center"

const listClass = "group flex flex-1 list-none items-center justify-center gap-1"

const itemClass = "relative"

const chevronClass = "relative top-[1px] ml-1 size-3 transition duration-300 group-data-[open]:rotate-180"

const contentClass =
  "top-full left-0 z-50 mt-1.5 w-full overflow-hidden rounded-md border bg-popover p-2 pr-2.5 text-popover-foreground shadow duration-200 md:absolute md:w-auto **:data-[slot=navigation-menu-link]:focus:ring-0 **:data-[slot=navigation-menu-link]:focus:outline-none"

const linkClass =
  "flex flex-col gap-1 rounded-sm p-2 text-sm transition-all outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 data-[active]:bg-accent/50 data-[active]:text-accent-foreground data-[active]:hover:bg-accent data-[active]:focus:bg-accent [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground"

const chevronDownIcon = <ParentMessage>(): Html => {
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
      h.Class(chevronClass),
    ],
    [h.path([h.Attribute("d", "m6 9 6 6 6-6")], [])],
  )
}

/**
 * Navigation menu container. Unlike shadcn's Radix-backed version, there is
 * no behavior primitive here: open/close state lives in the consumer's Model
 * (an `isOpen` boolean per item or an `openIndex` Option), toggled by the
 * Messages the consumer wires onto each `trigger` and rendered by mounting
 * `content` conditionally. The shared viewport with its morphing size
 * animation is not ported (gap); each item's panel positions itself below its
 * own trigger like shadcn's `viewport={false}` mode.
 */
export const navigationMenu: {
  <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html>): Html
  <ParentMessage>(children: ReadonlyArray<Html>): (config: SlotConfig<ParentMessage>) => Html
} = dual(2, <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html>): Html => {
  const h = html<ParentMessage>()
  return h.nav(
    [
      ...(config.attributes ?? []),
      h.DataAttribute("slot", "navigation-menu"),
      h.Class(cn(navigationMenuClass, config.class)),
    ],
    [...children],
  )
})
export const list: {
  <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html>): Html
  <ParentMessage>(children: ReadonlyArray<Html>): (config: SlotConfig<ParentMessage>) => Html
} = dual(2, <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html>): Html => {
  const h = html<ParentMessage>()
  return h.ul(
    [
      ...(config.attributes ?? []),
      h.DataAttribute("slot", "navigation-menu-list"),
      h.Class(cn(listClass, config.class)),
    ],
    [...children],
  )
})
export const item: {
  <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html>): Html
  <ParentMessage>(children: ReadonlyArray<Html>): (config: SlotConfig<ParentMessage>) => Html
} = dual(2, <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html>): Html => {
  const h = html<ParentMessage>()
  return h.li(
    [
      ...(config.attributes ?? []),
      h.DataAttribute("slot", "navigation-menu-item"),
      h.Class(cn(itemClass, config.class)),
    ],
    [...children],
  )
})
export type TriggerConfig<ParentMessage> = SlotConfig<ParentMessage> &
  Readonly<{
    isOpen: boolean
    onClick: ParentMessage
  }>

/**
 * Navigation menu trigger: a button with a chevron that rotates while open.
 * `isOpen` reflects the consumer's Model; `onClick` is the consumer's toggle
 * Message.
 */
export const trigger: {
  <ParentMessage>(config: TriggerConfig<ParentMessage>, children: ReadonlyArray<Html | string>): Html
  <ParentMessage>(children: ReadonlyArray<Html | string>): (config: TriggerConfig<ParentMessage>) => Html
} = dual(2, <ParentMessage>(config: TriggerConfig<ParentMessage>, children: ReadonlyArray<Html | string>): Html => {
  const h = html<ParentMessage>()
  return h.button(
    [
      h.Type("button"),
      h.AriaExpanded(config.isOpen),
      h.OnClick(config.onClick),
      ...(config.isOpen ? [h.DataAttribute("open", "")] : []),
      ...(config.attributes ?? []),
      h.DataAttribute("slot", "navigation-menu-trigger"),
      h.Class(cn(navigationMenuTriggerStyle(), config.class)),
    ],
    [...children, chevronDownIcon<ParentMessage>()],
  )
})
/**
 * Navigation menu panel, positioned absolutely below its item. Mount it
 * conditionally on the consumer's open state, following the keyed-view rules
 * for stateful children.
 */
export const content: {
  <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html>): Html
  <ParentMessage>(children: ReadonlyArray<Html>): (config: SlotConfig<ParentMessage>) => Html
} = dual(2, <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html>): Html => {
  const h = html<ParentMessage>()
  return h.div(
    [
      ...(config.attributes ?? []),
      h.DataAttribute("slot", "navigation-menu-content"),
      h.Class(cn(contentClass, config.class)),
    ],
    [...children],
  )
})
export type LinkConfig<ParentMessage> = SlotConfig<ParentMessage> &
  Readonly<{
    href?: string
    isActive?: boolean
  }>

export const link: {
  <ParentMessage>(config: LinkConfig<ParentMessage>, children: ReadonlyArray<Html | string>): Html
  <ParentMessage>(children: ReadonlyArray<Html | string>): (config: LinkConfig<ParentMessage>) => Html
} = dual(2, <ParentMessage>(config: LinkConfig<ParentMessage>, children: ReadonlyArray<Html | string>): Html => {
  const h = html<ParentMessage>()
  return h.a(
    [
      ...(config.href === undefined ? [] : [h.Href(config.href)]),
      ...(config.isActive === true ? [h.DataAttribute("active", "")] : []),
      ...(config.attributes ?? []),
      h.DataAttribute("slot", "navigation-menu-link"),
      h.Class(cn(linkClass, config.class)),
    ],
    [...children],
  )
})
