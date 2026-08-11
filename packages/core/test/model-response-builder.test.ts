import { describe, expect, it } from "@effect/vitest"
import { Schema } from "effect"
import { Response, Tool } from "effect/unstable/ai"
import { make, text } from "../src/model/model-response-builder.js"

type Tools = Record<string, Tool.Any>
type StreamPart = Response.StreamPart<Tools>

const normalize = (parts: ReadonlyArray<StreamPart>) => {
  const builder = make<Tools>()
  for (const part of parts) builder.accept(part)
  return builder.complete()
}

const usage = Response.Usage.make({
  inputTokens: { uncached: 4, total: 7, cacheRead: 3, cacheWrite: undefined },
  outputTokens: { total: 5, text: 4, reasoning: 1 },
})

const responseMetadata = Response.makePart("response-metadata", {
  id: "response-1",
  modelId: "model-1",
  timestamp: undefined,
  request: undefined,
  metadata: { provider: { region: "test" } },
})
const file = Response.makePart("file", {
  mediaType: "text/plain",
  data: new Uint8Array([1, 2, 3]),
  metadata: { provider: { file: true } },
})
const documentSource = Schema.decodeUnknownSync(Response.DocumentSourcePart)({
  type: "source",
  sourceType: "document",
  id: "document-1",
  mediaType: "text/plain",
  title: "Document",
  fileName: "document.txt",
  metadata: { provider: { rank: 1 } },
})
const urlSource = Schema.decodeUnknownSync(Response.UrlSourcePart)({
  type: "source",
  sourceType: "url",
  id: "url-1",
  url: "https://example.com/source",
  title: "URL",
  metadata: { provider: { rank: 2 } },
})
const firstCall = Response.makePart("tool-call", {
  id: "call-1",
  name: "lookup",
  params: { query: "baton" },
  providerExecuted: false,
  metadata: { provider: { call: 1 } },
})
const secondCall = Response.makePart("tool-call", {
  id: "call-2",
  name: "providerLookup",
  params: { query: "effect" },
  providerExecuted: true,
  metadata: { provider: { call: 2 } },
})
const result = Response.toolResultPart({
  id: "call-2",
  name: "providerLookup",
  isFailure: false,
  result: { found: true },
  encodedResult: { found: true },
  providerExecuted: true,
  preliminary: false,
  metadata: { provider: { result: true } },
})
const finish = Response.makePart("finish", {
  reason: "tool-calls",
  usage,
  response: undefined,
  metadata: { provider: { stopSequence: "done" } },
})

const surroundingParts: ReadonlyArray<StreamPart> = [
  responseMetadata,
  Response.makePart("reasoning-start", { id: "reasoning", metadata: { provider: { phase: "analysis" } } }),
  Response.makePart("reasoning-delta", { id: "reasoning", delta: "think" }),
  Response.makePart("reasoning-end", { id: "reasoning", metadata: { provider: { signed: true } } }),
]
const trailingParts: ReadonlyArray<StreamPart> = [
  file,
  documentSource,
  urlSource,
  firstCall,
  secondCall,
  result,
  finish,
]

describe("model response builder", () => {
  it("normalizes one delta and 10,000 provider fragments to identical semantic output", () => {
    const expectedText = "x".repeat(5_000)
    const oneDelta = normalize([
      ...surroundingParts,
      Response.makePart("text-start", { id: "answer" }),
      Response.makePart("text-delta", { id: "answer", delta: expectedText }),
      Response.makePart("text-end", { id: "answer" }),
      ...trailingParts,
    ])
    const fragmented = normalize([
      ...surroundingParts,
      Response.makePart("text-start", { id: "answer" }),
      ...Array.from({ length: 10_000 }, (_, index) =>
        Response.makePart("text-delta", { id: "answer", delta: index % 2 === 0 ? "x" : "" }),
      ),
      Response.makePart("text-end", { id: "answer" }),
      ...trailingParts,
    ])

    expect(fragmented).toEqual(oneDelta)
    expect(text(fragmented)).toBe(expectedText)
    expect(fragmented.content.map((part) => part.type)).toEqual([
      "response-metadata",
      "reasoning",
      "text",
      "file",
      "source",
      "source",
      "tool-call",
      "tool-call",
      "tool-result",
      "finish",
    ])
    expect(fragmented.content).toHaveLength(10)
    expect(fragmented.usage).toBe(usage)
    expect(fragmented.finishReason).toBe("tool-calls")
    expect(fragmented.content[1]).toMatchObject({
      type: "reasoning",
      text: "think",
      metadata: { provider: { phase: "analysis", signed: true } },
    })
    expect(fragmented.content.slice(3)).toEqual([
      file,
      documentSource,
      urlSource,
      firstCall,
      secondCall,
      result,
      finish,
    ])
  })

  it("drops thousands of tiny tool parameter fragments once the validated call owns its parameters", () => {
    const json = JSON.stringify({ value: "x".repeat(10_000) })
    const call = Response.makePart("tool-call", {
      id: "call",
      name: "write",
      params: { value: "x".repeat(10_000) },
      providerExecuted: false,
      metadata: { provider: { validated: true } },
    })
    const completed = normalize([
      Response.makePart("tool-params-start", { id: "call", name: "write", providerExecuted: false }),
      ...Array.from(json, (delta) => Response.makePart("tool-params-delta", { id: "call", delta })),
      Response.makePart("tool-params-end", { id: "call" }),
      call,
    ])

    expect(completed.content).toEqual([call])
    expect(completed.content).toHaveLength(1)
    expect(completed.content[0]).toMatchObject({
      type: "tool-call",
      params: { value: "x".repeat(10_000) },
      metadata: { provider: { validated: true } },
    })
  })

  it("omits empty transport streams and absent terminal facts without losing metadata-only reasoning", () => {
    const completed = normalize([
      Response.makePart("text-start", { id: "empty-text" }),
      Response.makePart("text-delta", { id: "empty-text", delta: "" }),
      Response.makePart("text-end", { id: "empty-text" }),
      Response.makePart("reasoning-delta", {
        id: "signature",
        delta: "",
        metadata: { provider: { signature: "signed" } },
      }),
      Response.makePart("tool-params-delta", { id: "empty-tool", delta: "" }),
    ])

    expect(completed.content).toEqual([
      Response.makePart("reasoning", { text: "", metadata: { provider: { signature: "signed" } } }),
    ])
    expect(Object.hasOwn(completed, "usage")).toBe(false)
    expect(Object.hasOwn(completed, "finishReason")).toBe(false)
    expect(completed.content.every((part) => part.type !== "finish")).toBe(true)
  })

  it("coalesces non-adjacent fragments by stream kind and id at first semantic position", () => {
    const metadata = Response.makePart("response-metadata", {
      id: "between",
      modelId: undefined,
      timestamp: undefined,
      request: undefined,
    })
    const completed = normalize([
      Response.makePart("text-delta", { id: "same", delta: "a" }),
      Response.makePart("reasoning-delta", { id: "same", delta: "r" }),
      metadata,
      Response.makePart("text-delta", { id: "same", delta: "b" }),
      Response.makePart("reasoning-delta", { id: "same", delta: "s" }),
    ])

    expect(completed.content).toEqual([
      Response.makePart("text", { text: "ab" }),
      Response.makePart("reasoning", { text: "rs" }),
      metadata,
    ])
  })
})
