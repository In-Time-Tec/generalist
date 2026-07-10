import type { Html } from "foldkit/html"
import { html } from "foldkit/html"

import { Message, Model, content, root, scrollButton, viewport } from "@/components/ui/message-scroller"
import type { SlotConfig } from "@/lib/utils"
import { cn } from "@/lib/utils"

// VIEW

/**
 * Conversation frame over the message-scroller Submodel. AI Elements builds
 * this on `use-stick-to-bottom`; this port composes the foldcn
 * message-scroller instead, so the consumer wires the scroller Submodel once:
 *
 * ```ts
 * // MODEL
 * scroller: init({ id: 'chat-scroller' })
 *
 * // UPDATE: delegate to update and lift its Commands
 *
 * // VIEW
 * conversation({}, [
 *   conversationContent({ model: model.scroller, toParentMessage }, [...turns]),
 *   conversationScrollButton({ model: model.scroller, toParentMessage }),
 * ])
 * ```
 */
export const conversation = <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html>): Html => {
  const h = html<ParentMessage>()
  return root(
    {
      attributes: [h.Role("log"), ...(config.attributes ?? [])],
      class: cn("relative flex-1", config.class),
    },
    children,
  )
}

export type ConversationContentConfig<ParentMessage> = SlotConfig<ParentMessage> &
  Readonly<{
    model: Model
    toParentMessage: (message: Message) => ParentMessage
  }>

/** Scrolling column of turns: the scroller viewport wrapping the growth-observed content element. */
export const conversationContent = <ParentMessage>(
  config: ConversationContentConfig<ParentMessage>,
  children: ReadonlyArray<Html>,
): Html =>
  viewport(
    {
      model: config.model,
      toParentMessage: config.toParentMessage,
      attributes: config.attributes ?? [],
    },
    [
      content(
        { toParentMessage: config.toParentMessage, class: cn("flex flex-col gap-8 p-4", config.class) },
        children,
      ),
    ],
  )

export type ConversationEmptyStateConfig<ParentMessage> = SlotConfig<ParentMessage> &
  Readonly<{
    title?: string
    description?: string
    icon?: Html
  }>

/** Placeholder shown before the first message. Children replace the default icon, title, and description stack. */
export const conversationEmptyState = <ParentMessage>(
  config: ConversationEmptyStateConfig<ParentMessage>,
  children: ReadonlyArray<Html | string> = [],
): Html => {
  const h = html<ParentMessage>()
  const title = config.title ?? "No messages yet"
  const description = config.description ?? "Start a conversation to see messages here"
  const defaultChildren: ReadonlyArray<Html> = [
    ...(config.icon === undefined ? [] : [h.div([h.Class("text-muted-foreground")], [config.icon])]),
    h.div(
      [h.Class("space-y-1")],
      [h.h3([h.Class("text-sm font-medium")], [title]), h.p([h.Class("text-sm text-muted-foreground")], [description])],
    ),
  ]
  return h.div(
    [
      ...(config.attributes ?? []),
      h.DataAttribute("slot", "conversation-empty-state"),
      h.Class(cn("flex size-full flex-col items-center justify-center gap-3 p-8 text-center", config.class)),
    ],
    children.length > 0 ? [...children] : defaultChildren,
  )
}

export type ConversationScrollButtonConfig<ParentMessage> = SlotConfig<ParentMessage> &
  Readonly<{
    model: Model
    toParentMessage: (message: Message) => ParentMessage
  }>

/** Floating scroll-to-bottom button. Render it as a sibling of `conversationContent`, inside `conversation`. */
export const conversationScrollButton = <ParentMessage>(config: ConversationScrollButtonConfig<ParentMessage>): Html =>
  scrollButton({
    model: config.model,
    toParentMessage: config.toParentMessage,
    class: cn("dark:bg-background dark:hover:bg-muted", config.class),
    attributes: config.attributes ?? [],
  })
