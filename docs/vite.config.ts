import { NodeCrypto, NodeFileSystem, NodePath } from "@effect/platform-node-shared"
import { Crypto, Effect, FileSystem, Layer, Path } from "effect"
import type { PlatformError } from "effect/PlatformError"
import { foldkit } from "@foldkit/vite-plugin"
import stylex from "@stylexjs/unplugin/vite"
import { defineConfig, loadEnv, type Plugin } from "vite"

const platform = Layer.mergeAll(NodeCrypto.layer, NodeFileSystem.layer, NodePath.layer)
const hex = (bytes: Uint8Array): string => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")

const sourceBuildId = Effect.gen(function* () {
  const files = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const crypto = yield* Crypto.Crypto
  const root = path.resolve(import.meta.dirname, "..")
  const records: Array<string> = []
  const collect = (location: string): Effect.Effect<void, PlatformError> =>
    Effect.gen(function* () {
      const stat = yield* files.stat(location)
      if (stat.type === "Directory") {
        const entries = (yield* files.readDirectory(location)).toSorted()
        yield* Effect.forEach(entries, (entry) => collect(path.join(location, entry)), { discard: true })
        return
      }
      const digest = yield* crypto.digest("SHA-256", yield* files.readFile(location))
      records.push(`${path.relative(root, location)}\0${hex(digest)}`)
    })
  yield* Effect.forEach(
    [
      "package.json",
      "tsconfig.json",
      "packages/generalist/package.json",
      "bun.lock",
      "docs/package.json",
      "docs/tsconfig.json",
      "docs/index.html",
      "docs/vite.config.ts",
      "docs/src",
      "docs/server",
      "docs/public",
      "examples/docs-snippets/website",
      "examples/coding-agent-rivet/package.json",
      "examples/coding-agent-rivet/tsconfig.json",
      "examples/coding-agent-rivet/src",
      "examples/coding-agent-rivet/test",
      "examples/coding-agent-rivet/compose.yaml",
      "examples/coding-agent-rivet/.env.example",
    ],
    (location) => collect(path.join(root, location)),
    { discard: true },
  )
  return `source-${hex(yield* crypto.digest("SHA-256", new TextEncoder().encode(records.join("\0"))))}`
})

const stylexStylesheet = (buildId: string): Plugin => ({
  name: "generalist-stylex-stylesheet",
  apply: "build",
  transformIndexHtml: {
    order: "post",
    handler: () => [
      {
        tag: "link",
        attrs: { rel: "stylesheet", href: `/assets/stylex.css?build=${encodeURIComponent(buildId)}` },
        injectTo: "head",
      },
    ],
  },
})

export default defineConfig(({ mode }) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const buildId = loadEnv(mode, import.meta.dirname, "FOLDKIT_").FOLDKIT_BUILD_ID || (yield* sourceBuildId)
      return {
        plugins: [
          stylex({ useCSSLayers: true }),
          foldkit({ buildId, ssr: { serverEntry: "/src/entry.server.ts", origin: "http://localhost:4321" } }),
          stylexStylesheet(buildId),
        ],
        resolve: { dedupe: ["foldkit"] },
        server: { host: "localhost", port: 4321, strictPort: true },
        ssr: { noExternal: ["foldkit"] },
      }
    }).pipe(Effect.provide(platform)),
  ),
)
