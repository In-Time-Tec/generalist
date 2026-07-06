import type { Html } from "foldkit/html"
import { html } from "foldkit/html"

import type { SlotConfig } from "@/lib/utils"
import { cn } from "@/lib/utils"

// VIEW

const chevronRightIcon = <ParentMessage>(): Html => {
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
    ],
    [h.path([h.Attribute("d", "m9 18 6-6-6-6")], [])],
  )
}

const moreHorizontalIcon = <ParentMessage>(): Html => {
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
      h.Class("size-4"),
    ],
    [
      h.circle([h.Attribute("cx", "12"), h.Attribute("cy", "12"), h.Attribute("r", "1")], []),
      h.circle([h.Attribute("cx", "19"), h.Attribute("cy", "12"), h.Attribute("r", "1")], []),
      h.circle([h.Attribute("cx", "5"), h.Attribute("cy", "12"), h.Attribute("r", "1")], []),
    ],
  )
}

export const breadcrumb = <ParentMessage>(
  config: SlotConfig<ParentMessage>,
  children: ReadonlyArray<Html | string>,
): Html => {
  const h = html<ParentMessage>()
  return h.nav(
    [
      ...(config.attributes ?? []),
      h.AriaLabel("breadcrumb"),
      h.DataAttribute("slot", "breadcrumb"),
      h.Class(cn(config.class)),
    ],
    [...children],
  )
}

export const breadcrumbList = <ParentMessage>(
  config: SlotConfig<ParentMessage>,
  children: ReadonlyArray<Html | string>,
): Html => {
  const h = html<ParentMessage>()
  return h.ol(
    [
      ...(config.attributes ?? []),
      h.DataAttribute("slot", "breadcrumb-list"),
      h.Class(
        cn("flex flex-wrap items-center gap-1.5 text-sm break-words text-muted-foreground sm:gap-2.5", config.class),
      ),
    ],
    [...children],
  )
}

export const breadcrumbItem = <ParentMessage>(
  config: SlotConfig<ParentMessage>,
  children: ReadonlyArray<Html | string>,
): Html => {
  const h = html<ParentMessage>()
  return h.li(
    [
      ...(config.attributes ?? []),
      h.DataAttribute("slot", "breadcrumb-item"),
      h.Class(cn("inline-flex items-center gap-1.5", config.class)),
    ],
    [...children],
  )
}

export type BreadcrumbLinkConfig<ParentMessage> = SlotConfig<ParentMessage> &
  Readonly<{
    href?: string
  }>

export const breadcrumbLink = <ParentMessage>(
  config: BreadcrumbLinkConfig<ParentMessage>,
  children: ReadonlyArray<Html | string>,
): Html => {
  const h = html<ParentMessage>()
  return h.a(
    [
      ...(config.href === undefined ? [] : [h.Href(config.href)]),
      ...(config.attributes ?? []),
      h.DataAttribute("slot", "breadcrumb-link"),
      h.Class(cn("transition-colors hover:text-foreground", config.class)),
    ],
    [...children],
  )
}

export const breadcrumbPage = <ParentMessage>(
  config: SlotConfig<ParentMessage>,
  children: ReadonlyArray<Html | string>,
): Html => {
  const h = html<ParentMessage>()
  return h.span(
    [
      ...(config.attributes ?? []),
      h.Attribute("role", "link"),
      h.AriaDisabled(true),
      h.AriaCurrent("page"),
      h.DataAttribute("slot", "breadcrumb-page"),
      h.Class(cn("font-normal text-foreground", config.class)),
    ],
    [...children],
  )
}

export const breadcrumbSeparator = <ParentMessage>(
  config: SlotConfig<ParentMessage>,
  children?: ReadonlyArray<Html | string>,
): Html => {
  const h = html<ParentMessage>()
  return h.li(
    [
      ...(config.attributes ?? []),
      h.Attribute("role", "presentation"),
      h.AriaHidden(true),
      h.DataAttribute("slot", "breadcrumb-separator"),
      h.Class(cn("[&>svg]:size-3.5", config.class)),
    ],
    children === undefined ? [chevronRightIcon<ParentMessage>()] : [...children],
  )
}

export const breadcrumbEllipsis = <ParentMessage>(config: SlotConfig<ParentMessage>): Html => {
  const h = html<ParentMessage>()
  return h.span(
    [
      ...(config.attributes ?? []),
      h.Attribute("role", "presentation"),
      h.AriaHidden(true),
      h.DataAttribute("slot", "breadcrumb-ellipsis"),
      h.Class(cn("flex size-9 items-center justify-center", config.class)),
    ],
    [moreHorizontalIcon<ParentMessage>(), h.span([h.Class("sr-only")], ["More"])],
  )
}
