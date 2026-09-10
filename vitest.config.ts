import { availableParallelism } from "node:os"
import { fileURLToPath } from "node:url"
import { configDefaults, defineConfig } from "vitest/config"
import generalistManifest from "./packages/generalist/package.json" with { type: "json" }
import { RuntimeDriverReport } from "./scripts/runtime-driver-report"

const repositoryRoot = fileURLToPath(new URL(".", import.meta.url))
const generalistRoot = new URL("./packages/generalist/", import.meta.url)
const generalistExports: Readonly<Record<string, { readonly import: string }>> = generalistManifest.exports
const localSchedulerTest = "packages/generalist/test/runtime/execution/local-scheduler.test.ts"

/**
 * Tests import `generalist/*` specifiers that resolve through the package `exports` map to `dist/`,
 * while the shared test helpers import `packages/generalist/src` directly. Left alone the suite loads
 * two copies of every service and error class, so `instanceof` assertions fail against structurally
 * identical values. The `exports` map is the only place that knows how a specifier maps onto a file,
 * so the alias table is derived from it rather than restated.
 */
const generalistSourceAliases: Array<{ readonly find: RegExp; readonly replacement: string }> = []
for (const specifier in generalistExports) {
  const source = generalistExports[specifier].import.replace(/^\.\/dist\//, "src/").replace(/\.js$/, ".ts")
  const pattern = `generalist${specifier === "." ? "" : specifier.slice(1)}`
  generalistSourceAliases.push(
    specifier.includes("*")
      ? {
          find: new RegExp(`^${pattern.replace("*", "(.*)")}$`),
          replacement: fileURLToPath(new URL(source.replace("*", "$1"), generalistRoot)),
        }
      : { find: new RegExp(`^${pattern}$`), replacement: fileURLToPath(new URL(source, generalistRoot)) },
  )
}
generalistSourceAliases.sort(
  (left, right) => Number(left.find.source.includes("(")) - Number(right.find.source.includes("(")),
)

export default defineConfig({
  resolve: {
    /**
     * `generalist/*` specifiers resolve through the package `exports` map to `dist/`, while the shared
     * test helpers import `packages/generalist/src` directly. Without this the suite loads two copies
     * of every service and error class, and `instanceof` assertions fail against identical values.
     */
    alias: generalistSourceAliases,
  },
  plugins: [
    {
      name: "workspace-at-alias",
      resolveId(source: string, importer: string | undefined) {
        if (!source.startsWith("@/") || importer === undefined) return undefined
        return `${repositoryRoot}examples/deep-research-agent/web/src/${source.slice(2)}.ts`
      },
    },
  ],
  test: {
    env: { RIVETKIT_STORAGE_PATH: `/tmp/generalist-rivetkit-${process.pid}` },
    reporters: ["default", new RuntimeDriverReport()],
    maxWorkers: Math.min(4, availableParallelism()),
    testTimeout: 60_000,
    hookTimeout: 60_000,
    projects: [
      {
        extends: true,
        test: {
          name: "local-scheduler",
          include: [localSchedulerTest],
          sequence: { groupOrder: 0 },
        },
      },
      {
        extends: true,
        test: {
          name: "parallel",
          include: [
            "packages/**/test/**/*.test.ts",
            "examples/**/test/**/*.test.ts",
            "examples/**/src/**/*.test.ts",
            "test/**/*.test.ts",
          ],
          exclude: [...configDefaults.exclude, localSchedulerTest],
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
})
