import { Option, Function } from "effect"
import type { Html } from "foldkit/html"
import { html } from "foldkit/html"

import type { ButtonConfig } from "@/components/ui/button"
import { button } from "@/components/ui/button"
import { item, root } from "@/components/ui/select"
import type { RootConfig } from "@/components/ui/select"
import { spinner } from "@/components/ui/spinner"
import type { TextareaConfig } from "@/components/ui/textarea"
import { textarea } from "@/components/ui/textarea"
import type { SlotConfig } from "@/lib/utils"
import { cn } from "@/lib/utils"

// VIEW

const sendIcon = <ParentMessage>(): Html => {
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
    ],
    [
      h.path(
        [
          h.Attribute(
            "d",
            "M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z",
          ),
        ],
        [],
      ),
      h.path([h.Attribute("d", "m21.854 2.147-10.94 10.939")], []),
    ],
  )
}

const squareIcon = <ParentMessage>(): Html => {
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
    ],
    [
      h.rect(
        [
          h.Attribute("x", "3"),
          h.Attribute("y", "3"),
          h.Attribute("width", "18"),
          h.Attribute("height", "18"),
          h.Attribute("rx", "2"),
        ],
        [],
      ),
    ],
  )
}

const xIcon = <ParentMessage>(): Html => {
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
    ],
    [h.path([h.Attribute("d", "M18 6 6 18")], []), h.path([h.Attribute("d", "m6 6 12 12")], [])],
  )
}

export type PromptInputConfig<ParentMessage> = SlotConfig<ParentMessage> &
  Readonly<{
    onSubmitted?: ParentMessage
  }>

/**
 * Prompt form container. Scope of this port is the visual composition of AI
 * Elements' PromptInput: the form shell, textarea, toolbar rows, buttons, the
 * submit button, the model select, and an attachments strip. Not ported
 * (gaps): file drag-and-drop and paste-to-attach, speech input, the action
 * menu, tabs, command palette, hover cards, and the React form context; wire
 * attachment state and submission in the consumer's Model instead.
 * `onSubmitted` fires on native form submission with the default prevented.
 */
export const promptInput: {
  <ParentMessage>(config: PromptInputConfig<ParentMessage>, children: ReadonlyArray<Html>): Html
  <ParentMessage>(children: ReadonlyArray<Html>): (config: PromptInputConfig<ParentMessage>) => Html
} = Function.dual(2, <ParentMessage>(config: PromptInputConfig<ParentMessage>, children: ReadonlyArray<Html>): Html => {
  const h = html<ParentMessage>()
  return h.form(
    [
      ...(config.onSubmitted === undefined ? [] : [h.OnSubmit(config.onSubmitted)]),
      ...(config.attributes ?? []),
      h.DataAttribute("slot", "prompt-input"),
      h.Class(cn("w-full divide-y overflow-hidden rounded-xl border bg-background shadow-xs", config.class)),
    ],
    [...children],
  )
})

export type PromptInputTextareaConfig<ParentMessage> = TextareaConfig<ParentMessage> &
  Readonly<{
    onSubmitRequested?: ParentMessage
  }>

/**
 * Auto-growing prompt textarea composing the textarea component with the
 * chrome removed (the surrounding form paints the border). `onSubmitRequested`
 * fires on Enter without Shift, matching AI Elements' submit-on-Enter;
 * Shift+Enter inserts a newline as usual.
 */
export const promptInputTextarea = <ParentMessage>(config: PromptInputTextareaConfig<ParentMessage>): Html => {
  const h = html<ParentMessage>()
  const { onSubmitRequested, ...textareaConfig } = config
  const submitAttributes =
    onSubmitRequested === undefined
      ? []
      : [
          h.OnKeyDownPreventDefault((key, modifiers) =>
            key === "Enter" && !modifiers.shiftKey ? Option.some(onSubmitRequested) : Option.none(),
          ),
        ]
  return textarea({
    ...textareaConfig,
    placeholder: config.placeholder ?? "What would you like to know?",
    class: cn(
      "field-sizing-content max-h-48 min-h-16 w-full resize-none rounded-none border-none bg-transparent p-3 shadow-none outline-none ring-0 focus-visible:ring-0 dark:bg-transparent",
      config.class,
    ),
    dataSlot: "prompt-input-textarea",
    attributes: [...submitAttributes, ...(config.attributes ?? [])],
  })
}

/** Bottom row of the prompt form, holding the tools on one side and the submit button on the other. */
export const promptInputToolbar: {
  <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html>): Html
  <ParentMessage>(children: ReadonlyArray<Html>): (config: SlotConfig<ParentMessage>) => Html
} = Function.dual(2, <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html>): Html => {
  const h = html<ParentMessage>()
  return h.div(
    [
      ...(config.attributes ?? []),
      h.DataAttribute("slot", "prompt-input-toolbar"),
      h.Class(cn("flex items-center justify-between p-1", config.class)),
    ],
    [...children],
  )
})

/** Cluster of prompt tool buttons and selects. */
export const promptInputTools: {
  <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html>): Html
  <ParentMessage>(children: ReadonlyArray<Html>): (config: SlotConfig<ParentMessage>) => Html
} = Function.dual(2, <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html>): Html => {
  const h = html<ParentMessage>()
  return h.div(
    [
      ...(config.attributes ?? []),
      h.DataAttribute("slot", "prompt-input-tools"),
      h.Class(cn("flex min-w-0 items-center gap-1", config.class)),
    ],
    [...children],
  )
})

export type PromptInputButtonConfig<ParentMessage> = ButtonConfig<ParentMessage>

/**
 * Prompt tool button composing the button component. Defaults to the ghost
 * variant; icon-only children get the icon size, wider children the small
 * size, adapting AI Elements' child-count sizing.
 */
export const promptInputButton: {
  <ParentMessage>(config: PromptInputButtonConfig<ParentMessage>, children: ReadonlyArray<Html | string>): Html
  <ParentMessage>(children: ReadonlyArray<Html | string>): (config: PromptInputButtonConfig<ParentMessage>) => Html
} = Function.dual(
  2,
  <ParentMessage>(config: PromptInputButtonConfig<ParentMessage>, children: ReadonlyArray<Html | string>): Html => {
    const size = config.size ?? (children.length > 1 ? "sm" : "icon")
    return button(
      {
        ...config,
        variant: config.variant ?? "ghost",
        size,
        class: cn("shrink-0 gap-1.5 rounded-lg text-muted-foreground", config.class),
        dataSlot: "prompt-input-button",
        attributes: [...(config.attributes ?? [])],
      },
      children,
    )
  },
)

export type PromptInputStatus = "idle" | "submitted" | "streaming" | "error"

export type PromptInputSubmitConfig<ParentMessage> = ButtonConfig<ParentMessage> &
  Readonly<{
    status?: PromptInputStatus
  }>

const statusIcon = <ParentMessage>(status: PromptInputStatus): Html => {
  const icons: Record<PromptInputStatus, () => Html> = {
    idle: () => sendIcon<ParentMessage>(),
    submitted: () => spinner<ParentMessage>({}),
    streaming: () => squareIcon<ParentMessage>(),
    error: () => xIcon<ParentMessage>(),
  }
  // The chat status is derived from stream state and cast to PromptInputStatus
  // at the boundary; degrade to the idle send icon rather than crashing the
  // render if an unexpected status slips through.
  return (icons[status] ?? icons.idle)()
}

/**
 * Submit button whose icon follows the chat status: send while idle, a
 * spinner after submission, a stop square while streaming, and an x on
 * error. Pass `onClick` to turn the streaming state into a stop action.
 */
export const promptInputSubmit: {
  <ParentMessage>(config: PromptInputSubmitConfig<ParentMessage>, children?: ReadonlyArray<Html | string>): Html
  <ParentMessage>(children?: ReadonlyArray<Html | string>): (config: PromptInputSubmitConfig<ParentMessage>) => Html
} = Function.dual(
  (args) => args.length > 0 && !Array.isArray(args[0]),
  <ParentMessage>(
    config: PromptInputSubmitConfig<ParentMessage>,
    children: ReadonlyArray<Html | string> = [],
  ): Html => {
    const h = html<ParentMessage>()
    const { status = "idle", ...buttonConfig } = config
    return button(
      {
        ...buttonConfig,
        variant: config.variant ?? "default",
        size: config.size ?? "icon",
        type: config.type ?? "submit",
        class: cn("gap-1.5 rounded-lg", config.class),
        dataSlot: "prompt-input-submit",
        attributes: [
          ...(config.attributes ?? []),
          h.DataAttribute("status", status),
          h.AriaLabel(status === "streaming" || status === "submitted" ? "Stop" : "Submit"),
        ],
      },
      children.length > 0 ? children : [statusIcon<ParentMessage>(status)],
    )
  },
)

export type PromptInputModelSelectConfig<Item extends string = string> = RootConfig<Item>

/**
 * Model picker composing the select component with the trigger chrome
 * removed so it sits flat in the toolbar. Returns the select `viewInputs`
 * for `h.submodel`; the consumer wires the select Submodel exactly as for
 * the plain select component.
 */
export const promptInputModelSelect = <Item extends string = string>(
  config: PromptInputModelSelectConfig<Item>,
): ReturnType<typeof root<Item>> =>
  root({
    ...config,
    triggerClass: cn(
      "border-none bg-transparent font-medium text-muted-foreground shadow-none transition-colors hover:bg-accent hover:text-foreground aria-expanded:bg-accent aria-expanded:text-foreground dark:bg-transparent dark:hover:bg-accent",
      config.triggerClass,
    ),
  })

/** Styled model option for `itemToConfig`, passing through the select component's item. */
export const promptInputModelSelectItem = item

/** Strip above the textarea for queued attachments. Compose attachment components (or any chips) inside it. */
export const promptInputAttachments: {
  <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html>): Html
  <ParentMessage>(children: ReadonlyArray<Html>): (config: SlotConfig<ParentMessage>) => Html
} = Function.dual(2, <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html>): Html => {
  const h = html<ParentMessage>()
  return h.div(
    [
      ...(config.attributes ?? []),
      h.DataAttribute("slot", "prompt-input-attachments"),
      h.Class(cn("flex flex-wrap items-center gap-2 p-3", config.class)),
    ],
    [...children],
  )
})
