import { view } from "@foldkit/ui/textarea"
import type { Attribute, ChildAttribute, Html } from "foldkit/html"
import { html } from "@/lib/html"

import { cn } from "@/lib/utils"

// VIEW

const textareaClass = cn(
  "flex field-sizing-content min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30",
  "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
  "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
)

export type TextareaConfig<ParentMessage> = Readonly<{
  id: string
  class?: string
  onInput?: (value: string) => ParentMessage
  value?: string
  isDisabled?: boolean
  isInvalid?: boolean
  isAutofocus?: boolean
  name?: string
  rows?: number
  placeholder?: string
  attributes?: ReadonlyArray<Attribute<ParentMessage> | ChildAttribute>
  // Overrides the stamped `data-slot`. Wrappers composing `textarea` set this
  // so their own slot survives instead of the default "textarea".
  dataSlot?: string
}>

export const textarea = <ParentMessage>(config: TextareaConfig<ParentMessage>): Html => {
  const h = html<ParentMessage>()
  const { attributes = [], class: className, dataSlot = "textarea", ...primitiveConfig } = config

  return view<ParentMessage>(
    {
      ...primitiveConfig,
      toView: (textareaAttributes) =>
        h.textarea(
          [
            ...textareaAttributes.textarea,
            ...attributes,
            h.DataAttribute("slot", dataSlot),
            h.Class(cn(textareaClass, className)),
          ],
          [],
        ),
    },
    h,
  )
}
