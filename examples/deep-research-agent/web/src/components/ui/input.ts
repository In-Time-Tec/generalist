import * as InputPrimitive from "@foldkit/ui/input"
import type { Attribute, ChildAttribute, Html } from "foldkit/html"
import { html } from "foldkit/html"

import { cn } from "@/lib/utils"

// VIEW

const inputClass = cn(
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30",
  "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
  "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
)

export type InputConfig<ParentMessage> = Readonly<{
  id: string
  class?: string
  onInput?: (value: string) => ParentMessage
  value?: string
  isDisabled?: boolean
  isInvalid?: boolean
  isAutofocus?: boolean
  name?: string
  type?: string
  placeholder?: string
  attributes?: ReadonlyArray<Attribute<ParentMessage> | ChildAttribute>
}>

export const input = <ParentMessage>(config: InputConfig<ParentMessage>): Html => {
  const h = html<ParentMessage>()
  const { attributes = [], class: className, ...primitiveConfig } = config

  return InputPrimitive.view<ParentMessage>({
    ...primitiveConfig,
    toView: (inputAttributes) =>
      h.input([
        ...inputAttributes.input,
        ...attributes,
        h.DataAttribute("slot", "input"),
        h.Class(cn(inputClass, className)),
      ]),
  })
}
