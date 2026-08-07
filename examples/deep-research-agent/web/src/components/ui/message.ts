import { Function } from "effect"
import type { Html } from "foldkit/html"
import { html } from "foldkit/html"

import type { SlotConfig } from "@/lib/utils"
import { cn } from "@/lib/utils"

// VIEW

export type MessageAlign = "start" | "end"

/** Stack of related messages, spacing them tighter than the surrounding conversation. */
export const messageGroup: {
  <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html>): Html
  <ParentMessage>(children: ReadonlyArray<Html>): (config: SlotConfig<ParentMessage>) => Html
} = Function.dual(2, <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html>): Html => {
  const h = html<ParentMessage>()
  return h.div(
    [
      ...(config.attributes ?? []),
      h.DataAttribute("slot", "message-group"),
      h.Class(cn("flex min-w-0 flex-col gap-2", config.class)),
    ],
    [...children],
  )
})

export type MessageConfig<ParentMessage> = SlotConfig<ParentMessage> &
  Readonly<{
    align?: MessageAlign
  }>

/**
 * A single chat turn row. `align: 'end'` reverses the row for the current
 * user's messages (avatar on the right, content flowing from the end edge);
 * the default `'start'` alignment suits assistant or other-party messages.
 */
export const message: {
  <ParentMessage>(config: MessageConfig<ParentMessage>, children: ReadonlyArray<Html>): Html
  <ParentMessage>(children: ReadonlyArray<Html>): (config: MessageConfig<ParentMessage>) => Html
} = Function.dual(2, <ParentMessage>(config: MessageConfig<ParentMessage>, children: ReadonlyArray<Html>): Html => {
  const h = html<ParentMessage>()
  return h.div(
    [
      ...(config.attributes ?? []),
      h.DataAttribute("slot", "message"),
      h.DataAttribute("align", config.align ?? "start"),
      h.Class(
        cn("group/message relative flex w-full min-w-0 gap-2 text-sm data-[align=end]:flex-row-reverse", config.class),
      ),
    ],
    [...children],
  )
})

/** Avatar well pinned to the bottom of the row. Compose the avatar component (or a plain img) inside it. */
export const messageAvatar: {
  <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html>): Html
  <ParentMessage>(children: ReadonlyArray<Html>): (config: SlotConfig<ParentMessage>) => Html
} = Function.dual(2, <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html>): Html => {
  const h = html<ParentMessage>()
  return h.div(
    [
      ...(config.attributes ?? []),
      h.DataAttribute("slot", "message-avatar"),
      h.Class(
        cn(
          "flex w-fit min-w-8 shrink-0 items-center justify-center self-end overflow-hidden rounded-full bg-muted group-has-data-[slot=message-footer]/message:-translate-y-8",
          config.class,
        ),
      ),
    ],
    [...children],
  )
})

/** Column holding the bubbles, header, and footer of a turn. */
export const messageContent: {
  <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html>): Html
  <ParentMessage>(children: ReadonlyArray<Html>): (config: SlotConfig<ParentMessage>) => Html
} = Function.dual(2, <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html>): Html => {
  const h = html<ParentMessage>()
  return h.div(
    [
      ...(config.attributes ?? []),
      h.DataAttribute("slot", "message-content"),
      h.Class(
        cn(
          "flex w-full min-w-0 flex-col gap-2.5 wrap-break-word group-data-[align=end]/message:*:data-[slot]:self-end",
          config.class,
        ),
      ),
    ],
    [...children],
  )
})

/** Sender name or timestamp line above the bubbles. */
export const messageHeader: {
  <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html | string>): Html
  <ParentMessage>(children: ReadonlyArray<Html | string>): (config: SlotConfig<ParentMessage>) => Html
} = Function.dual(
  2,
  <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html | string>): Html => {
    const h = html<ParentMessage>()
    return h.div(
      [
        ...(config.attributes ?? []),
        h.DataAttribute("slot", "message-header"),
        h.Class(
          cn(
            "flex max-w-full min-w-0 items-center px-3 text-xs font-medium text-muted-foreground group-has-data-[variant=ghost]/message:px-0",
            config.class,
          ),
        ),
      ],
      [...children],
    )
  },
)

/** Delivery status or timestamp line below the bubbles, end-aligned for `align: 'end'` messages. */
export const messageFooter: {
  <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html | string>): Html
  <ParentMessage>(children: ReadonlyArray<Html | string>): (config: SlotConfig<ParentMessage>) => Html
} = Function.dual(
  2,
  <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html | string>): Html => {
    const h = html<ParentMessage>()
    return h.div(
      [
        ...(config.attributes ?? []),
        h.DataAttribute("slot", "message-footer"),
        h.Class(
          cn(
            "flex max-w-full min-w-0 items-center px-3 text-xs font-medium text-muted-foreground group-has-data-[variant=ghost]/message:px-0 group-data-[align=end]/message:justify-end",
            config.class,
          ),
        ),
      ],
      [...children],
    )
  },
)
