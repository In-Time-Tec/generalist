import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

describe("repository policy", () => {
  it("keeps the production source ceiling and removes legacy exceptions", () => {
    const root = new URL("../../..", import.meta.url).pathname
    const source = readFileSync(join(root, "packages/core/src/agent/agent-run.ts"), "utf8")
    const config = readFileSync(join(root, ".oxlintrc.json"), "utf8")
    expect(source.split("\n").length - 1).toBeLessThanOrEqual(500)
    expect(config).not.toContain('"max-lines": "off"')
  })
})
