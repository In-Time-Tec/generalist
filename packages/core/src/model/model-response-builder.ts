import { Response, Tool } from "effect/unstable/ai"

/** @experimental A provider response reduced to semantic content and reported terminal facts. */
export interface CompletedModelResponse<Tools extends Record<string, Tool.Any>> {
  readonly content: ReadonlyArray<Response.Part<Tools>>
  readonly usage?: Response.Usage
  readonly finishReason?: Response.FinishReason
}

/** @experimental Incrementally normalizes validated provider stream parts. */
export interface Builder<Tools extends Record<string, Tool.Any>> {
  readonly accept: (part: Response.StreamPart<Tools>) => void
  readonly snapshot: () => CompletedModelResponse<Tools>
  readonly complete: () => CompletedModelResponse<Tools>
}

class TextBuffer {
  private storage = new Uint16Array(0)
  private length = 0

  get size(): number {
    return this.length
  }

  append(value: string): void {
    if (value.length === 0) return
    const required = this.length + value.length
    if (required > this.storage.length) {
      let capacity = Math.max(16, this.storage.length)
      while (capacity < required) capacity *= 2
      const next = new Uint16Array(capacity)
      next.set(this.storage.subarray(0, this.length))
      this.storage = next
    }
    for (let index = 0; index < value.length; index += 1) {
      this.storage[this.length + index] = value.charCodeAt(index)
    }
    this.length = required
  }

  toString(): string {
    const chunks = new Array<string>()
    for (let offset = 0; offset < this.length; offset += 16_384) {
      chunks.push(String.fromCharCode(...this.storage.subarray(offset, Math.min(offset + 16_384, this.length))))
    }
    return chunks.join("")
  }
}

type StreamKind = "text" | "reasoning"

type MutableMetadata = { -readonly [Key in keyof Response.ProviderMetadata]: Response.ProviderMetadata[Key] }

interface StreamEntry {
  readonly kind: StreamKind
  readonly buffer: TextBuffer
  readonly metadata: MutableMetadata
}

interface PartEntry<Tools extends Record<string, Tool.Any>> {
  readonly kind: "part"
  readonly part: Response.Part<Tools>
}

type Entry<Tools extends Record<string, Tool.Any>> = StreamEntry | PartEntry<Tools>

const hasMetadata = (metadata: Response.ProviderMetadata): boolean => Object.keys(metadata).length > 0

type MetadataValue = Response.ProviderMetadata[string]

const isMetadataRecord = (value: unknown): value is { readonly [key: string]: MetadataValue } =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const mergeMetadataValue = (current: MetadataValue | undefined, next: MetadataValue): MetadataValue => {
  if (!isMetadataRecord(current) || !isMetadataRecord(next)) return next
  const merged: { [key: string]: MetadataValue } = { ...current }
  for (const key of Object.keys(next)) merged[key] = mergeMetadataValue(merged[key], next[key]!)
  return merged
}

const mergeMetadata = (target: MutableMetadata, source: Response.ProviderMetadata): void => {
  for (const key of Object.keys(source)) target[key] = mergeMetadataValue(target[key], source[key]!)
}

const streamKey = (kind: StreamKind, id: string): string => `${kind}:${id}`

/** @experimental Makes a bounded retained-state builder for one model attempt. */
export const make = <Tools extends Record<string, Tool.Any>>(): Builder<Tools> => {
  const entries = new Array<Entry<Tools>>()
  const streams = new Map<string, StreamEntry>()
  let completed: CompletedModelResponse<Tools> | undefined
  let usage: Response.Usage | undefined
  let finishReason: Response.FinishReason | undefined

  const ensureStream = (kind: StreamKind, id: string): StreamEntry => {
    const key = streamKey(kind, id)
    const existing = streams.get(key)
    if (existing !== undefined) return existing
    const entry: StreamEntry = { kind, buffer: new TextBuffer(), metadata: {} }
    streams.set(key, entry)
    entries.push(entry)
    return entry
  }

  const acceptStreamPart = (
    kind: StreamKind,
    id: string,
    metadata: Response.ProviderMetadata,
    delta?: string,
  ): void => {
    if ((delta === undefined || delta === "") && !hasMetadata(metadata)) return
    const entry = ensureStream(kind, id)
    if (delta !== undefined) entry.buffer.append(delta)
    mergeMetadata(entry.metadata, metadata)
  }

  const accept = (part: Response.StreamPart<Tools>): void => {
    if (completed !== undefined) throw new Error("Cannot accept a model response part after completion")
    switch (part.type) {
      case "text-start":
        acceptStreamPart("text", part.id, part.metadata)
        return
      case "text-delta":
        acceptStreamPart("text", part.id, part.metadata, part.delta)
        return
      case "text-end":
        acceptStreamPart("text", part.id, part.metadata)
        return
      case "reasoning-start":
        acceptStreamPart("reasoning", part.id, part.metadata)
        return
      case "reasoning-delta":
        acceptStreamPart("reasoning", part.id, part.metadata, part.delta)
        return
      case "reasoning-end":
        acceptStreamPart("reasoning", part.id, part.metadata)
        return
      case "tool-params-start":
      case "tool-params-delta":
      case "tool-params-end":
      case "error":
        return
      case "finish":
        usage = part.usage
        finishReason = part.reason
        entries.push({ kind: "part", part: { ...part, response: undefined } })
        return
      case "tool-call":
      case "tool-result":
      case "tool-approval-request":
      case "file":
      case "source":
        entries.push({ kind: "part", part })
        return
      case "response-metadata":
        entries.push({ kind: "part", part: { ...part, request: undefined } })
        return
    }
  }

  const materialize = (): CompletedModelResponse<Tools> => {
    const content = new Array<Response.Part<Tools>>()
    for (const entry of entries) {
      if (entry.kind === "part") {
        content.push(entry.part)
      } else if (entry.buffer.size > 0 || hasMetadata(entry.metadata)) {
        const metadata = { ...entry.metadata }
        content.push(
          entry.kind === "text"
            ? Response.makePart("text", { text: entry.buffer.toString(), metadata })
            : Response.makePart("reasoning", { text: entry.buffer.toString(), metadata }),
        )
      }
    }
    return Object.freeze({
      content: Object.freeze(content),
      ...(usage === undefined ? {} : { usage }),
      ...(finishReason === undefined ? {} : { finishReason }),
    })
  }

  const snapshot = (): CompletedModelResponse<Tools> => completed ?? materialize()

  const complete = (): CompletedModelResponse<Tools> => {
    if (completed === undefined) completed = materialize()
    return completed
  }

  return { accept, snapshot, complete }
}

/** @experimental Concatenates the normalized visible text of a completed response. */
export const text = <Tools extends Record<string, Tool.Any>>(response: CompletedModelResponse<Tools>): string => {
  const parts = new Array<string>()
  for (const part of response.content) {
    if (part.type === "text") parts.push(part.text)
  }
  return parts.join("")
}
