import { inertHtml, type HtmlBuilder } from "foldkit/html"
import type { Message as AppMessage } from "../main"

let current: HtmlBuilder<AppMessage> | undefined

export function html<Message>(): HtmlBuilder<Message>
export function html(): HtmlBuilder<AppMessage> | HtmlBuilder<never> {
  return current ?? inertHtml
}

export const htmlScope = {
  with: <A>(builder: HtmlBuilder<AppMessage>, render: () => A): A => {
    const previous = current
    current = builder
    try {
      return render()
    } finally {
      current = previous
    }
  },
} as const
