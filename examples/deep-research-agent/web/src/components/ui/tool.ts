import { Function } from "effect"
import { cva } from "class-variance-authority"
import type { Html } from "foldkit/html"
import { html } from "@/lib/html"

import { badge } from "@/components/ui/badge"
import type { SlotConfig } from "@/lib/utils"
import { cn } from "@/lib/utils"

// VIEW

const iconAttributes = <ParentMessage>(className: string) => {
  const h = html<ParentMessage>()
  return [
    h.Attribute("xmlns", "http://www.w3.org/2000/svg"),
    h.Attribute("viewBox", "0 0 24 24"),
    h.Attribute("fill", "none"),
    h.Attribute("stroke", "currentColor"),
    h.Attribute("stroke-width", "2"),
    h.Attribute("stroke-linecap", "round"),
    h.Attribute("stroke-linejoin", "round"),
    h.AriaHidden(true),
    h.Class(className),
  ]
}

const wrenchIcon = <ParentMessage>(): Html => {
  const h = html<ParentMessage>()
  return h.svg(iconAttributes<ParentMessage>("size-4 text-muted-foreground"), [
    h.path(
      [
        h.Attribute(
          "d",
          "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z",
        ),
      ],
      [],
    ),
  ])
}

const chevronDownIcon = <ParentMessage>(isOpen: boolean): Html => {
  const h = html<ParentMessage>()
  return h.svg(
    iconAttributes<ParentMessage>(
      cn("size-4 text-muted-foreground transition-transform", isOpen ? "rotate-180" : "rotate-0"),
    ),
    [h.path([h.Attribute("d", "m6 9 6 6 6-6")], [])],
  )
}

const circleIcon = <ParentMessage>(): Html => {
  const h = html<ParentMessage>()
  return h.svg(iconAttributes<ParentMessage>("size-4"), [
    h.circle([h.Attribute("cx", "12"), h.Attribute("cy", "12"), h.Attribute("r", "10")], []),
  ])
}

const clockIcon = <ParentMessage>(): Html => {
  const h = html<ParentMessage>()
  return h.svg(iconAttributes<ParentMessage>("size-4"), [
    h.circle([h.Attribute("cx", "12"), h.Attribute("cy", "12"), h.Attribute("r", "10")], []),
    h.path([h.Attribute("d", "M12 6v6l4 2")], []),
  ])
}

const circleCheckIcon = <ParentMessage>(): Html => {
  const h = html<ParentMessage>()
  return h.svg(iconAttributes<ParentMessage>("size-4"), [
    h.circle([h.Attribute("cx", "12"), h.Attribute("cy", "12"), h.Attribute("r", "10")], []),
    h.path([h.Attribute("d", "m9 12 2 2 4-4")], []),
  ])
}

const circleXIcon = <ParentMessage>(): Html => {
  const h = html<ParentMessage>()
  return h.svg(iconAttributes<ParentMessage>("size-4"), [
    h.circle([h.Attribute("cx", "12"), h.Attribute("cy", "12"), h.Attribute("r", "10")], []),
    h.path([h.Attribute("d", "m15 9-6 6")], []),
    h.path([h.Attribute("d", "m9 9 6 6")], []),
  ])
}

export type ToolStatus = "input-streaming" | "input-available" | "output-available" | "output-error"

export const toolStatusBadgeVariants = cva("gap-1.5 rounded-full text-xs", {
  variants: {
    status: {
      "input-streaming": "",
      "input-available": "[&>svg]:animate-pulse",
      "output-available": "[&>svg]:text-green-600",
      "output-error": "[&>svg]:text-red-600",
    },
  },
})

const statusLabels: Record<ToolStatus, string> = {
  "input-streaming": "Pending",
  "input-available": "Running",
  "output-available": "Completed",
  "output-error": "Error",
}

const statusIcon = <ParentMessage>(status: ToolStatus): Html => {
  const icons: Record<ToolStatus, () => Html> = {
    "input-streaming": () => circleIcon<ParentMessage>(),
    "input-available": () => clockIcon<ParentMessage>(),
    "output-available": () => circleCheckIcon<ParentMessage>(),
    "output-error": () => circleXIcon<ParentMessage>(),
  }
  // Tool-call statuses come from streaming LLM events cast to ToolStatus at
  // that boundary; degrade to the neutral pending icon rather than crashing
  // the render if an unexpected status slips through.
  return (icons[status] ?? icons["input-streaming"])()
}

/** Status pill composing the badge component, with the tool-call state's icon, label, and color. */
export const toolStatusBadge = <ParentMessage>(status: ToolStatus): Html =>
  badge<ParentMessage>({ variant: "secondary", class: toolStatusBadgeVariants({ status }) }, [
    statusIcon<ParentMessage>(status),
    statusLabels[status] ?? status,
  ])

/**
 * Collapsible tool-call block. Uses the simple accordion pattern: the
 * consumer keeps an `isOpen` boolean in its Model, flips it on the header's
 * `onToggled`, and renders `toolContent` conditionally.
 */
export const tool: {
  <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html>): Html
  <ParentMessage>(children: ReadonlyArray<Html>): (config: SlotConfig<ParentMessage>) => Html
} = Function.dual(2, <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html>): Html => {
  const h = html<ParentMessage>()
  return h.div(
    [
      ...(config.attributes ?? []),
      h.DataAttribute("slot", "tool"),
      h.Class(cn("not-prose mb-4 w-full rounded-md border", config.class)),
    ],
    [...children],
  )
})

export type ToolHeaderConfig<ParentMessage> = SlotConfig<ParentMessage> &
  Readonly<{
    name: string
    status: ToolStatus
    isOpen: boolean
    onToggled: ParentMessage
  }>

/** Header trigger: wrench icon, tool name, status badge, and a chevron that flips with `isOpen`. */
export const toolHeader = <ParentMessage>(config: ToolHeaderConfig<ParentMessage>): Html => {
  const h = html<ParentMessage>()
  return h.button(
    [
      h.Type("button"),
      h.OnClick(config.onToggled),
      h.AriaExpanded(config.isOpen),
      ...(config.attributes ?? []),
      h.DataAttribute("slot", "tool-header"),
      h.DataAttribute("state", config.isOpen ? "open" : "closed"),
      h.Class(cn("flex w-full items-center justify-between gap-4 p-3", config.class)),
    ],
    [
      h.div(
        [h.Class("flex items-center gap-2")],
        [
          wrenchIcon<ParentMessage>(),
          h.span([h.Class("text-sm font-medium")], [config.name]),
          toolStatusBadge<ParentMessage>(config.status),
        ],
      ),
      chevronDownIcon<ParentMessage>(config.isOpen),
    ],
  )
}

/** Tool body holding the input and output sections. Render it conditionally on the consumer's `isOpen` state. */
export const toolContent: {
  <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html>): Html
  <ParentMessage>(children: ReadonlyArray<Html>): (config: SlotConfig<ParentMessage>) => Html
} = Function.dual(2, <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html>): Html => {
  const h = html<ParentMessage>()
  return h.div(
    [
      ...(config.attributes ?? []),
      h.DataAttribute("slot", "tool-content"),
      h.Class(cn("space-y-4 p-4 text-popover-foreground outline-none", config.class)),
    ],
    [...children],
  )
})

/**
 * Parameters section: renders `code` (typically pretty-printed JSON) in a
 * pre-formatted block. AI Elements uses a syntax-highlighted CodeBlock here;
 * foldcn has no code-block component (gap), so this is a plain `pre`.
 */
export const toolInput: {
  <ParentMessage>(config: SlotConfig<ParentMessage>, code: string): Html
  <ParentMessage>(code: string): (config: SlotConfig<ParentMessage>) => Html
} = Function.dual(2, <ParentMessage>(config: SlotConfig<ParentMessage>, code: string): Html => {
  const h = html<ParentMessage>()
  return h.div(
    [
      ...(config.attributes ?? []),
      h.DataAttribute("slot", "tool-input"),
      h.Class(cn("space-y-2 overflow-hidden", config.class)),
    ],
    [
      h.h4([h.Class("text-xs font-medium tracking-wide text-muted-foreground uppercase")], ["Parameters"]),
      h.div(
        [h.Class("rounded-md bg-muted/50")],
        [h.pre([h.Class("overflow-x-auto p-4 text-xs")], [h.code([], [code])])],
      ),
    ],
  )
})

export type ToolOutputConfig<ParentMessage> = SlotConfig<ParentMessage> &
  Readonly<{
    isError?: boolean
  }>

/**
 * Result section. Pass the rendered output (or the error text) as children;
 * `isError: true` switches the heading to "Error" and the destructive tint.
 */
export const toolOutput: {
  <ParentMessage>(config: ToolOutputConfig<ParentMessage>, children: ReadonlyArray<Html | string>): Html
  <ParentMessage>(children: ReadonlyArray<Html | string>): (config: ToolOutputConfig<ParentMessage>) => Html
} = Function.dual(
  2,
  <ParentMessage>(config: ToolOutputConfig<ParentMessage>, children: ReadonlyArray<Html | string>): Html => {
    const h = html<ParentMessage>()
    const isError = config.isError ?? false
    return h.div(
      [...(config.attributes ?? []), h.DataAttribute("slot", "tool-output"), h.Class(cn("space-y-2", config.class))],
      [
        h.h4(
          [h.Class("text-xs font-medium tracking-wide text-muted-foreground uppercase")],
          [isError ? "Error" : "Result"],
        ),
        h.div(
          [
            h.Class(
              cn(
                "overflow-x-auto rounded-md text-xs [&_table]:w-full",
                isError ? "bg-destructive/10 text-destructive" : "bg-muted/50 text-foreground",
              ),
            ),
          ],
          [...children],
        ),
      ],
    )
  },
)
