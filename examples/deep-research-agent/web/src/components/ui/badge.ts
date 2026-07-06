import { type VariantProps, cva } from "class-variance-authority"
import type { Html } from "foldkit/html"
import { html } from "foldkit/html"

import type { SlotConfig } from "@/lib/utils"
import { cn } from "@/lib/utils"

// VIEW

export const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary: "bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
          "bg-destructive text-white focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40 [a&]:hover:bg-destructive/90",
        outline: "border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        ghost: "[a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        link: "text-primary underline-offset-4 [a&]:hover:underline",
      },
    },
    defaultVariants: { variant: "default" },
  },
)

export type BadgeConfig<ParentMessage> = SlotConfig<ParentMessage> &
  Readonly<{
    variant?: VariantProps<typeof badgeVariants>["variant"]
    // Overrides the stamped `data-slot`. Wrappers that compose `badge` set this
    // so their own slot survives instead of the default "badge".
    dataSlot?: string
  }>

export const badge = <ParentMessage>(
  config: BadgeConfig<ParentMessage>,
  children: ReadonlyArray<Html | string>,
): Html => {
  const h = html<ParentMessage>()
  const { dataSlot = "badge" } = config
  return h.span(
    [
      ...(config.attributes ?? []),
      h.DataAttribute("slot", dataSlot),
      h.Class(cn(badgeVariants({ variant: config.variant }), config.class)),
    ],
    [...children],
  )
}
