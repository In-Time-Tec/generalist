import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { build } from "esbuild"

const entries = [
  ["workers", "packages/cloudflare/src/workers/index.ts"],
  ["durable-objects", "packages/cloudflare/src/durable-objects/index.ts"],
  ["dynamic-workers", "packages/cloudflare/src/dynamic-workers/index.ts"],
  ["core", "packages/tenetkit/src/index.ts"],
  ["foldkit", "packages/tenetkit/src/foldkit/index.ts"],
  ["transport client", "packages/tenetkit/src/transport/client.ts"],
  ["injected SQL store", "packages/tenetkit/src/runtime/sql/store.ts"],
] as const
const forbidden = [
  "bun:sqlite",
  "@effect/sql-sqlite-bun",
  "@effect/platform-bun",
  "@aws-sdk/credential-provider-node",
] as const

describe("workerd export graphs", () => {
  for (const [name, entry] of entries) {
    it.effect(`bundles ${name} without Node compatibility`, () =>
      Effect.gen(function* () {
        const result = yield* Effect.promise(() =>
          build({
            entryPoints: [entry],
            bundle: true,
            format: "esm",
            platform: "browser",
            target: "es2022",
            write: false,
            metafile: true,
          }),
        )
        const graph = Object.keys(result.metafile.inputs).join("\n")
        for (const specifier of forbidden) expect(graph).not.toContain(specifier)
        expect(graph).not.toMatch(/(^|\n)node:/)
      }),
    )
  }
})
