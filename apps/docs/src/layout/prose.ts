import type { Html } from "foldkit/html"
import { html } from "foldkit/html"

import { codeBlock, codeBlockContent, codeBlockHeader, codeBlockTitle } from "@/components/ui/code-block"

import type { Message } from "../app/message"

const h = html<Message>()

export const section = (children: ReadonlyArray<Html>): Html => h.div([], children)

export const h1 = (id: string, text: string): Html =>
  h.h1([h.Id(id), h.Class("scroll-mt-20 text-3xl font-semibold tracking-tight md:text-4xl")], [text])

export const lead = (text: string): Html => h.p([h.Class("mt-4 max-w-3xl text-lg text-muted-foreground")], [text])

export const h2 = (id: string, text: string): Html =>
  h.h2([h.Id(id), h.Class("mt-12 scroll-mt-20 border-b pb-2 text-2xl font-semibold tracking-tight")], [text])

export const p = (...content: ReadonlyArray<string | Html>): Html =>
  h.p([h.Class("mt-4 leading-7 text-muted-foreground")], content)

export const code = (text: string): Html =>
  h.code([h.Class("rounded bg-muted px-1.5 py-0.5 font-mono text-sm text-foreground")], [text])

export const link = (href: string, text: string): Html =>
  h.a([h.Href(href), h.Class("font-medium text-primary underline underline-offset-4")], [text])

export const ul = (items: ReadonlyArray<string | Html>): Html =>
  h.ul(
    [h.Class("mt-4 ml-6 list-disc space-y-2 text-muted-foreground marker:text-muted-foreground/60")],
    items.map((item) => h.li([h.Class("leading-7")], [item])),
  )

export const pillList = (items: ReadonlyArray<string>): Html =>
  h.div(
    [h.Class("mt-4 flex flex-wrap gap-2")],
    items.map((item) =>
      h.code([h.Class("rounded-md border bg-muted/40 px-2 py-1 font-mono text-xs text-foreground")], [item]),
    ),
  )

export const commandBlock = (label: string, language: string, codeText: string): Html =>
  h.div(
    [h.Class("mt-5")],
    [
      codeBlock({ language, class: "rounded-md" }, [
        codeBlockHeader({}, [codeBlockTitle({}, [label])]),
        codeBlockContent({ code: codeText, language }),
      ]),
    ],
  )
