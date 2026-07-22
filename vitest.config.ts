import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: [
      { find: "@", replacement: fileURLToPath(new URL("./examples/deep-research-agent/web/src", import.meta.url)) },
    ],
  },
  test: {
    include: [
      "packages/**/test/**/*.test.ts",
      "examples/deep-research-agent/server/test/**/*.test.ts",
      "examples/deep-research-agent/web/src/**/*.test.ts",
      "test/scripts/**/*.test.ts",
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
