import { Function } from "effect"
import type { Html } from "foldkit/html"
import { html } from "@/lib/html"

import type { SlotConfig } from "@/lib/utils"
import { cn } from "@/lib/utils"

// VIEW

const brainIcon = <ParentMessage>(): Html => {
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
      h.Class("size-4"),
    ],
    [
      h.path(
        [h.Attribute("d", "M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z")],
        [],
      ),
      h.path(
        [h.Attribute("d", "M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z")],
        [],
      ),
      h.path([h.Attribute("d", "M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4")], []),
      h.path([h.Attribute("d", "M17.599 6.5a3 3 0 0 0 .399-1.375")], []),
      h.path([h.Attribute("d", "M6.003 5.125A3 3 0 0 0 6.401 6.5")], []),
      h.path([h.Attribute("d", "M3.477 10.896a4 4 0 0 1 .585-.396")], []),
      h.path([h.Attribute("d", "M19.938 10.5a4 4 0 0 1 .585.396")], []),
      h.path([h.Attribute("d", "M6 18a4 4 0 0 1-1.967-.516")], []),
      h.path([h.Attribute("d", "M19.967 17.484A4 4 0 0 1 18 18")], []),
    ],
  )
}

const chevronDownIcon = <ParentMessage>(isOpen: boolean): Html => {
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
      h.Class(cn("size-4 transition-transform", isOpen ? "rotate-180" : "rotate-0")),
    ],
    [h.path([h.Attribute("d", "m6 9 6 6 6-6")], [])],
  )
}

export type ReasoningConfig<ParentMessage> = SlotConfig<ParentMessage> &
  Readonly<{
    isOpen: boolean
  }>

/**
 * Collapsible reasoning block. Instead of the Disclosure Submodel this uses
 * the simple accordion pattern: the consumer keeps an `isOpen` boolean in its
 * Model, flips it on the trigger's `onToggled`, and renders
 * `reasoningContent` conditionally (`isOpen ? [reasoningContent(...)] : []`).
 * AI Elements' auto-open while streaming, auto-close after streaming, and
 * duration timing are consumer concerns here (gap): track the elapsed
 * seconds in the Model and pass them as `durationSeconds`.
 */
export const reasoning: {
  <ParentMessage>(config: ReasoningConfig<ParentMessage>, children: ReadonlyArray<Html>): Html
  <ParentMessage>(children: ReadonlyArray<Html>): (config: ReasoningConfig<ParentMessage>) => Html
} = Function.dual(2, <ParentMessage>(config: ReasoningConfig<ParentMessage>, children: ReadonlyArray<Html>): Html => {
  const h = html<ParentMessage>()
  return h.div(
    [
      ...(config.attributes ?? []),
      h.DataAttribute("slot", "reasoning"),
      h.DataAttribute("state", config.isOpen ? "open" : "closed"),
      h.Class(cn("not-prose mb-4", config.class)),
    ],
    [...children],
  )
})

export type ReasoningTriggerConfig<ParentMessage> = SlotConfig<ParentMessage> &
  Readonly<{
    isOpen: boolean
    onToggled: ParentMessage
    isStreaming?: boolean
    durationSeconds?: number
  }>

const thinkingMessage = <ParentMessage>(isStreaming: boolean, durationSeconds: number | undefined): Html => {
  const h = html<ParentMessage>()
  if (isStreaming || durationSeconds === 0) {
    return h.span([h.Class("shimmer")], ["Thinking..."])
  }
  if (durationSeconds === undefined) {
    return h.span([], ["Thought for a few seconds"])
  }
  return h.span([], [`Thought for ${durationSeconds} seconds`])
}

/**
 * Trigger row: brain icon, thinking label, and a chevron that flips with
 * `isOpen`. While `isStreaming` the label shimmers via the theme's shimmer
 * utility; afterwards it reads "Thought for N seconds" from
 * `durationSeconds`. Children replace the default row.
 */
export const reasoningTrigger: {
  <ParentMessage>(config: ReasoningTriggerConfig<ParentMessage>, children?: ReadonlyArray<Html | string>): Html
  <ParentMessage>(children?: ReadonlyArray<Html | string>): (config: ReasoningTriggerConfig<ParentMessage>) => Html
} = Function.dual(
  (args) => args.length > 0 && !Array.isArray(args[0]),
  <ParentMessage>(config: ReasoningTriggerConfig<ParentMessage>, children: ReadonlyArray<Html | string> = []): Html => {
    const h = html<ParentMessage>()
    const defaultChildren: ReadonlyArray<Html> = [
      brainIcon<ParentMessage>(),
      thinkingMessage<ParentMessage>(config.isStreaming ?? false, config.durationSeconds),
      chevronDownIcon<ParentMessage>(config.isOpen),
    ]
    return h.button(
      [
        h.Type("button"),
        h.OnClick(config.onToggled),
        h.AriaExpanded(config.isOpen),
        ...(config.attributes ?? []),
        h.DataAttribute("slot", "reasoning-trigger"),
        h.DataAttribute("state", config.isOpen ? "open" : "closed"),
        h.Class(
          cn(
            "flex w-full items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground",
            config.class,
          ),
        ),
      ],
      children.length > 0 ? [...children] : defaultChildren,
    )
  },
)

/**
 * Reasoning body. Render it conditionally on the consumer's `isOpen` state.
 * AI Elements renders markdown through Streamdown here; FoldKit has no
 * markdown renderer (gap), so pass already-rendered children or plain text.
 */
export const reasoningContent: {
  <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html | string>): Html
  <ParentMessage>(children: ReadonlyArray<Html | string>): (config: SlotConfig<ParentMessage>) => Html
} = Function.dual(
  2,
  <ParentMessage>(config: SlotConfig<ParentMessage>, children: ReadonlyArray<Html | string>): Html => {
    const h = html<ParentMessage>()
    return h.div(
      [
        ...(config.attributes ?? []),
        h.DataAttribute("slot", "reasoning-content"),
        h.Class(cn("mt-4 text-sm text-muted-foreground outline-none", config.class)),
      ],
      [...children],
    )
  },
)
