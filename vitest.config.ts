import { join } from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
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
    maxWorkers: 2,
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
      "tooling/**/test/**/*.test.ts",
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
