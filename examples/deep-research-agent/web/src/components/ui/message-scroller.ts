import { Effect, Function, Match, Option, Queue, Schema, Stream } from "effect"
import * as Command from "foldkit/command"
import type { Html } from "foldkit/html"
import { html } from "foldkit/html"
import { m } from "foldkit/message"
import * as Mount from "foldkit/mount"
import { evo } from "foldkit/struct"

import { button } from "@/components/ui/button"
import type { SlotConfig } from "@/lib/utils"
import { cn } from "@/lib/utils"

// MODEL

/**
 * foldcn-owned message scroller Submodel: there is no `@foldkit/ui`
 * message-scroller primitive, so this file ships the behavior itself as a
 * Model plus two element Mounts. It keeps a chat viewport pinned to the
 * newest message while the user is following the conversation, releases the
 * pin when they scroll up, and offers a scroll-to-bottom button whenever the
 * viewport is away from the end.
 *
 * Consumer wiring mirrors other Submodels:
 *
 * ```ts
 * const GotMessageScrollerMessage = m('GotMessageScrollerMessage', {
 *   message: MessageScroller.Message,
 * })
 *
 * // MODEL: embed it, giving the instance a document-unique id
 * scroller: MessageScroller.init({ id: 'chat-scroller' })
 *
 * // UPDATE: delegate and lift the returned Commands
 * GotMessageScrollerMessage: ({ message }) => {
 *   const [scroller, commands] = MessageScroller.update(model.scroller, message)
 *   return [
 *     evo(model, { scroller: () => scroller }),
 *     commands.map(Command.mapMessage((inner) => GotMessageScrollerMessage({ message: inner }))),
 *   ]
 * }
 *
 * // VIEW: pass the model and the same lift to the parts
 * MessageScroller.root({}, [
 *   MessageScroller.viewport({ model: model.scroller, toParentMessage }, [
 *     MessageScroller.content({ toParentMessage }, [...items]),
 *   ]),
 *   MessageScroller.scrollButton({ model: model.scroller, toParentMessage }),
 * ])
 * ```
 *
 * Gaps against shadcn's full version (out of scope v1): anchored-turn
 * behavior (pinning the latest user turn to the top of the viewport),
 * scroll-position preservation when older messages are prepended, and
 * programmatic jump-to-message.
 */
export const Model = Schema.Struct({
  id: Schema.String,
  isFollowing: Schema.Boolean,
  isAtBottom: Schema.Boolean,
})

export type Model = typeof Model.Type

export type InitConfig = Readonly<{
  id: string
}>

/** Creates an initial scroller model. Starts following, assuming the conversation renders scrolled to the end. */
export const init = (config: InitConfig): Model => ({
  id: config.id,
  isFollowing: true,
  isAtBottom: true,
})

/** The DOM id the viewport part renders with, and the ScrollToBottom Command targets. */
export const viewportId = (model: Model): string => `${model.id}-viewport`

// MESSAGE

/** Emitted by the viewport scroll Mount whenever the viewport crosses the at-bottom threshold, and once at mount. */
export const ScrolledViewport = m("ScrolledViewport", { isAtBottom: Schema.Boolean })
/** Emitted by the content growth Mount when the content element gets taller (a message streamed in or was appended). */
export const GrewContent = m("GrewContent")
/** Sent when the scroll-to-bottom button is clicked. Resumes following and smooth-scrolls to the end. */
export const ClickedScrollToBottom = m("ClickedScrollToBottom")
/** Acknowledgment of the ScrollToBottom Command. `update` no-ops on it. */
export const CompletedScrollToBottom = m("CompletedScrollToBottom")

export const Message = Schema.Union([ScrolledViewport, GrewContent, ClickedScrollToBottom, CompletedScrollToBottom])

export type ScrolledViewport = typeof ScrolledViewport.Type
export type GrewContent = typeof GrewContent.Type
export type ClickedScrollToBottom = typeof ClickedScrollToBottom.Type
export type CompletedScrollToBottom = typeof CompletedScrollToBottom.Type
export type Message = typeof Message.Type

// COMMAND

/** Scrolls the viewport element to its end: smooth for the button click, instant for follow re-pinning. */
export const ScrollToBottom = Command.define(
  "ScrollToBottom",
  { viewportId: Schema.String, behavior: Schema.Literals(["smooth", "instant"]) },
  CompletedScrollToBottom,
)(({ behavior, viewportId: targetId }) =>
  Effect.sync(() => {
    Option.match(Option.fromNullishOr(document.getElementById(targetId)), {
      onNone: Function.constVoid,
      onSome: (viewport) => viewport.scrollTo({ top: viewport.scrollHeight, behavior }),
    })
    return CompletedScrollToBottom()
  }),
)

// MOUNT

const AT_BOTTOM_THRESHOLD = 8

/* v8 ignore next 2 -- only called from the Mount stream bodies, which run against a live element in a browser runtime */
const isScrolledToBottom = (element: Element): boolean =>
  element.scrollHeight - element.scrollTop - element.clientHeight <= AT_BOTTOM_THRESHOLD

/**
 * Scroll-listener Mount attached by the viewport part. Emits the initial
 * at-bottom state at mount, then a `ScrolledViewport` whenever the viewport
 * crosses the at-bottom threshold in either direction.
 */
export const TrackViewportScroll = Mount.defineStream(
  "TrackViewportScroll",
  ScrolledViewport,
)(
  (element) =>
    /* v8 ignore start -- Mount stream body (scroll addEventListener closure) only runs against a live element in a browser runtime; the scene harness intercepts Mounts via Scene.Mount.resolve */
    Stream.callback<typeof ScrolledViewport.Type>((queue) =>
      Effect.gen(function* () {
        yield* Effect.acquireRelease(
          Effect.sync(() => {
            let wasAtBottom = isScrolledToBottom(element)
            Queue.offerUnsafe(queue, ScrolledViewport({ isAtBottom: wasAtBottom }))
            const handleScroll = () => {
              const isAtBottom = isScrolledToBottom(element)
              if (isAtBottom !== wasAtBottom) {
                wasAtBottom = isAtBottom
                Queue.offerUnsafe(queue, ScrolledViewport({ isAtBottom }))
              }
            }
            element.addEventListener("scroll", handleScroll, { passive: true })
            return handleScroll
          }),
          (handleScroll) => Effect.sync(() => element.removeEventListener("scroll", handleScroll)),
        )
        return yield* Effect.never
      }),
    ),
  /* v8 ignore stop */
)

/**
 * ResizeObserver Mount attached by the content part. Emits `GrewContent`
 * whenever the content element gets taller, including once at mount, so
 * `update` can re-pin the viewport while following. Height shrinkage is
 * ignored.
 */
export const ObserveContentGrowth = Mount.defineStream(
  "ObserveContentGrowth",
  GrewContent,
)(
  (element) =>
    /* v8 ignore start -- Mount stream body (ResizeObserver closure) only runs against a live element in a browser runtime; the scene harness intercepts Mounts via Scene.Mount.resolve */
    Stream.callback<typeof GrewContent.Type>((queue) =>
      Effect.gen(function* () {
        yield* Effect.acquireRelease(
          Effect.sync(() => {
            let lastHeight = 0
            const observer = new ResizeObserver(() => {
              const height = element.getBoundingClientRect().height
              if (height > lastHeight) {
                Queue.offerUnsafe(queue, GrewContent())
              }
              lastHeight = height
            })
            observer.observe(element)
            return observer
          }),
          (observer) => Effect.sync(() => observer.disconnect()),
        )
        return yield* Effect.never
      }),
    ),
  /* v8 ignore stop */
)

// UPDATE

export type UpdateReturn = readonly [Model, ReadonlyArray<Command.Command<Message>>]

const withUpdateReturn = Match.withReturnType<UpdateReturn>()

/**
 * Processes a scroller message and returns the next model plus any
 * ScrollToBottom Commands. Scrolling to the bottom (by hand or via the
 * button) resumes following; scrolling away releases it. Content growth
 * re-pins the viewport instantly only while it is glued at the bottom
 * (`isFollowing && isAtBottom`), so a click-initiated smooth scroll that the
 * user interrupts by scrolling up is never yanked back down.
 */
export const update = (model: Model, message: Message): UpdateReturn =>
  Match.value(message).pipe(
    withUpdateReturn,
    Match.tagsExhaustive({
      ScrolledViewport: ({ isAtBottom }) => [
        evo(model, { isAtBottom: () => isAtBottom, isFollowing: () => isAtBottom }),
        [],
      ],
      // Re-pin only when actually at the bottom. `ClickedScrollToBottom` sets
      // `isFollowing` before the smooth scroll arrives (so `isAtBottom` is
      // still false); gating on `isAtBottom` keeps that transient state from
      // force-scrolling a user who scrolled away mid-animation.
      GrewContent: () =>
        model.isFollowing && model.isAtBottom
          ? [model, [ScrollToBottom({ behavior: "instant", viewportId: viewportId(model) })]]
          : [model, []],
      // No-op when already pinned (the button is inert at the bottom, but a
      // programmatic dispatch would otherwise fire a redundant scroll).
      ClickedScrollToBottom: () =>
        model.isAtBottom
          ? [model, []]
          : [
              evo(model, { isFollowing: () => true }),
              [ScrollToBottom({ behavior: "smooth", viewportId: viewportId(model) })],
            ],
      CompletedScrollToBottom: () => [model, []],
    }),
  )

// VIEW

const arrowDownIcon = <ParentMessage>(): Html => {
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
    [h.path([h.Attribute("d", "M12 5v14")], []), h.path([h.Attribute("d", "m19 12-7 7-7-7")], [])],
  )
}

/** Positioning frame for the scroller: wrap the viewport and the scroll button in it. */
export const root = <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html>): Html => {
  const h = html<ParentMessage>()
  return h.div(
    [
      ...(config.attributes ?? []),
      h.DataAttribute("slot", "message-scroller"),
      h.Class(cn("group/message-scroller relative flex size-full min-h-0 flex-col overflow-hidden", config.class)),
    ],
    [...children],
  )
}

export type ViewportConfig<ParentMessage> = SlotConfig<ParentMessage> &
  Readonly<{
    model: Model
    toParentMessage: (message: Message) => ParentMessage
  }>

/**
 * The scrolling element. Carries the id the ScrollToBottom Command targets
 * and the scroll-listener Mount. shadcn's `data-autoscrolling` scrollbar
 * hiding is not ported (gap): this version does not distinguish programmatic
 * scrolls from user scrolls.
 */
export const viewport = <ParentMessage>(config: ViewportConfig<ParentMessage>, children: ReadonlyArray<Html>): Html => {
  const h = html<ParentMessage>()
  return h.div(
    [
      h.Id(viewportId(config.model)),
      h.OnMount(Mount.mapMessage(TrackViewportScroll(), config.toParentMessage)),
      ...(config.attributes ?? []),
      h.DataAttribute("slot", "message-scroller-viewport"),
      h.Class(
        cn(
          "size-full min-h-0 min-w-0 scroll-fade-b scrollbar-thin scrollbar-gutter-stable overflow-y-auto overscroll-contain contain-content",
          config.class,
        ),
      ),
    ],
    [...children],
  )
}

export type ContentConfig<ParentMessage> = SlotConfig<ParentMessage> &
  Readonly<{
    toParentMessage: (message: Message) => ParentMessage
  }>

/** Column wrapper for the messages. Carries the growth-observer Mount that keeps the viewport pinned while following. */
export const content = <ParentMessage>(config: ContentConfig<ParentMessage>, children: ReadonlyArray<Html>): Html => {
  const h = html<ParentMessage>()
  return h.div(
    [
      h.OnMount(Mount.mapMessage(ObserveContentGrowth(), config.toParentMessage)),
      ...(config.attributes ?? []),
      h.DataAttribute("slot", "message-scroller-content"),
      h.Class(cn("flex h-max min-h-full flex-col gap-8", config.class)),
    ],
    [...children],
  )
}

/** One conversation entry, content-visibility contained so long transcripts stay cheap to render. */
export const item = <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html>): Html => {
  const h = html<ParentMessage>()
  return h.div(
    [
      ...(config.attributes ?? []),
      h.DataAttribute("slot", "message-scroller-item"),
      h.Class(cn("min-w-0 shrink-0 [contain-intrinsic-size:auto_10rem] [content-visibility:auto]", config.class)),
    ],
    [...children],
  )
}

const scrollButtonClass =
  "absolute inset-s-1/2 bottom-4 size-8 -translate-x-1/2 rounded-full border border-border bg-background text-foreground shadow-md transition-[translate,scale,opacity] duration-200 hover:bg-muted hover:text-foreground data-[active=false]:pointer-events-none data-[active=false]:translate-y-full data-[active=false]:scale-95 data-[active=false]:opacity-0 data-[active=false]:duration-400 data-[active=false]:ease-[cubic-bezier(0.7,0,0.84,0)] data-[active=true]:translate-y-0 data-[active=true]:scale-100 data-[active=true]:opacity-100 data-[active=true]:ease-[cubic-bezier(0.23,1,0.32,1)] rtl:translate-x-1/2"

export type ScrollButtonConfig<ParentMessage> = SlotConfig<ParentMessage> &
  Readonly<{
    model: Model
    toParentMessage: (message: Message) => ParentMessage
  }>

/**
 * Floating scroll-to-bottom button, composing the button component. Stays in
 * the DOM and animates out while the viewport is at the bottom. Render it as
 * a sibling of the viewport, inside `root`.
 */
export const scrollButton = <ParentMessage>(config: ScrollButtonConfig<ParentMessage>): Html => {
  const h = html<ParentMessage>()
  return button(
    {
      variant: "secondary",
      size: "icon",
      dataSlot: "message-scroller-button",
      onClick: config.toParentMessage(ClickedScrollToBottom()),
      class: cn(scrollButtonClass, config.class),
      attributes: [
        ...(config.attributes ?? []),
        h.DataAttribute("direction", "end"),
        h.DataAttribute("active", String(!config.model.isAtBottom)),
      ],
    },
    [arrowDownIcon<ParentMessage>(), h.span([h.Class("sr-only")], ["Scroll to end"])],
  )
}
