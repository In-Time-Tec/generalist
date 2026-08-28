import { type VariantProps, cva } from "class-variance-authority"
import type { Html } from "foldkit/html"
import { html } from "@/lib/html"
import { skeleton } from "@/components/ui/skeleton"
import { type SlotConfig, cn } from "@/lib/styles"
import { dual } from "effect/Function"

export const sidebarMenu: {
  <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html>): Html
  <ParentMessage>(children: ReadonlyArray<Html>): (config: SlotConfig<ParentMessage>) => Html
} = dual(2, <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html>): Html => {
  const h = html<ParentMessage>()
  return h.ul(
    [
      ...(config.attributes ?? []),
      h.DataAttribute("slot", "sidebar-menu"),
      h.DataAttribute("sidebar", "menu"),
      h.Class(cn("flex w-full min-w-0 flex-col gap-1", config.class)),
    ],
    [...children],
  )
})
export const sidebarMenuItem: {
  <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html>): Html
  <ParentMessage>(children: ReadonlyArray<Html>): (config: SlotConfig<ParentMessage>) => Html
} = dual(2, <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html>): Html => {
  const h = html<ParentMessage>()
  return h.li(
    [
      ...(config.attributes ?? []),
      h.DataAttribute("slot", "sidebar-menu-item"),
      h.DataAttribute("sidebar", "menu-item"),
      h.Class(cn("group/menu-item relative", config.class)),
    ],
    [...children],
  )
})
export const sidebarMenuButtonVariants = cva(
  "peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm ring-sidebar-ring outline-hidden transition-[width,height,padding] group-has-data-[sidebar=menu-action]/menu-item:pr-8 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active]:bg-sidebar-accent data-[active]:font-medium data-[active]:text-sidebar-accent-foreground data-open:hover:bg-sidebar-accent data-open:hover:text-sidebar-accent-foreground [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        outline:
          "bg-background shadow-[0_0_0_1px_var(--sidebar-border)] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:shadow-[0_0_0_1px_var(--sidebar-accent)]",
      },
      size: {
        default: "h-8 text-sm",
        sm: "h-7 text-xs",
        lg: "h-12 text-sm group-data-[collapsible=icon]:p-0!",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
)

export type SidebarMenuButtonConfig<ParentMessage> = SlotConfig<ParentMessage> &
  Readonly<{
    variant?: VariantProps<typeof sidebarMenuButtonVariants>["variant"]
    size?: VariantProps<typeof sidebarMenuButtonVariants>["size"]
    isActive?: boolean
    onClick?: ParentMessage
    isDisabled?: boolean
  }>

/**
 * Menu entry button. `isActive` renders the `data-active` highlight. shadcn's
 * collapsed-state tooltip is not ported (gap); compose the tooltip component
 * around this part if you need it.
 */
export const sidebarMenuButton: {
  <ParentMessage>(config: SidebarMenuButtonConfig<ParentMessage>, children: ReadonlyArray<Html | string>): Html
  <ParentMessage>(children: ReadonlyArray<Html | string>): (config: SidebarMenuButtonConfig<ParentMessage>) => Html
} = dual(
  2,
  <ParentMessage>(config: SidebarMenuButtonConfig<ParentMessage>, children: ReadonlyArray<Html | string>): Html => {
    const h = html<ParentMessage>()
    const size = config.size ?? "default"
    return h.button(
      [
        h.Type("button"),
        ...(config.onClick === undefined ? [] : [h.OnClick(config.onClick)]),
        ...(config.isDisabled === true ? [h.Disabled(true)] : []),
        ...(config.isActive === true ? [h.DataAttribute("active", "")] : []),
        h.DataAttribute("size", size),
        ...(config.attributes ?? []),
        h.DataAttribute("slot", "sidebar-menu-button"),
        h.DataAttribute("sidebar", "menu-button"),
        h.Class(cn(sidebarMenuButtonVariants({ size, variant: config.variant }), config.class)),
      ],
      [...children],
    )
  },
)
export type SidebarMenuActionConfig<ParentMessage> = SlotConfig<ParentMessage> &
  Readonly<{
    onClick?: ParentMessage
    showOnHover?: boolean
  }>

export const sidebarMenuAction: {
  <ParentMessage>(config: SidebarMenuActionConfig<ParentMessage>, children: ReadonlyArray<Html | string>): Html
  <ParentMessage>(children: ReadonlyArray<Html | string>): (config: SidebarMenuActionConfig<ParentMessage>) => Html
} = dual(
  2,
  <ParentMessage>(config: SidebarMenuActionConfig<ParentMessage>, children: ReadonlyArray<Html | string>): Html => {
    const h = html<ParentMessage>()
    return h.button(
      [
        h.Type("button"),
        ...(config.onClick === undefined ? [] : [h.OnClick(config.onClick)]),
        ...(config.attributes ?? []),
        h.DataAttribute("slot", "sidebar-menu-action"),
        h.DataAttribute("sidebar", "menu-action"),
        h.Class(
          cn(
            "absolute top-1.5 right-1 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground ring-sidebar-ring outline-hidden transition-transform peer-hover/menu-button:text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
            "after:absolute after:-inset-2 md:after:hidden",
            "peer-data-[size=sm]/menu-button:top-1",
            "peer-data-[size=default]/menu-button:top-1.5",
            "peer-data-[size=lg]/menu-button:top-2.5",
            "group-data-[collapsible=icon]:hidden",
            config.showOnHover &&
              "group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 peer-data-[active]/menu-button:text-sidebar-accent-foreground data-open:opacity-100 md:opacity-0",
            config.class,
          ),
        ),
      ],
      [...children],
    )
  },
)
export const sidebarMenuBadge: {
  <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html | string>): Html
  <ParentMessage>(children: ReadonlyArray<Html | string>): (config: SlotConfig<ParentMessage>) => Html
} = dual(2, <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html | string>): Html => {
  const h = html<ParentMessage>()
  return h.div(
    [
      ...(config.attributes ?? []),
      h.DataAttribute("slot", "sidebar-menu-badge"),
      h.DataAttribute("sidebar", "menu-badge"),
      h.Class(
        cn(
          "pointer-events-none absolute right-1 flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-medium text-sidebar-foreground tabular-nums select-none",
          "peer-hover/menu-button:text-sidebar-accent-foreground peer-data-[active]/menu-button:text-sidebar-accent-foreground",
          "peer-data-[size=sm]/menu-button:top-1",
          "peer-data-[size=default]/menu-button:top-1.5",
          "peer-data-[size=lg]/menu-button:top-2.5",
          "group-data-[collapsible=icon]:hidden",
          config.class,
        ),
      ),
    ],
    [...children],
  )
})
const DEFAULT_SKELETON_TEXT_WIDTH = "70%"

export type SidebarMenuSkeletonConfig<ParentMessage> = SlotConfig<ParentMessage> &
  Readonly<{
    showIcon?: boolean
    textWidth?: string
  }>

/**
 * Loading placeholder for a menu entry, composing the skeleton component.
 * shadcn randomizes the text width per mount; FoldKit views re-run on every
 * update, so pass a stable `textWidth` per row instead (default 70%).
 */
export const sidebarMenuSkeleton = <ParentMessage>(config: SidebarMenuSkeletonConfig<ParentMessage>): Html => {
  const h = html<ParentMessage>()
  return h.div(
    [
      ...(config.attributes ?? []),
      h.DataAttribute("slot", "sidebar-menu-skeleton"),
      h.DataAttribute("sidebar", "menu-skeleton"),
      h.Class(cn("flex h-8 items-center gap-2 rounded-md px-2", config.class)),
    ],
    [
      ...(config.showIcon === true
        ? [
            skeleton<ParentMessage>({
              class: "size-4 rounded-md",
              attributes: [h.DataAttribute("sidebar", "menu-skeleton-icon")],
            }),
          ]
        : []),
      skeleton<ParentMessage>({
        class: "h-4 max-w-(--skeleton-width) flex-1",
        attributes: [
          h.Style({ "--skeleton-width": config.textWidth ?? DEFAULT_SKELETON_TEXT_WIDTH }),
          h.DataAttribute("sidebar", "menu-skeleton-text"),
        ],
      }),
    ],
  )
}

export const sidebarMenuSub: {
  <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html>): Html
  <ParentMessage>(children: ReadonlyArray<Html>): (config: SlotConfig<ParentMessage>) => Html
} = dual(2, <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html>): Html => {
  const h = html<ParentMessage>()
  return h.ul(
    [
      ...(config.attributes ?? []),
      h.DataAttribute("slot", "sidebar-menu-sub"),
      h.DataAttribute("sidebar", "menu-sub"),
      h.Class(
        cn(
          "mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l border-sidebar-border px-2.5 py-0.5",
          "group-data-[collapsible=icon]:hidden",
          config.class,
        ),
      ),
    ],
    [...children],
  )
})
export const sidebarMenuSubItem: {
  <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html>): Html
  <ParentMessage>(children: ReadonlyArray<Html>): (config: SlotConfig<ParentMessage>) => Html
} = dual(2, <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html>): Html => {
  const h = html<ParentMessage>()
  return h.li(
    [
      ...(config.attributes ?? []),
      h.DataAttribute("slot", "sidebar-menu-sub-item"),
      h.DataAttribute("sidebar", "menu-sub-item"),
      h.Class(cn("group/menu-sub-item relative", config.class)),
    ],
    [...children],
  )
})
export type SidebarMenuSubButtonConfig<ParentMessage> = SlotConfig<ParentMessage> &
  Readonly<{
    href?: string
    size?: "sm" | "md"
    isActive?: boolean
    onClick?: ParentMessage
  }>

export const sidebarMenuSubButton: {
  <ParentMessage>(config: SidebarMenuSubButtonConfig<ParentMessage>, children: ReadonlyArray<Html | string>): Html
  <ParentMessage>(children: ReadonlyArray<Html | string>): (config: SidebarMenuSubButtonConfig<ParentMessage>) => Html
} = dual(
  2,
  <ParentMessage>(config: SidebarMenuSubButtonConfig<ParentMessage>, children: ReadonlyArray<Html | string>): Html => {
    const h = html<ParentMessage>()
    const size = config.size ?? "md"
    return h.a(
      [
        ...(config.href === undefined ? [] : [h.Href(config.href)]),
        ...(config.onClick === undefined ? [] : [h.OnClick(config.onClick)]),
        ...(config.isActive === true ? [h.DataAttribute("active", "")] : []),
        h.DataAttribute("size", size),
        ...(config.attributes ?? []),
        h.DataAttribute("slot", "sidebar-menu-sub-button"),
        h.DataAttribute("sidebar", "menu-sub-button"),
        h.Class(
          cn(
            "flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-sidebar-accent-foreground",
            "data-[active]:bg-sidebar-accent data-[active]:text-sidebar-accent-foreground",
            size === "sm" && "text-xs",
            size === "md" && "text-sm",
            "group-data-[collapsible=icon]:hidden",
            config.class,
          ),
        ),
      ],
      [...children],
    )
  },
)
