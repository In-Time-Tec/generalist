import { Effect } from "effect"
import { HttpClient } from "effect/unstable/http"
import { ToolContext } from "@batonfx/core"

export const crawlDocsHandler = Effect.fn("Docs.crawlDocs")(function* (params: { readonly startUrl: string }) {
  const context = yield* ToolContext.ToolContext
  const httpClient = yield* HttpClient.HttpClient

  yield* context.emit({ toolCallId: "crawl-1", message: `Fetching ${params.startUrl}` })

  const response = yield* httpClient.get(params.startUrl)

  yield* context.emit({ toolCallId: "crawl-1", data: { status: response.status } })

  return { pages: 1 }
})
