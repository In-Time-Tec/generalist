import { Function, Option } from "effect"
import { Message, Model, Orientation, OutMessage, Selected, buttonId, create, init } from "@foldkit/ui/listbox"
import type { AnchorConfig, GroupHeading, InitConfig, ViewInputs } from "@foldkit/ui/listbox"
import type { Html } from "foldkit/html"
import { childAttributes } from "foldkit/html"
import { html } from "@/lib/html"

import { cn } from "@/lib/utils"

// MODEL

export { Model, Orientation, init }
export type SelectModel = Model
export type SelectOrientation = Orientation
export type { AnchorConfig, InitConfig }

// MESSAGE

export { Message, OutMessage, Selected }
export type SelectMessage = Message
export type SelectSelected<Value extends string = string> = Readonly<{
  readonly _tag: "Selected"
  readonly value: Value
  readonly wasAdded: boolean
}>
export type SelectOutMessage<Value extends string = string> = SelectSelected<Value>

// UPDATE

export { create }

// VIEW

export { buttonId }

export type { GroupHeading }

const DEFAULT_ANCHOR: AnchorConfig = { placement: "bottom-start", gap: 4, padding: 8 }

type PrimitiveItemConfig = ReturnType<ViewInputs<string, string>["itemToConfig"]>

const wrapperClass = "relative inline-block"

const backdropClass = "fixed inset-0 z-0"

const triggerClass =
  "flex w-fit items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[disabled]:pointer-events-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[invalid]:border-destructive data-[invalid]:ring-destructive/20 dark:bg-input/30 dark:hover:bg-input/50 dark:data-[invalid]:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground"

const triggerSizeDefaultClass = "h-9"

const triggerSizeSmallClass = "h-8"

const contentClass =
  "relative z-50 max-h-96 min-w-(--button-width) overflow-x-hidden overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md transition duration-200 ease-out data-[closed]:scale-95 data-[closed]:opacity-0"

const itemClass =
  "group/item relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-[active]:bg-accent data-[active]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground"

const indicatorClass =
  "pointer-events-none absolute right-2 flex size-3.5 items-center justify-center opacity-0 group-data-[selected]/item:opacity-100"

const labelClass = "px-2 py-1.5 text-xs text-muted-foreground"

const separatorClass = "pointer-events-none -mx-1 my-1 h-px bg-border"

const chevronDownIcon = (): Html => {
  const h = html<SelectMessage>()
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
      h.Class("size-4 opacity-50"),
    ],
    [h.path([h.Attribute("d", "m6 9 6 6 6-6")], [])],
  )
}

const checkIcon = (): Html => {
  const h = html<SelectMessage>()
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
    [h.path([h.Attribute("d", "M20 6 9 17l-5-5")], [])],
  )
}

export type TriggerSize = "default" | "sm"

export type RootConfig<Item extends string = string> = Readonly<{
  items: ReadonlyArray<Item>
  itemToConfig: (
    item: Item,
    context: Readonly<{ isActive: boolean; isDisabled: boolean; isSelected: boolean }>,
  ) => PrimitiveItemConfig
  trigger: Html
  class?: string
  triggerClass?: string
  size?: TriggerSize
  isDisabled?: boolean
  isInvalid?: boolean
  isItemDisabled?: (item: Item, index: number) => boolean
  itemToSearchText?: (item: Item, index: number) => string
  itemGroupKey?: (item: Item, index: number) => string
  groupToHeading?: (groupKey: string) => GroupHeading | undefined
  ariaLabel?: string
  ariaLabelledBy?: string
  name?: string
  form?: string
  anchor?: AnchorConfig
}>

/**
 * Builds the `viewInputs` for `h.submodel` with a `create<Item>()` listbox
 * view: a select-style trigger button showing `trigger` (the current value
 * face) next to a chevron, a click-outside backdrop, and an anchored option
 * panel. Compose items with the `item` helper inside `itemToConfig`, group
 * headings with `label` inside `groupToHeading`; separators render between
 * item groups declared via `itemGroupKey`. The transition classes fire when
 * the consumer passes `isAnimated: true` to `init`.
 */
export const root = <Item extends string = string>(config: RootConfig<Item>): ViewInputs<Item, Item> => {
  const h = html<SelectMessage>()
  const sizeClass = config.size === "sm" ? triggerSizeSmallClass : triggerSizeDefaultClass
  return {
    items: config.items,
    maybeSelectedValue: Option.none(),
    itemToConfig: config.itemToConfig,
    itemToValue: (item) => item,
    ...(config.isItemDisabled !== undefined ? { isItemDisabled: config.isItemDisabled } : {}),
    ...(config.itemToSearchText !== undefined ? { itemToSearchText: config.itemToSearchText } : {}),
    ...(config.itemGroupKey !== undefined ? { itemGroupKey: config.itemGroupKey } : {}),
    ...(config.groupToHeading !== undefined ? { groupToHeading: config.groupToHeading } : {}),
    ...(config.isDisabled !== undefined ? { isDisabled: config.isDisabled } : {}),
    ...(config.isInvalid !== undefined ? { isInvalid: config.isInvalid } : {}),
    ...(config.ariaLabel !== undefined ? { ariaLabel: config.ariaLabel } : {}),
    ...(config.ariaLabelledBy !== undefined ? { ariaLabelledBy: config.ariaLabelledBy } : {}),
    ...(config.name !== undefined ? { name: config.name } : {}),
    ...(config.form !== undefined ? { form: config.form } : {}),
    buttonContent: h.div(
      [h.Class("flex w-full items-center justify-between gap-2")],
      [
        h.span(
          [h.DataAttribute("slot", "select-value"), h.Class("flex items-center gap-2 line-clamp-1")],
          [config.trigger],
        ),
        chevronDownIcon(),
      ],
    ),
    buttonClassName: cn(triggerClass, sizeClass, config.triggerClass),
    buttonAttributes: childAttributes([h.DataAttribute("slot", "select-trigger")]),
    itemsClassName: cn(contentClass, config.class),
    itemsAttributes: childAttributes([h.DataAttribute("slot", "select-content")]),
    backdropClassName: backdropClass,
    separatorClassName: separatorClass,
    className: wrapperClass,
    attributes: childAttributes([h.DataAttribute("slot", "select")]),
    anchor: config.anchor ?? DEFAULT_ANCHOR,
  }
}

export type ItemConfig = Readonly<{
  class?: string
}>

/**
 * Styled select option for `itemToConfig`: returns the primitive's
 * `ItemConfig` with shadcn item classes on the option element and a
 * check-icon indicator that shows via CSS when the option carries the
 * primitive's `data-selected` attribute.
 */
export const item: {
  (config: ItemConfig, children: ReadonlyArray<Html | string>): PrimitiveItemConfig
  (children: ReadonlyArray<Html | string>): (config: ItemConfig) => PrimitiveItemConfig
} = Function.dual(2, (config: ItemConfig, children: ReadonlyArray<Html | string>): PrimitiveItemConfig => {
  const h = html<SelectMessage>()
  return {
    className: cn(itemClass, config.class),
    content: h.div(
      [h.DataAttribute("slot", "select-item"), h.Class("flex w-full items-center gap-2")],
      [...children, h.span([h.DataAttribute("slot", "select-item-indicator"), h.Class(indicatorClass)], [checkIcon()])],
    ),
  }
})

export type LabelConfig = Readonly<{
  class?: string
}>

/** Styled group label for `groupToHeading`: returns the primitive's `GroupHeading`. */
export const label: {
  (config: LabelConfig, children: ReadonlyArray<Html | string>): GroupHeading
  (children: ReadonlyArray<Html | string>): (config: LabelConfig) => GroupHeading
} = Function.dual(2, (config: LabelConfig, children: ReadonlyArray<Html | string>): GroupHeading => {
  const h = html<SelectMessage>()
  return {
    className: cn(labelClass, config.class),
    content: h.span([h.DataAttribute("slot", "select-label")], [...children]),
  }
})
