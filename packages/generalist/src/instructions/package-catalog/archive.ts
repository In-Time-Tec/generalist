import { Effect, FileSystem, Path, PlatformError } from "effect"
import { PackageCatalogError } from "./errors.js"

const catalogError = (source: string, message: string, cause?: unknown): PackageCatalogError =>
  cause === undefined
    ? PackageCatalogError.make({ source, message })
    : PackageCatalogError.make({ source, message, cause })

const platformError = (source: string, error: PlatformError.PlatformError): PackageCatalogError =>
  catalogError(source, error.message, error)

const readString = (bytes: Uint8Array, offset: number, length: number): string => {
  const end = bytes.indexOf(0, offset)
  return new TextDecoder().decode(bytes.subarray(offset, end === -1 || end > offset + length ? offset + length : end))
}

const parsePaxPath = (bytes: Uint8Array): string | undefined => {
  const text = new TextDecoder().decode(bytes)
  for (const record of text.split("\n")) {
    const separator = record.indexOf(" path=")
    if (separator !== -1) return record.slice(separator + 6)
  }
  return undefined
}

interface ArchiveFile {
  readonly path: string
  readonly bytes: Uint8Array
}

const extractTar = (
  source: string,
  bytes: Uint8Array,
): Effect.Effect<ReadonlyArray<ArchiveFile>, PackageCatalogError> =>
  Effect.try({
    try: () => {
      const files: Array<ArchiveFile> = []
      let offset = 0
      let paxPath: string | undefined
      while (offset + 512 <= bytes.length) {
        const name = readString(bytes, offset, 100)
        if (name.length === 0) break
        const prefix = readString(bytes, offset + 345, 155)
        const path = prefix.length === 0 ? name : `${prefix}/${name}`
        const size = Number.parseInt(readString(bytes, offset + 124, 12).trim() || "0", 8)
        if (!Number.isSafeInteger(size) || size < 0 || offset + 512 + size > bytes.length)
          throw new Error("Invalid tar entry")
        const type = String.fromCharCode(bytes[offset + 156] ?? 0)
        const content = bytes.slice(offset + 512, offset + 512 + size)
        if (type === "x") paxPath = parsePaxPath(content)
        else if (type === "0" || type === "\0") {
          files.push({ path: paxPath ?? path, bytes: content })
          paxPath = undefined
        }
        offset += 512 + Math.ceil(size / 512) * 512
      }
      return files
    },
    catch: (cause) => catalogError(source, "Invalid package tar archive", cause),
  })

const decompress = (source: string, bytes: Uint8Array): Effect.Effect<Uint8Array, PackageCatalogError> => {
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return Effect.succeed(bytes)
  const stream = new Blob([bytes.slice().buffer]).stream().pipeThrough(new DecompressionStream("gzip"))
  return Effect.tryPromise({
    try: () => new Response(stream).arrayBuffer(),
    catch: (cause) => catalogError(source, "Unable to decompress package archive", cause),
  }).pipe(Effect.map((buffer) => new Uint8Array(buffer)))
}

const safeArchivePath = (
  path: Path.Path,
  source: string,
  archivePath: string,
): Effect.Effect<string, PackageCatalogError> => {
  const segments = archivePath.replace(/\\/g, "/").split("/").slice(1)
  return segments.length > 0 && segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
    ? Effect.succeed(path.join(...segments))
    : Effect.fail(catalogError(source, "Unsafe package archive path"))
}

export const extractArchive = Effect.fn("PackageCatalog.extractArchive")(function* (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  source: string,
  destination: string,
  archive: Uint8Array,
) {
  const tar = yield* decompress(source, archive)
  const files = yield* extractTar(source, tar)
  for (const file of files) {
    const relative = yield* safeArchivePath(path, source, file.path)
    const target = path.join(destination, relative)
    yield* fs.makeDirectory(path.dirname(target), { recursive: true }).pipe(
      Effect.flatMap(() => fs.writeFile(target, file.bytes)),
      Effect.mapError((error) => platformError(source, error)),
    )
  }
})
