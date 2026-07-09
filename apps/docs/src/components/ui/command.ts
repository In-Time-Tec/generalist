import { Message, Model, OutMessage, Selected, create, init } from "@foldkit/ui/combobox"
import type { AnchorConfig, GroupHeading, InitConfig, ViewInputs } from "@foldkit/ui/combobox"
import type { Html } from "foldkit/html"
import { childAttributes, html } from "foldkit/html"

import type { ContentConfig } from "@/components/ui/dialog"
import type { SlotConfig } from "@/lib/utils"
import { cn } from "@/lib/utils"

// MODEL

export { Model, init }
export type { AnchorConfig, InitConfig }
export const CommandModel = Model
export type CommandModel = typeof Model.Type
export const commandInit = init

// MESSAGE

export { Message, OutMessage, Selected }
export type CommandMessage = typeof Message.Type
export type CommandSelected<Value extends string = string> = Readonly<{
  readonly _tag: "Selected"
  readonly value: Value
  readonly wasAdded: boolean
}>
export type CommandOutMessage<Value extends string = string> = CommandSelected<Value>
export const CommandMessage = Message
export const CommandOutMessage = OutMessage
export const CommandSelected = Selected

// UPDATE

export { create }
export const commandCreate: typeof create = create

// VIEW

export type { GroupHeading }

const DEFAULT_ANCHOR: AnchorConfig = { placement: "bottom-start", gap: 4, padding: 8 }

type PrimitiveItemConfig = ReturnType<ViewInputs<string>["itemToConfig"]>

const wrapperClass = "flex w-full flex-col rounded-md bg-popover text-popover-foreground"

const inputWrapperClass = "relative flex h-9 items-center border-b"

const inputClass =
  "flex h-9 w-full rounded-md bg-transparent py-3 pr-3 pl-9 text-sm outline-hidden placeholder:text-muted-foreground data-[disabled]:pointer-events-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50"

const buttonClass = "pointer-events-none absolute inset-y-0 left-0 flex items-center px-3 text-muted-foreground"

const backdropClass = "fixed inset-0 z-0"

const contentClass =
  "z-50 max-h-72 w-(--button-width) scroll-py-1 overflow-x-hidden overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md transition duration-200 ease-out data-[closed]:scale-95 data-[closed]:opacity-0"

const itemClass =
  "relative flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[active]:bg-accent data-[active]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground"

const labelClass = "px-2 py-1.5 text-xs font-medium text-muted-foreground"

const separatorClass = "pointer-events-none -mx-1 h-px bg-border"

const shortcutClass = "ml-auto text-xs tracking-widest text-muted-foreground"

const searchIcon = (): Html => {
  const h = html<CommandMessage>()
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
      h.Class("size-4 shrink-0 opacity-50"),
    ],
    [h.path([h.Attribute("d", "m21 21-4.34-4.34")], []), h.circle([h.Cx("11"), h.Cy("11"), h.R("8")], [])],
  )
}

export type RootConfig<Item extends string = string> = Readonly<{
  items: ReadonlyArray<Item>
  itemToConfig: (
    item: Item,
    context: Readonly<{ isActive: boolean; isDisabled: boolean; isSelected: boolean }>,
  ) => PrimitiveItemConfig
  class?: string
  inputClass?: string
  placeholder?: string
  itemToDisplayText?: (item: Item, index: number) => string
  isItemDisabled?: (item: Item, index: number) => boolean
  itemGroupKey?: (item: Item, index: number) => string
  groupToHeading?: (groupKey: string) => GroupHeading | undefined
  isDisabled?: boolean
  openOnFocus?: boolean
  // The primitive stamps `role="combobox"` on the input; supply one of these
  // (or an external <label>) so the command input has an accessible name.
  ariaLabel?: string
  ariaLabelledBy?: string
  anchor?: AnchorConfig
}>

/**
 * Builds the `viewInputs` for `h.submodel` with a `create<Item>()` combobox
 * view styled as a command palette: a search-icon input row and a scrollable
 * command list anchored below it. Compose items with the `item` helper inside
 * `itemToConfig`, group headings with `label` inside `groupToHeading`. The
 * consumer filters `items` against the model's `inputValue`; the primitive
 * never filters, and it has no empty-state slot (gap), so render your own
 * "No results found." element outside the list when the filtered `items`
 * array is empty. The transition classes fire when the consumer passes
 * `isAnimated: true` to `init`.
 */
export const root = <Item extends string = string>(config: RootConfig<Item>): ViewInputs<Item> => {
  const h = html<CommandMessage>()
  return {
    items: config.items,
    itemToConfig: config.itemToConfig,
    itemToValue: (item) => item,
    itemToDisplayText: config.itemToDisplayText ?? ((item) => item),
    ...(config.isItemDisabled !== undefined ? { isItemDisabled: config.isItemDisabled } : {}),
    ...(config.itemGroupKey !== undefined ? { itemGroupKey: config.itemGroupKey } : {}),
    ...(config.groupToHeading !== undefined ? { groupToHeading: config.groupToHeading } : {}),
    ...(config.placeholder !== undefined ? { inputPlaceholder: config.placeholder } : {}),
    ...(config.isDisabled !== undefined ? { isDisabled: config.isDisabled } : {}),
    ...(config.openOnFocus !== undefined ? { openOnFocus: config.openOnFocus } : {}),
    inputClassName: cn(inputClass, config.inputClass),
    inputAttributes: childAttributes([
      h.DataAttribute("slot", "command-input"),
      ...(config.ariaLabel !== undefined ? [h.AriaLabel(config.ariaLabel)] : []),
      ...(config.ariaLabelledBy !== undefined ? [h.AriaLabelledBy(config.ariaLabelledBy)] : []),
    ]),
    inputWrapperClassName: inputWrapperClass,
    inputWrapperAttributes: childAttributes([h.DataAttribute("slot", "command-input-wrapper")]),
    buttonContent: searchIcon(),
    buttonClassName: buttonClass,
    buttonAttributes: childAttributes([h.DataAttribute("slot", "command-search"), h.Tabindex(-1)]),
    itemsClassName: cn(contentClass, config.class),
    itemsAttributes: childAttributes([h.DataAttribute("slot", "command-list")]),
    backdropClassName: backdropClass,
    separatorClassName: separatorClass,
    className: wrapperClass,
    attributes: childAttributes([h.DataAttribute("slot", "command")]),
    anchor: config.anchor ?? DEFAULT_ANCHOR,
  }
}

export type ItemConfig = Readonly<{
  class?: string
}>

/**
 * Styled command item for `itemToConfig`: returns the primitive's
 * `ItemConfig` with shadcn command-item classes, highlighting the active
 * option via the primitive's `data-active` attribute.
 */
export const item = (config: ItemConfig, children: ReadonlyArray<Html | string>): PrimitiveItemConfig => {
  const h = html<CommandMessage>()
  return {
    className: cn(itemClass, config.class),
    content: h.div([h.DataAttribute("slot", "command-item"), h.Class("flex w-full items-center gap-2")], [...children]),
  }
}

export type LabelConfig = Readonly<{
  class?: string
}>

/** Styled group heading for `groupToHeading`: returns the primitive's `GroupHeading`. */
export const label = (config: LabelConfig, children: ReadonlyArray<Html | string>): GroupHeading => {
  const h = html<CommandMessage>()
  return {
    className: cn(labelClass, config.class),
    content: h.span([h.DataAttribute("slot", "command-group-heading")], [...children]),
  }
}

/** Styled keyboard-shortcut hint, right-aligned inside an item's content. */
export const shortcut = <ParentMessage>(
  config: SlotConfig<ParentMessage>,
  children: ReadonlyArray<Html | string>,
): Html => {
  const h = html<ParentMessage>()
  return h.span(
    [
      ...(config.attributes ?? []),
      h.DataAttribute("slot", "command-shortcut"),
      h.Class(cn(shortcutClass, config.class)),
    ],
    [...children],
  )
}

export type CommandDialogConfig = Readonly<{
  class?: string
  showCloseButton?: boolean
}>

/**
 * Returns a `Dialog.ContentConfig` for hosting a command palette inside the
 * dialog component: pass the result to `Dialog.content` and render the
 * command `root` submodel (plus an sr-only dialog title and description) as
 * its children. The padding is stripped so the command input row sits flush
 * against the dialog frame, matching shadcn's `CommandDialog`.
 */
export const commandDialog = (config: CommandDialogConfig = {}): ContentConfig => ({
  class: cn("overflow-hidden p-0", config.class),
  ...(config.showCloseButton !== undefined ? { showCloseButton: config.showCloseButton } : {}),
})
