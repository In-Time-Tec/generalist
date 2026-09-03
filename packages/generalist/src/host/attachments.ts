import { Effect, Option } from "effect"
import {
  type Blob,
  BlobStore,
  BlobStoreError,
  type Put,
  type BlobNotFound,
  type BlobTooLarge,
} from "../blob-store/index.js"
import type { Ref } from "../media/ref.js"

/** Content-addressed attachment operations exposed by a Host. @experimental */
export interface Attachments {
  readonly put: (input: Put) => Effect.Effect<Ref, BlobTooLarge | BlobStoreError>
  readonly get: (sha256: string) => Effect.Effect<Blob, BlobNotFound | BlobStoreError>
}

const unavailable = () => BlobStoreError.make({ operation: "host attachment", reason: "BlobStore is not provided" })

export const make = (store: Option.Option<BlobStore["Service"]>): Attachments => ({
  put: (input) =>
    Option.match(store, { onNone: () => Effect.fail(unavailable()), onSome: (value) => value.put(input) }),
  get: (sha256) =>
    Option.match(store, { onNone: () => Effect.fail(unavailable()), onSome: (value) => value.get(sha256) }),
})
