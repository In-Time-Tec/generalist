import { Effect } from "effect"
import { ToolContext } from "@batonfx/core"

export const crawlDocsHandler = Effect.fn("Docs.crawlDocs")(function* (params: { readonly startUrl: string }) {
  const context = yield* ToolContext.ToolContext

  yield* context.emit({ toolCallId: "crawl-1", message: `Fetching ${params.startUrl}` })

  const response = yield* Effect.tryPromise({
    try: () => fetch(params.startUrl, { signal: context.signal }),
    catch: (error) => new Error(String(error)),
  })

  yield* context.emit({ toolCallId: "crawl-1", data: { status: response.status } })

  return { pages: 1 }
})
