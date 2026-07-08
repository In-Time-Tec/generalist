import type { Html } from "foldkit/html"
import { html } from "foldkit/html"

import type { Message } from "../app/message"

const h = html<Message>()

const strokeIcon = (className: string, paths: ReadonlyArray<string>, strokeWidth = "1.5"): Html =>
  h.svg(
    [
      h.Xmlns("http://www.w3.org/2000/svg"),
      h.ViewBox("0 0 24 24"),
      h.Fill("none"),
      h.Stroke("currentColor"),
      h.StrokeWidth(strokeWidth),
      h.AriaHidden(true),
      h.Class(className),
    ],
    paths.map((d) => h.path([h.StrokeLinecap("round"), h.StrokeLinejoin("round"), h.D(d)], [])),
  )

export const sun = (className: string): Html =>
  strokeIcon(className, [
    "M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z",
  ])

export const moon = (className: string): Html =>
  strokeIcon(className, [
    "M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z",
  ])

export const computer = (className: string): Html =>
  strokeIcon(className, [
    "M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25",
  ])

export const chevronDown = (className: string): Html => strokeIcon(className, ["M19.5 8.25l-7.5 7.5-7.5-7.5"])

export const check = (className: string): Html => strokeIcon(className, ["M4.5 12.75l6 6 9-13.5"], "2")

export const close = (className: string): Html => strokeIcon(className, ["M6 18L18 6M6 6l12 12"])

export const menu = (className: string): Html => strokeIcon(className, ["M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"])

export const arrowLeft = (className: string): Html => strokeIcon(className, ["M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"])

export const arrowRight = (className: string): Html => strokeIcon(className, ["M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"])

export const search = (className: string): Html =>
  h.svg(
    [
      h.Xmlns("http://www.w3.org/2000/svg"),
      h.ViewBox("0 0 24 24"),
      h.Fill("none"),
      h.Stroke("currentColor"),
      h.StrokeWidth("2"),
      h.AriaHidden(true),
      h.Class(className),
    ],
    [
      h.circle([h.Cx("11"), h.Cy("11"), h.R("8")], []),
      h.path([h.StrokeLinecap("round"), h.StrokeLinejoin("round"), h.D("m21 21-4.3-4.3")], []),
    ],
  )

export const github = (className: string): Html =>
  h.svg(
    [
      h.Xmlns("http://www.w3.org/2000/svg"),
      h.ViewBox("0 0 24 24"),
      h.Fill("currentColor"),
      h.AriaHidden(true),
      h.Class(className),
    ],
    [
      h.path(
        [
          h.D(
            "M12 .5C5.7.5.5 5.7.5 12a11.5 11.5 0 0 0 7.9 10.9c.6.1.8-.2.8-.5v-2c-3.2.7-3.9-1.4-3.9-1.4-.5-1.3-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.7 1.3 3.4 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.6.8.5A11.5 11.5 0 0 0 23.5 12C23.5 5.7 18.3.5 12 .5Z",
          ),
        ],
        [],
      ),
    ],
  )
