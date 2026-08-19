import { view } from "@foldkit/ui/button"
import { type VariantProps, cva } from "class-variance-authority"
import type { Attribute, ChildAttribute, Html } from "foldkit/html"
import { html } from "@/lib/html"

import { cn } from "@/lib/utils"
import { dual } from "effect/Function"

// VIEW

export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40",
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
)

export type ButtonConfig<ParentMessage> = Readonly<{
  variant?: VariantProps<typeof buttonVariants>["variant"]
  size?: VariantProps<typeof buttonVariants>["size"]
  class?: string
  onClick?: ParentMessage
  isDisabled?: boolean
  type?: "button" | "submit" | "reset"
  isAutofocus?: boolean
  /** Overrides the `data-slot` value (default `button`). Lets a composing
   *  wrapper own its own slot instead of inheriting `button`. */
  dataSlot?: string
  attributes?: ReadonlyArray<Attribute<ParentMessage> | ChildAttribute>
}>

export const button: {
  <ParentMessage>(config: ButtonConfig<ParentMessage>, children: ReadonlyArray<Html | string>): Html
  <ParentMessage>(children: ReadonlyArray<Html | string>): (config: ButtonConfig<ParentMessage>) => Html
} = dual(2, <ParentMessage>(config: ButtonConfig<ParentMessage>, children: ReadonlyArray<Html | string>): Html => {
  const h = html<ParentMessage>()
  const { attributes = [], class: className, dataSlot = "button", size, variant, ...primitiveConfig } = config

  return view<ParentMessage>(
    {
      ...primitiveConfig,
      toView: (buttonAttributes) =>
        h.button(
          [
            ...buttonAttributes.button,
            ...attributes,
            h.DataAttribute("slot", dataSlot),
            h.Class(cn(buttonVariants({ size, variant }), className)),
          ],
          [...children],
        ),
    },
    h,
  )
})
