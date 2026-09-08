import { Effect } from "effect"
import type { Bucket } from "../../../../src/durability/r2.js"
import type { Client } from "../../../../src/testing/durability/index.js"

export const nativeBucket = (client: Client): Bucket => ({
  get: (key, options) =>
    Effect.runPromise(
      client.store.read(key, { maxBytes: 64 * 1024 * 1024 }).pipe(
        Effect.map((object) => {
          if (object === undefined) return null
          const requested = options?.range
          const bytes =
            requested === undefined
              ? object.bytes
              : object.bytes.subarray(requested.offset, requested.offset + requested.length)
          const result = {
            key,
            size: object.bytes.byteLength,
            etag: object.etag,
            body: new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(bytes)
                controller.close()
              },
            }),
          }
          return requested === undefined
            ? result
            : { ...result, range: { offset: requested.offset, length: bytes.byteLength } }
        }),
      ),
    ),
  put: (key, bytes) =>
    Effect.runPromise(
      client.store
        .create(key, bytes)
        .pipe(
          Effect.flatMap((result) =>
            result === "conflict"
              ? Effect.succeed(null)
              : client.store
                  .read(key, { maxBytes: 64 * 1024 * 1024 })
                  .pipe(Effect.map((object) => ({ key, size: bytes.byteLength, etag: object!.etag }))),
          ),
        ),
    ),
  list: ({ prefix, cursor }) =>
    Effect.runPromise(
      client.store.list(prefix, cursor).pipe(
        Effect.map((page) => {
          const result = { objects: page.keys.map((key) => ({ key })), truncated: page.cursor !== undefined }
          return page.cursor === undefined ? result : { ...result, cursor: page.cursor }
        }),
      ),
    ),
})
