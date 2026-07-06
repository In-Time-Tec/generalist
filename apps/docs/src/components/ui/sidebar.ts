import { Match, Schema } from "effect"
import type { Html } from "foldkit/html"
import { html } from "foldkit/html"
import { m } from "foldkit/message"
import { evo } from "foldkit/struct"
import { type VariantProps, cva } from "class-variance-authority"

import { button } from "@/components/ui/button"
import type { InputConfig } from "@/components/ui/input"
import { input } from "@/components/ui/input"
import { separator } from "@/components/ui/separator"
import { skeleton } from "@/components/ui/skeleton"
import type { SlotConfig } from "@/lib/utils"
import { cn } from "@/lib/utils"

// MODEL

/**
 * foldcn-owned sidebar Submodel: unlike most foldcn components there is no
 * `@foldkit/ui` sidebar primitive, so this file ships the minimal state
 * machine itself. Embed `Model` in your Model, delegate a wrapped Message to
 * `update`, and pass the model to the view parts. The cmd+b keyboard shortcut
 * from shadcn is not ported (gap); dispatch `ToggledSidebar` from your own
 * keyboard subscription if you need it.
 */
export const Model = Schema.Struct({
  state: Schema.Literals(["Expanded", "Collapsed"]),
  isMobileOpen: Schema.Boolean,
})

export type Model = typeof Model.Type

export type InitConfig = Readonly<{
  state?: Model["state"]
}>

/** Creates an initial sidebar model. Defaults to expanded with the mobile sidebar closed. */
export const init = (config: InitConfig = {}): Model => ({
  state: config.state ?? "Expanded",
  isMobileOpen: false,
})

// MESSAGE

/** Sent when the trigger or rail is clicked. Toggles the desktop sidebar between expanded and collapsed. */
export const ToggledSidebar = m("ToggledSidebar")
/** Sent to open the mobile sidebar overlay. */
export const OpenedMobile = m("OpenedMobile")
/** Sent to close the mobile sidebar overlay, e.g. from the mobile backdrop click. */
export const ClosedMobile = m("ClosedMobile")

export const Message = Schema.Union([ToggledSidebar, OpenedMobile, ClosedMobile])

export type ToggledSidebar = typeof ToggledSidebar.Type
export type OpenedMobile = typeof OpenedMobile.Type
export type ClosedMobile = typeof ClosedMobile.Type
export type Message = typeof Message.Type

// UPDATE

/** Processes a sidebar message and returns the next model. Produces no commands and no OutMessages. */
export const update = (model: Model, message: Message): Model =>
  Match.value(message).pipe(
    Match.tagsExhaustive({
      ToggledSidebar: () => evo(model, { state: (state) => (state === "Expanded" ? "Collapsed" : "Expanded") }),
      OpenedMobile: () => evo(model, { isMobileOpen: () => true }),
      ClosedMobile: () => evo(model, { isMobileOpen: () => false }),
    }),
  )

// VIEW

const SIDEBAR_WIDTH = "16rem"
const SIDEBAR_WIDTH_MOBILE = "18rem"
const SIDEBAR_WIDTH_ICON = "3rem"

export type SidebarSide = "left" | "right"
export type SidebarVariant = "sidebar" | "floating" | "inset"
export type SidebarCollapsible = "offcanvas" | "icon" | "none"

const toStateValue = (model: Model): string => (model.state === "Expanded" ? "expanded" : "collapsed")

const panelLeftIcon = <ParentMessage>(): Html => {
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
      h.rect([h.Width("18"), h.Height("18"), h.X("3"), h.Y("3"), h.Rx("2")], []),
      h.path([h.Attribute("d", "M9 3v18")], []),
    ],
  )
}

/**
 * Sidebar layout root, shadcn's `SidebarProvider` div: sets the sidebar width
 * CSS variables and the `group/sidebar-wrapper` marker. Wrap the `sidebar`
 * part and `sidebarInset` in it.
 */
export const sidebarWrapper = <ParentMessage>(
  config: SlotConfig<ParentMessage>,
  children: ReadonlyArray<Html>,
): Html => {
  const h = html<ParentMessage>()
  return h.div(
    [
      h.Style({ "--sidebar-width": SIDEBAR_WIDTH, "--sidebar-width-icon": SIDEBAR_WIDTH_ICON }),
      ...(config.attributes ?? []),
      h.DataAttribute("slot", "sidebar-wrapper"),
      h.Class(cn("group/sidebar-wrapper flex min-h-svh w-full has-data-[variant=inset]:bg-sidebar", config.class)),
    ],
    [...children],
  )
}

export type SidebarConfig<ParentMessage> = SlotConfig<ParentMessage> &
  Readonly<{
    model: Model
    onDismissedMobile: ParentMessage
    side?: SidebarSide
    variant?: SidebarVariant
    collapsible?: SidebarCollapsible
  }>

const mobileOverlayClass = "fixed inset-0 z-50 bg-black/50 md:hidden"

const mobilePanelClass =
  "fixed inset-y-0 z-50 flex h-full w-(--sidebar-width) flex-col bg-sidebar p-0 text-sidebar-foreground shadow-lg md:hidden"

/**
 * The sidebar itself: a fixed desktop panel driven by `model.state` (with
 * offcanvas and icon collapsible modes) plus a mobile overlay gated on
 * `model.isMobileOpen`. The mobile rendering is a plain fixed overlay rather
 * than the sheet component because the sheet is a Dialog Submodel that would
 * force a second model onto every consumer; the trade-off is no slide
 * transition on mobile. `toChildren` is a callback because the children
 * render twice (desktop and mobile) and vdom nodes must not be shared.
 * `onDismissedMobile` fires when the mobile backdrop is clicked; map it to
 * `ClosedMobile`.
 */
export const sidebar = <ParentMessage>(
  config: SidebarConfig<ParentMessage>,
  toChildren: () => ReadonlyArray<Html>,
): Html => {
  const h = html<ParentMessage>()
  const side = config.side ?? "left"
  const variant = config.variant ?? "sidebar"
  const collapsible = config.collapsible ?? "offcanvas"

  if (collapsible === "none") {
    return h.div(
      [
        ...(config.attributes ?? []),
        h.DataAttribute("slot", "sidebar"),
        h.Class(cn("flex h-full w-(--sidebar-width) flex-col bg-sidebar text-sidebar-foreground", config.class)),
      ],
      [...toChildren()],
    )
  }

  const isFloatingOrInset = variant === "floating" || variant === "inset"

  return h.div(
    [h.DataAttribute("slot", "sidebar-root"), h.Class("contents")],
    [
      h.div(
        [
          h.DataAttribute("slot", "sidebar"),
          h.DataAttribute("state", toStateValue(config.model)),
          h.DataAttribute("collapsible", config.model.state === "Collapsed" ? collapsible : ""),
          h.DataAttribute("variant", variant),
          h.DataAttribute("side", side),
          h.Class("group peer hidden text-sidebar-foreground md:block"),
        ],
        [
          h.div(
            [
              h.DataAttribute("slot", "sidebar-gap"),
              h.Class(
                cn(
                  "relative w-(--sidebar-width) bg-transparent transition-[width] duration-200 ease-linear",
                  "group-data-[collapsible=offcanvas]:w-0",
                  "group-data-[side=right]:rotate-180",
                  isFloatingOrInset
                    ? "group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]"
                    : "group-data-[collapsible=icon]:w-(--sidebar-width-icon)",
                ),
              ),
            ],
            [],
          ),
          h.div(
            [
              ...(config.attributes ?? []),
              h.DataAttribute("slot", "sidebar-container"),
              h.Class(
                cn(
                  "fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) transition-[left,right,width] duration-200 ease-linear md:flex",
                  side === "left"
                    ? "left-0 group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)]"
                    : "right-0 group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)]",
                  isFloatingOrInset
                    ? "p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]"
                    : "group-data-[collapsible=icon]:w-(--sidebar-width-icon) group-data-[side=left]:border-r group-data-[side=right]:border-l",
                  config.class,
                ),
              ),
            ],
            [
              h.div(
                [
                  h.DataAttribute("sidebar", "sidebar"),
                  h.DataAttribute("slot", "sidebar-inner"),
                  h.Class(
                    "flex h-full w-full flex-col bg-sidebar group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:border group-data-[variant=floating]:border-sidebar-border group-data-[variant=floating]:shadow-sm",
                  ),
                ],
                [...toChildren()],
              ),
            ],
          ),
        ],
      ),
      ...(config.model.isMobileOpen
        ? [
            h.div(
              [
                h.OnClick(config.onDismissedMobile),
                h.DataAttribute("slot", "sidebar-mobile-overlay"),
                h.Class(mobileOverlayClass),
              ],
              [],
            ),
            h.div(
              [
                h.Style({ "--sidebar-width": SIDEBAR_WIDTH_MOBILE }),
                h.DataAttribute("slot", "sidebar"),
                h.DataAttribute("mobile", "true"),
                h.DataAttribute("side", side),
                h.Class(cn(mobilePanelClass, side === "left" ? "left-0" : "right-0")),
              ],
              [h.div([h.Class("flex h-full w-full flex-col")], [...toChildren()])],
            ),
          ]
        : []),
    ],
  )
}

export type SidebarTriggerConfig<ParentMessage> = SlotConfig<ParentMessage> &
  Readonly<{
    onClick: ParentMessage
  }>

/** Toggle button with the panel-left icon. Map `onClick` to `ToggledSidebar` (or `OpenedMobile` on small screens). */
export const sidebarTrigger = <ParentMessage>(config: SidebarTriggerConfig<ParentMessage>): Html => {
  const h = html<ParentMessage>()
  return button(
    {
      variant: "ghost",
      size: "icon",
      class: cn("size-7", config.class),
      onClick: config.onClick,
      attributes: [...(config.attributes ?? []), h.DataAttribute("sidebar", "trigger")],
    },
    [panelLeftIcon<ParentMessage>(), h.span([h.Class("sr-only")], ["Toggle Sidebar"])],
  )
}

export type SidebarRailConfig<ParentMessage> = SlotConfig<ParentMessage> &
  Readonly<{
    onClick: ParentMessage
  }>

/** Thin click target along the sidebar edge that toggles it. Map `onClick` to `ToggledSidebar`. */
export const sidebarRail = <ParentMessage>(config: SidebarRailConfig<ParentMessage>): Html => {
  const h = html<ParentMessage>()
  return h.button(
    [
      h.Type("button"),
      h.OnClick(config.onClick),
      h.AriaLabel("Toggle Sidebar"),
      h.Tabindex(-1),
      h.Title("Toggle Sidebar"),
      ...(config.attributes ?? []),
      h.DataAttribute("sidebar", "rail"),
      h.DataAttribute("slot", "sidebar-rail"),
      h.Class(
        cn(
          "absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-all ease-linear group-data-[side=left]:-right-4 group-data-[side=right]:left-0 after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] hover:after:bg-sidebar-border sm:flex",
          "in-data-[side=left]:cursor-w-resize in-data-[side=right]:cursor-e-resize",
          "[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize",
          "group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:left-full hover:group-data-[collapsible=offcanvas]:bg-sidebar",
          "[[data-side=left][data-collapsible=offcanvas]_&]:-right-2",
          "[[data-side=right][data-collapsible=offcanvas]_&]:-left-2",
          config.class,
        ),
      ),
    ],
    [],
  )
}

/** Main content area that sits beside the sidebar. */
export const sidebarInset = <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html>): Html => {
  const h = html<ParentMessage>()
  return h.main(
    [
      ...(config.attributes ?? []),
      h.DataAttribute("slot", "sidebar-inset"),
      h.Class(
        cn(
          "relative flex w-full flex-1 flex-col bg-background",
          "md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow-sm md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2",
          config.class,
        ),
      ),
    ],
    [...children],
  )
}

/** Search input styled for the sidebar, composing the input component. */
export const sidebarInput = <ParentMessage>(config: InputConfig<ParentMessage>): Html => {
  const h = html<ParentMessage>()
  return input({
    ...config,
    class: cn("h-8 w-full bg-background shadow-none", config.class),
    attributes: [...(config.attributes ?? []), h.DataAttribute("sidebar", "input")],
  })
}

export const sidebarHeader = <ParentMessage>(
  config: SlotConfig<ParentMessage>,
  children: ReadonlyArray<Html>,
): Html => {
  const h = html<ParentMessage>()
  return h.div(
    [
      ...(config.attributes ?? []),
      h.DataAttribute("slot", "sidebar-header"),
      h.DataAttribute("sidebar", "header"),
      h.Class(cn("flex flex-col gap-2 p-2", config.class)),
    ],
    [...children],
  )
}

export const sidebarFooter = <ParentMessage>(
  config: SlotConfig<ParentMessage>,
  children: ReadonlyArray<Html>,
): Html => {
  const h = html<ParentMessage>()
  return h.div(
    [
      ...(config.attributes ?? []),
      h.DataAttribute("slot", "sidebar-footer"),
      h.DataAttribute("sidebar", "footer"),
      h.Class(cn("flex flex-col gap-2 p-2", config.class)),
    ],
    [...children],
  )
}

/** Horizontal rule between sidebar sections, composing the separator component. */
export const sidebarSeparator = <ParentMessage>(config: SlotConfig<ParentMessage>): Html => {
  const h = html<ParentMessage>()
  return separator({
    class: cn("mx-2 w-auto bg-sidebar-border", config.class),
    attributes: [...(config.attributes ?? []), h.DataAttribute("sidebar", "separator")],
  })
}

export const sidebarContent = <ParentMessage>(
  config: SlotConfig<ParentMessage>,
  children: ReadonlyArray<Html>,
): Html => {
  const h = html<ParentMessage>()
  return h.div(
    [
      ...(config.attributes ?? []),
      h.DataAttribute("slot", "sidebar-content"),
      h.DataAttribute("sidebar", "content"),
      h.Class(
        cn(
          "flex min-h-0 flex-1 flex-col gap-2 overflow-auto group-data-[collapsible=icon]:overflow-hidden",
          config.class,
        ),
      ),
    ],
    [...children],
  )
}

export const sidebarGroup = <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html>): Html => {
  const h = html<ParentMessage>()
  return h.div(
    [
      ...(config.attributes ?? []),
      h.DataAttribute("slot", "sidebar-group"),
      h.DataAttribute("sidebar", "group"),
      h.Class(cn("relative flex w-full min-w-0 flex-col p-2", config.class)),
    ],
    [...children],
  )
}

export const sidebarGroupLabel = <ParentMessage>(
  config: SlotConfig<ParentMessage>,
  children: ReadonlyArray<Html | string>,
): Html => {
  const h = html<ParentMessage>()
  return h.div(
    [
      ...(config.attributes ?? []),
      h.DataAttribute("slot", "sidebar-group-label"),
      h.DataAttribute("sidebar", "group-label"),
      h.Class(
        cn(
          "flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-sidebar-foreground/70 ring-sidebar-ring outline-hidden transition-[margin,opacity] duration-200 ease-linear focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
          "group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0",
          config.class,
        ),
      ),
    ],
    [...children],
  )
}

export type SidebarGroupActionConfig<ParentMessage> = SlotConfig<ParentMessage> &
  Readonly<{
    onClick?: ParentMessage
  }>

export const sidebarGroupAction = <ParentMessage>(
  config: SidebarGroupActionConfig<ParentMessage>,
  children: ReadonlyArray<Html | string>,
): Html => {
  const h = html<ParentMessage>()
  return h.button(
    [
      h.Type("button"),
      ...(config.onClick === undefined ? [] : [h.OnClick(config.onClick)]),
      ...(config.attributes ?? []),
      h.DataAttribute("slot", "sidebar-group-action"),
      h.DataAttribute("sidebar", "group-action"),
      h.Class(
        cn(
          "absolute top-3.5 right-3 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground ring-sidebar-ring outline-hidden transition-transform hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
          "after:absolute after:-inset-2 md:after:hidden",
          "group-data-[collapsible=icon]:hidden",
          config.class,
        ),
      ),
    ],
    [...children],
  )
}

export const sidebarGroupContent = <ParentMessage>(
  config: SlotConfig<ParentMessage>,
  children: ReadonlyArray<Html>,
): Html => {
  const h = html<ParentMessage>()
  return h.div(
    [
      ...(config.attributes ?? []),
      h.DataAttribute("slot", "sidebar-group-content"),
      h.DataAttribute("sidebar", "group-content"),
      h.Class(cn("w-full text-sm", config.class)),
    ],
    [...children],
  )
}

export const sidebarMenu = <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html>): Html => {
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
}

export const sidebarMenuItem = <ParentMessage>(
  config: SlotConfig<ParentMessage>,
  children: ReadonlyArray<Html>,
): Html => {
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
}

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
export const sidebarMenuButton = <ParentMessage>(
  config: SidebarMenuButtonConfig<ParentMessage>,
  children: ReadonlyArray<Html | string>,
): Html => {
  const h = html<ParentMessage>()
  const size = config.size ?? "default"
  return h.button(
    [
      h.Type("button"),
      ...(config.onClick === undefined ? [] : [h.OnClick(config.onClick)]),
      ...(config.isDisabled ? [h.Disabled(true)] : []),
      ...(config.isActive ? [h.DataAttribute("active", "")] : []),
      h.DataAttribute("size", String(size)),
      ...(config.attributes ?? []),
      h.DataAttribute("slot", "sidebar-menu-button"),
      h.DataAttribute("sidebar", "menu-button"),
      h.Class(cn(sidebarMenuButtonVariants({ size, variant: config.variant }), config.class)),
    ],
    [...children],
  )
}

export type SidebarMenuActionConfig<ParentMessage> = SlotConfig<ParentMessage> &
  Readonly<{
    onClick?: ParentMessage
    showOnHover?: boolean
  }>

export const sidebarMenuAction = <ParentMessage>(
  config: SidebarMenuActionConfig<ParentMessage>,
  children: ReadonlyArray<Html | string>,
): Html => {
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
}

export const sidebarMenuBadge = <ParentMessage>(
  config: SlotConfig<ParentMessage>,
  children: ReadonlyArray<Html | string>,
): Html => {
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
}

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
      ...(config.showIcon
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

export const sidebarMenuSub = <ParentMessage>(
  config: SlotConfig<ParentMessage>,
  children: ReadonlyArray<Html>,
): Html => {
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
}

export const sidebarMenuSubItem = <ParentMessage>(
  config: SlotConfig<ParentMessage>,
  children: ReadonlyArray<Html>,
): Html => {
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
}

export type SidebarMenuSubButtonConfig<ParentMessage> = SlotConfig<ParentMessage> &
  Readonly<{
    href?: string
    size?: "sm" | "md"
    isActive?: boolean
    onClick?: ParentMessage
  }>

export const sidebarMenuSubButton = <ParentMessage>(
  config: SidebarMenuSubButtonConfig<ParentMessage>,
  children: ReadonlyArray<Html | string>,
): Html => {
  const h = html<ParentMessage>()
  const size = config.size ?? "md"
  return h.a(
    [
      ...(config.href === undefined ? [] : [h.Href(config.href)]),
      ...(config.onClick === undefined ? [] : [h.OnClick(config.onClick)]),
      ...(config.isActive ? [h.DataAttribute("active", "")] : []),
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
}
