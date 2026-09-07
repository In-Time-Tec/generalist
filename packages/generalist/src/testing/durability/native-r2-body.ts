import { Schema } from "effect"

const byteChunk = Schema.instanceOf(Uint8Array)

// oxlint-disable-next-line effecttsgo/async-function -- native Worker request bodies expose Promise-only streaming reads and cancellation.
export const readBoundedBody = async (input: {
  readonly request: Request
  readonly limit: number
  readonly invalidBody: Error
}): Promise<Uint8Array> => {
  if (input.request.body === null) return new Uint8Array()
  const reader = input.request.body.getReader()
  const chunks: Array<Uint8Array> = []
  let length = 0
  try {
    while (true) {
      // oxlint-disable-next-line no-await-in-loop -- ordered reads enforce the aggregate byte limit before requesting the next chunk.
      const next = await reader.read()
      if (next.done) break
      if (!Schema.is(byteChunk)(next.value) || next.value.byteLength > input.limit - length) {
        throw input.invalidBody
      }
      if (next.value.byteLength > 0) chunks.push(next.value)
      length += next.value.byteLength
    }
    const bytes = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return bytes
  } catch (error) {
    await reader.cancel(error).catch(() => {})
    throw error
  } finally {
    reader.releaseLock()
  }
}
