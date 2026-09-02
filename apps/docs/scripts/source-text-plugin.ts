import { fileURLToPath } from "node:url"
import { layer as bunServicesLayer } from "@effect/platform-bun/BunServices"
import { Effect, FileSystem, ManagedRuntime, Schema } from "effect"
import type { Plugin } from "vite"

const prefix = "virtual:source/"
const resolvedPrefix = "\0source-text:"
const resolvedSuffix = ".js"

const readSource = Effect.fn("Docs.sourceTextPlugin.readSource")(function* (path: string) {
  const fileSystem = yield* FileSystem.FileSystem
  const source = yield* fileSystem.readFileString(path)
  const encoded = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(source)
  return `export default ${encoded}`
})
const runtime = ManagedRuntime.make(bunServicesLayer)

export const sourceTextPlugin = {
  name: "source-text",
  enforce: "pre",
  resolveId(id) {
    return id.startsWith(prefix)
      ? `${resolvedPrefix}${encodeURIComponent(fileURLToPath(new URL(`../${id.slice(prefix.length)}`, import.meta.url)))}${resolvedSuffix}`
      : null
  },
  load(id) {
    if (!id.startsWith(resolvedPrefix) || !id.endsWith(resolvedSuffix)) return null
    const path = decodeURIComponent(id.slice(resolvedPrefix.length, -resolvedSuffix.length))
    return runtime.runPromise(readSource(path))
  },
  closeBundle() {
    return runtime.dispose()
  },
} satisfies Plugin
