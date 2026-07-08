import type { Html } from "foldkit/html"
import { html } from "foldkit/html"

import { cn } from "@/lib/utils"

import type { Message } from "../app/message"

const h = html<Message>()

export const mark = (className: string): Html =>
  h.svg(
    [
      h.Xmlns("http://www.w3.org/2000/svg"),
      h.ViewBox("0 0 180 180"),
      h.Fill("none"),
      h.AriaHidden(true),
      h.Class(className),
    ],
    [
      h.rect(
        [
          h.Attribute("x", "41.25"),
          h.Attribute("y", "41.25"),
          h.Attribute("width", "45"),
          h.Attribute("height", "97.5"),
          h.Class("fill-accent-600 dark:fill-accent-500"),
        ],
        [],
      ),
      h.path(
        [h.D("M93.75 41.25H118.125A20.625 20.625 0 0 1 118.125 82.5H93.75Z"), h.Class("fill-gray-900 dark:fill-white")],
        [],
      ),
      h.path(
        [h.D("M93.75 90H114.375A24.375 24.375 0 0 1 114.375 138.75H93.75Z"), h.Class("fill-gray-900 dark:fill-white")],
        [],
      ),
    ],
  )

export const betaBadge = (className?: string): Html =>
  h.span(
    [
      h.Class(
        cn(
          "-rotate-6 rounded bg-accent-700 px-1.5 py-0.5 text-[10px] font-extrabold tracking-wider text-white uppercase select-none dark:bg-accent-500 dark:text-accent-900",
          className,
        ),
      ),
    ],
    ["Beta"],
  )

export const brandLockup = (): Html =>
  h.a(
    [h.Href("/"), h.Class("flex items-center gap-2")],
    [
      mark("size-6 md:size-7"),
      h.span([h.Class("text-lg font-medium tracking-tight text-gray-900 dark:text-white")], ["Batonfx"]),
      betaBadge(),
    ],
  )
