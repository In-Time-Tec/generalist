import { Message, Model, OutMessage, close, descriptionId, init, open, titleId, update, view } from "@foldkit/ui/dialog"
import type { InitConfig, RenderInfo, ViewInputs } from "@foldkit/ui/dialog"
import type { Html } from "foldkit/html"
import { html } from "@/lib/html"
import { dual } from "effect/Function"

import type { SlotConfig } from "@/lib/utils"
import { cn } from "@/lib/utils"

// MODEL

export { Model, init }
export type { InitConfig }
export const DialogModel = Model
export type DialogModel = Model
export const dialogInit = init

// MESSAGE

export { Message, OutMessage }
export type DialogMessage = Message
export type DialogOutMessage = OutMessage
export const DialogMessage = Message
export const DialogOutMessage = OutMessage

// UPDATE

export { close, open, update }
export const dialogClose = close
export const dialogOpen = open
export const dialogUpdate: {
  (model: Model, message: Message): ReturnType<typeof update>
  (message: Message): (model: Model) => ReturnType<typeof update>
} = dual(2, update)

// VIEW

export { descriptionId, titleId, view }
export const dialogDescriptionId = descriptionId
export const dialogTitleId = titleId

const dialogClass = "items-center justify-center bg-transparent p-0 open:flex"

const overlayClass = "fixed inset-0 z-50 bg-black/50 transition duration-200 ease-out data-[closed]:opacity-0"

const contentClass =
  "relative z-50 grid w-full max-w-[calc(100%-2rem)] gap-4 rounded-lg border bg-background p-6 shadow-lg transition duration-200 ease-out outline-none data-[closed]:scale-95 data-[closed]:opacity-0 sm:max-w-lg"

const closeClass =
  "absolute top-4 right-4 rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"

const xIcon = (): Html => {
  const h = html<DialogMessage>()
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
    ],
    [h.path([h.Attribute("d", "M18 6 6 18")], []), h.path([h.Attribute("d", "m6 6 12 12")], [])],
  )
}

export type ContentSlots = Readonly<{
  close: RenderInfo["closeButton"]
}>

export type ContentConfig = Readonly<{
  class?: string
  showCloseButton?: boolean
}>

export type DialogContentConfig = ContentConfig

/**
 * Builds the `viewInputs` for `h.submodel`: a styled overlay and centered
 * content panel. `toChildren` receives the primitive's close-button
 * attributes so any element inside can dismiss the dialog.
 */
export const content: {
  (config: ContentConfig, toChildren: (slots: ContentSlots) => ReadonlyArray<Html>): ViewInputs
  (toChildren: (slots: ContentSlots) => ReadonlyArray<Html>): (config: ContentConfig) => ViewInputs
} = dual(
  2,
  (config: ContentConfig, toChildren: (slots: ContentSlots) => ReadonlyArray<Html>): ViewInputs => ({
    toView: ({ backdrop, closeButton, dialog, isVisible, panel }) => {
      const h = html<DialogMessage>()
      const showCloseButton = config.showCloseButton ?? true

      return h.dialog(
        [...dialog, h.Class(dialogClass)],
        isVisible
          ? [
              h.div([...backdrop, h.DataAttribute("slot", "dialog-overlay"), h.Class(overlayClass)], []),
              h.div(
                [...panel, h.DataAttribute("slot", "dialog-content"), h.Class(cn(contentClass, config.class))],
                [
                  ...toChildren({ close: closeButton }),
                  ...(showCloseButton
                    ? [
                        h.button(
                          [...closeButton, h.DataAttribute("slot", "dialog-close"), h.Class(closeClass)],
                          [xIcon(), h.span([h.Class("sr-only")], ["Close"])],
                        ),
                      ]
                    : []),
                ],
              ),
            ]
          : [],
      )
    },
  }),
)

export const dialogContent = content

export const header: {
  <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html | string>): Html
  <ParentMessage>(children: ReadonlyArray<Html | string>): (config: SlotConfig<ParentMessage>) => Html
} = dual(2, <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html | string>): Html => {
  const h = html<ParentMessage>()
  return h.div(
    [
      ...(config.attributes ?? []),
      h.DataAttribute("slot", "dialog-header"),
      h.Class(cn("flex flex-col gap-2 text-center sm:text-left", config.class)),
    ],
    [...children],
  )
})

export const title: {
  <ParentMessage>(
    config: SlotConfig<ParentMessage> & Readonly<{ model: DialogModel }>,
    children: ReadonlyArray<Html | string>,
  ): Html
  <ParentMessage>(
    children: ReadonlyArray<Html | string>,
  ): (config: SlotConfig<ParentMessage> & Readonly<{ model: DialogModel }>) => Html
} = dual(
  2,
  <ParentMessage>(
    config: SlotConfig<ParentMessage> & Readonly<{ model: DialogModel }>,
    children: ReadonlyArray<Html | string>,
  ): Html => {
    const h = html<ParentMessage>()
    return h.h2(
      [
        ...(config.attributes ?? []),
        h.Id(titleId(config.model)),
        h.DataAttribute("slot", "dialog-title"),
        h.Class(cn("text-lg leading-none font-semibold", config.class)),
      ],
      [...children],
    )
  },
)

export const description: {
  <ParentMessage>(
    config: SlotConfig<ParentMessage> & Readonly<{ model: DialogModel }>,
    children: ReadonlyArray<Html | string>,
  ): Html
  <ParentMessage>(
    children: ReadonlyArray<Html | string>,
  ): (config: SlotConfig<ParentMessage> & Readonly<{ model: DialogModel }>) => Html
} = dual(
  2,
  <ParentMessage>(
    config: SlotConfig<ParentMessage> & Readonly<{ model: DialogModel }>,
    children: ReadonlyArray<Html | string>,
  ): Html => {
    const h = html<ParentMessage>()
    return h.p(
      [
        ...(config.attributes ?? []),
        h.Id(descriptionId(config.model)),
        h.DataAttribute("slot", "dialog-description"),
        h.Class(cn("text-sm text-muted-foreground", config.class)),
      ],
      [...children],
    )
  },
)

export const footer: {
  <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html | string>): Html
  <ParentMessage>(children: ReadonlyArray<Html | string>): (config: SlotConfig<ParentMessage>) => Html
} = dual(2, <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html | string>): Html => {
  const h = html<ParentMessage>()
  return h.div(
    [
      ...(config.attributes ?? []),
      h.DataAttribute("slot", "dialog-footer"),
      h.Class(cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", config.class)),
    ],
    [...children],
  )
})
