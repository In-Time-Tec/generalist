import { Effect, FileSystem, Path, Schema } from "effect"
import { BlobStore, BlobStoreError, BlobTooLarge } from "../blob-store/index.js"
import { ActionableTaggedError, errorHint } from "../core/error-hint.js"
import { File, Ref } from "./ref.js"
import { part as makePart, resolve as resolveRef } from "./prompt.js"

export { File, Ref }
/** Decoded content-addressed media reference. @experimental */
export type { Ref as RefValue } from "./ref.js"

/** Create a durable Effect AI file part containing only a Media.Ref marker. @experimental */
export const part = makePart

/** Resolve a Media.Ref to provider-ready bytes or a URL from BlobStore. @experimental */
export const resolve = resolveRef

/** A file extension cannot be mapped to a supported media type. @experimental */
export class MediaTypeUnsupported extends ActionableTaggedError<MediaTypeUnsupported>()(
  "generalist/media/MediaTypeUnsupported",
  {
    path: Schema.String,
    hint: errorHint("Pass mediaType explicitly or use a supported image, audio, video, or PDF extension."),
  },
) {}

/** Media bytes could not be read from the requested platform path. @experimental */
export class MediaReadError extends ActionableTaggedError<MediaReadError>()("generalist/media/MediaReadError", {
  path: Schema.String,
  reason: Schema.String,
  hint: errorHint("Check that the path exists and is readable, then retry."),
}) {}

const mediaTypes = new Map<string, string>([
  [".aac", "audio/aac"],
  [".avi", "video/x-msvideo"],
  [".gif", "image/gif"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".m4a", "audio/mp4"],
  [".mov", "video/quicktime"],
  [".mp3", "audio/mpeg"],
  [".mp4", "video/mp4"],
  [".ogg", "audio/ogg"],
  [".pdf", "application/pdf"],
  [".png", "image/png"],
  [".wav", "audio/wav"],
  [".webm", "video/webm"],
  [".webp", "image/webp"],
])

/** Optional media metadata overrides for `Media.fromPath`. @experimental */
export interface FromPathOptions {
  readonly mediaType?: string
  readonly filename?: string
}

/** Reads one platform file into BlobStore and returns its durable content reference. @experimental */
export const fromPath = Effect.fn("Media.fromPath")(function* (pathValue: string, options: FromPathOptions = {}) {
  const fileSystem = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const blobStore = yield* BlobStore
  const mediaType = options.mediaType ?? mediaTypes.get(path.extname(pathValue).toLowerCase())
  if (mediaType === undefined) return yield* MediaTypeUnsupported.make({ path: pathValue })
  const data = yield* fileSystem
    .readFile(pathValue)
    .pipe(Effect.mapError((cause) => MediaReadError.make({ path: pathValue, reason: String(cause) })))
  return yield* blobStore.put({
    data,
    mediaType,
    filename: options.filename ?? path.basename(pathValue),
  })
})

/** Typed failures returned by `Media.fromPath`. @experimental */
export type FromPathError = MediaTypeUnsupported | MediaReadError | BlobStoreError | BlobTooLarge
