import { Option } from "effect"
import type { Html } from "foldkit/html"
import { html } from "foldkit/html"

import {
  codeBlock,
  codeBlockContent,
  codeBlockCopyButton,
  codeBlockHeader,
  codeBlockTitle,
} from "@/components/ui/code-block"

import { ClickedCopyCode, type Message } from "../app/message"
import type { CalloutTone, Inline, Node } from "./node"

const h = html<Message>()

export type RenderContext = Readonly<{
  copiedSource: Option.Option<string>
}>

const renderInline = (inline: Inline): Html | string => {
  switch (inline.kind) {
    case "text":
      return inline.text
    case "inlineCode":
      return h.code([h.Class("rounded bg-muted px-1.5 py-0.5 font-mono text-sm text-foreground")], [inline.text])
    case "link":
      return h.a([h.Href(inline.href), h.Class("font-medium text-primary underline underline-offset-4")], [inline.text])
    case "strong":
      return h.strong([h.Class("font-semibold text-foreground")], [inline.text])
  }
}

const renderInlines = (content: ReadonlyArray<Inline>): ReadonlyArray<Html | string> => content.map(renderInline)

const calloutToneClass: Record<CalloutTone, string> = {
  info: "border-primary/40 bg-primary/5",
  warning: "border-amber-500/50 bg-amber-500/10",
  inRepo: "border-dashed border-muted-foreground/40 bg-muted/40",
}

const renderCode = (node: Extract<Node, { kind: "code" }>, context: RenderContext): Html =>
  h.div(
    [h.Class("mt-5 grid gap-2")],
    [
      codeBlock({ language: node.language, class: "rounded-md" }, [
        codeBlockHeader({}, [
          codeBlockTitle({}, [node.label]),
          codeBlockCopyButton({
            isCopied: Option.contains(context.copiedSource, node.source),
            onCopied: ClickedCopyCode({ source: node.source }),
          }),
        ]),
        codeBlockContent({ code: node.source, language: node.language }),
      ]),
      ...(node.expectedOutput === undefined
        ? []
        : [
            codeBlock({ language: "text", class: "rounded-md border-primary/30" }, [
              codeBlockHeader({ class: "bg-primary/5" }, [codeBlockTitle({}, ["Output"])]),
              codeBlockContent({ code: node.expectedOutput, language: "text" }),
            ]),
          ]),
    ],
  )

const renderNode = (node: Node, context: RenderContext): Html => {
  switch (node.kind) {
    case "heading":
      return node.level === 2
        ? h.h2(
            [h.Id(node.id), h.Class("mt-12 scroll-mt-20 border-b pb-2 text-2xl font-semibold tracking-tight")],
            [node.text],
          )
        : h.h3([h.Id(node.id), h.Class("mt-8 scroll-mt-20 text-xl font-semibold tracking-tight")], [node.text])
    case "lead":
      return h.p([h.Class("mt-4 max-w-3xl text-lg text-muted-foreground")], [node.text])
    case "para":
      return h.p([h.Class("mt-4 leading-7 text-muted-foreground")], renderInlines(node.content))
    case "bullets":
      return h.ul(
        [h.Class("mt-4 ml-6 list-disc space-y-2 text-muted-foreground marker:text-muted-foreground/60")],
        node.items.map((item) => h.li([h.Class("leading-7")], renderInlines(item))),
      )
    case "code":
      return renderCode(node, context)
    case "callout":
      return h.div(
        [h.Class(`mt-5 rounded-md border-l-4 px-4 py-3 ${calloutToneClass[node.tone]}`)],
        [
          h.p([h.Class("text-sm font-semibold text-foreground")], [node.label]),
          h.p([h.Class("mt-1 text-sm leading-6 text-muted-foreground")], renderInlines(node.content)),
        ],
      )
    case "table":
      return h.div(
        [h.Class("mt-5 overflow-x-auto rounded-md border")],
        [
          h.table(
            [h.Class("w-full text-sm")],
            [
              h.thead(
                [h.Class("border-b bg-muted/50")],
                [
                  h.tr(
                    [],
                    node.head.map((cell) =>
                      h.th([h.Class("px-3 py-2 text-left font-semibold whitespace-nowrap")], [cell]),
                    ),
                  ),
                ],
              ),
              h.tbody(
                [],
                node.rows.map((row) =>
                  h.tr(
                    [h.Class("border-b last:border-b-0")],
                    row.map((cell) =>
                      h.td([h.Class("px-3 py-2 align-top text-muted-foreground")], renderInlines(cell)),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ],
      )
    case "pills":
      return h.div(
        [h.Class("mt-4 flex flex-wrap gap-2")],
        node.items.map((item) =>
          h.code([h.Class("rounded-md border bg-muted/40 px-2 py-1 font-mono text-xs text-foreground")], [item]),
        ),
      )
    case "custom":
      return node.html
  }
}

export const render = (title: string, description: string, nodes: ReadonlyArray<Node>, context: RenderContext): Html =>
  h.div(
    [],
    [
      h.h1([h.Id("overview"), h.Class("scroll-mt-20 text-3xl font-semibold tracking-tight md:text-4xl")], [title]),
      h.p([h.Class("mt-4 max-w-3xl text-lg text-muted-foreground")], [description]),
      ...nodes.map((node) => renderNode(node, context)),
    ],
  )
