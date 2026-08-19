import { readFileSync } from "node:fs"
import { availableParallelism } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const repositoryRoot = dirname(fileURLToPath(import.meta.url))
const tenetkitRoot = join(repositoryRoot, "packages/tenetkit")

/**
 * `@tenetkit/pg` and `@tenetkit/mysql` import the published `tenetkit` entrypoints while the shared
 * test helpers import `packages/tenetkit/src`. Left alone the suite loads two copies of every
 * service and error class, so `instanceof` assertions fail against structurally identical values.
 * The `exports` map is the only place that knows how a specifier maps onto a file, so the alias
 * table is derived from it rather than restated.
 */
const tenetkitSourceAliases = Object.entries(
  (
    JSON.parse(readFileSync(join(tenetkitRoot, "package.json"), "utf8")) as {
      readonly exports: Readonly<Record<string, { readonly import: string }>>
    }
  ).exports,
)
  .map(([specifier, target]) => {
    const source = target.import.replace(/^\.\/dist\//, "src/").replace(/\.js$/, ".ts")
    const pattern = `tenetkit${specifier === "." ? "" : specifier.slice(1)}`
    return specifier.includes("*")
      ? {
          find: new RegExp(`^${pattern.replace("*", "(.*)")}$`),
          replacement: join(tenetkitRoot, source.replace("*", "$1")),
        }
      : { find: new RegExp(`^${pattern}$`), replacement: join(tenetkitRoot, source) }
  })
  .toSorted((left, right) => Number(left.find.source.includes("(")) - Number(right.find.source.includes("(")))

/**
 * Each worker runs real Bun kernel processes, so the useful ceiling is the machine's own
 * parallelism rather than a fixed number: a two-core CI runner and an eleven-core laptop want
 * different answers. Six is where the gain flattened when measured (83s at two workers, 60s at
 * four, 52s at six, 48s at eight), so the extra contention past it buys nothing.
 */
const workers = Math.max(2, Math.min(6, availableParallelism()))

export default defineConfig({
  resolve: {
    /**
     * `@tenetkit/pg` and `@tenetkit/mysql` import the published `tenetkit` entrypoints, while the
     * shared test helpers import `packages/tenetkit/src`. Without this the suite loads two copies
     * of every service and error class, and `instanceof` assertions fail against identical values.
     */
    alias: tenetkitSourceAliases,
  },
  plugins: [
    {
      name: "workspace-at-alias",
      resolveId(source: string, importer: string | undefined) {
        if (!source.startsWith("@/")) return undefined
        const docs = importer?.indexOf("/apps/docs/") ?? -1
        const workspaceRoot = docs >= 0 ? importer!.slice(0, docs) : importer!.slice(0, importer!.indexOf("/examples/"))
        const base = docs >= 0 ? "apps/docs/src" : "examples/deep-research-agent/web/src"
        return `${join(workspaceRoot, base, source.slice(2))}.ts`
      },
    },
  ],
  test: {
    maxWorkers: workers,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    environmentMatchGlobs: [["apps/docs/**", "happy-dom"]],
    include: [
      "packages/**/test/**/*.test.ts",
      "apps/**/src/**/*.test.ts",
      "apps/**/test/**/*.test.ts",
      "examples/**/test/**/*.test.ts",
      "examples/**/src/**/*.test.ts",
      "test/**/*.test.ts",
    ],
    coverage: {
      enabled: false,
      provider: "v8",
      reporter: ["text", "lcov"],
      reportsDirectory: "coverage",
      include: ["packages/**/src/**/*.ts"],
      exclude: ["packages/**/dist/**"],
      thresholds: {
        statements: 80,
        branches: 65,
        functions: 70,
        lines: 80,
      },
    },
  },
})
