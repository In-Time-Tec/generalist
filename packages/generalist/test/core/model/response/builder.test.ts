import { describe, expect, it } from "@effect/vitest"
import { Redacted, Schema } from "effect"
import { Response, Tool } from "effect/unstable/ai"
import { make, text } from "../../../../src/core/model/response/builder.js"

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
const documentSource = Schema.decodeSync(Response.DocumentSourcePart)({
  type: "source",
  sourceType: "document",
  id: "document-1",
  mediaType: "text/plain",
  title: "Document",
  fileName: "document.txt",
  metadata: { provider: { rank: 1 } },
})
const urlSource = Schema.decodeSync(Response.UrlSourcePart)({
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
  params: { query: "generalist" },
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
  it("takes stable partial snapshots without finalizing the builder", () => {
    const builder = make<Tools>()
    const call = Response.makePart("tool-call", {
      id: "call",
      name: "lookup",
      params: { query: "generalist" },
      providerExecuted: false,
      metadata: { provider: { validated: true } },
    })

    builder.accept(
      Response.makePart("text-delta", {
        id: "answer",
        delta: "hel",
        metadata: { provider: { phase: "partial" } },
      }),
    )
    builder.accept(
      Response.makePart("reasoning-delta", {
        id: "reasoning",
        delta: "think",
        metadata: { provider: { phase: "partial" } },
      }),
    )
    builder.accept(Response.makePart("tool-params-start", { id: "call", name: "lookup", providerExecuted: false }))
    builder.accept(Response.makePart("tool-params-delta", { id: "call", delta: '{"query":"bat' }))

    const partial = builder.snapshot()

    expect(partial.content).toEqual([
      Response.makePart("text", { text: "hel", metadata: { provider: { phase: "partial" } } }),
      Response.makePart("reasoning", { text: "think", metadata: { provider: { phase: "partial" } } }),
    ])
    expect(partial.content.every((part) => part.type !== "tool-call")).toBe(true)
    expect(Object.hasOwn(partial, "usage")).toBe(false)
    expect(Object.hasOwn(partial, "finishReason")).toBe(false)

    builder.accept(
      Response.makePart("text-delta", {
        id: "answer",
        delta: "lo",
        metadata: { provider: { final: true } },
      }),
    )
    builder.accept(
      Response.makePart("reasoning-delta", {
        id: "reasoning",
        delta: " again",
        metadata: { provider: { signed: true } },
      }),
    )
    builder.accept(Response.makePart("tool-params-end", { id: "call" }))
    builder.accept(call)
    builder.accept(finish)

    const finalSnapshot = builder.snapshot()

    expect(finalSnapshot.content).toEqual([
      Response.makePart("text", {
        text: "hello",
        metadata: { provider: { phase: "partial", final: true } },
      }),
      Response.makePart("reasoning", {
        text: "think again",
        metadata: { provider: { phase: "partial", signed: true } },
      }),
      call,
      finish,
    ])
    expect(finalSnapshot.usage).toBe(usage)
    expect(finalSnapshot.finishReason).toBe("tool-calls")
    expect(partial.content).toEqual([
      Response.makePart("text", { text: "hel", metadata: { provider: { phase: "partial" } } }),
      Response.makePart("reasoning", { text: "think", metadata: { provider: { phase: "partial" } } }),
    ])

    const completed = builder.complete()
    expect(completed).toEqual(finalSnapshot)
    expect(builder.complete()).toBe(completed)
    expect(builder.snapshot()).toBe(completed)
    expect(Object.isFrozen(completed)).toBe(true)
    expect(Object.isFrozen(completed.content)).toBe(true)
    expect(() => builder.accept(Response.makePart("text-delta", { id: "answer", delta: "!" }))).toThrow(
      "Cannot accept a model response part after completion",
    )
  })

  it("removes provider HTTP envelopes from snapshots and completed responses", () => {
    const builder = make<Tools>()
    builder.accept(
      Response.makePart("response-metadata", {
        id: "safe-id",
        modelId: "safe-model",
        timestamp: undefined,
        request: {
          method: "POST",
          url: "https://provider.invalid/secret-path",
          urlParams: [["secret", "request-canary"]],
          hash: undefined,
          headers: { authorization: Redacted.make("Bearer request-canary"), "x-plain": "plain-canary" },
        },
      }),
    )
    builder.accept(Response.makePart("text-delta", { id: "answer", delta: "safe answer" }))
    builder.accept(
      Response.makePart("finish", {
        reason: "stop",
        usage,
        response: {
          status: 200,
          headers: { "set-cookie": Redacted.make("session=response-canary"), "x-plain": "plain-canary" },
        },
      }),
    )

    const snapshot = builder.snapshot()
    expect(snapshot.content).toEqual([
      Response.makePart("response-metadata", {
        id: "safe-id",
        modelId: "safe-model",
        timestamp: undefined,
        request: undefined,
      }),
      Response.makePart("text", { text: "safe answer" }),
      Response.makePart("finish", { reason: "stop", usage, response: undefined }),
    ])
    expect(snapshot.usage).toBe(usage)
    expect(snapshot.finishReason).toBe("stop")
    expect(builder.complete()).toEqual(snapshot)
    expect(JSON.stringify(snapshot)).not.toContain("canary")
    expect(JSON.stringify(snapshot)).not.toContain("secret-path")
  })

  it("snapshots 10,000 fragments and continues accumulating", () => {
    const builder = make<Tools>()
    for (let index = 0; index < 10_000; index += 1) {
      builder.accept(Response.makePart("text-delta", { id: "answer", delta: "x" }))
    }

    const partial = builder.snapshot()
    expect(text(partial)).toBe("x".repeat(10_000))

    builder.accept(Response.makePart("text-delta", { id: "answer", delta: "tail" }))
    const next = builder.snapshot()

    expect(text(partial)).toBe("x".repeat(10_000))
    expect(text(next)).toBe(`${"x".repeat(10_000)}tail`)
    expect(builder.complete()).toEqual(next)
  })

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
