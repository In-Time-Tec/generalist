import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

describe("repository graph relationships", () => {
  it("contains only existing test targets and fixed relationship kinds", () => {
    const root = new URL("../../..", import.meta.url).pathname
    const relationships = JSON.parse(
      readFileSync(join(root, "tooling/repository-graph/test-relationships.json"), "utf8"),
    ) as ReadonlyArray<{ readonly source: string; readonly test: string; readonly kind: string }>
    expect(relationships.length).toBeGreaterThan(0)
    for (const relationship of relationships) {
      expect(readFileSync(join(root, relationship.test), "utf8")).toMatch(/(?:it|test|live)(?:\.[A-Za-z]+)?\s*\(/)
      expect(["same-stem", "package-contract", "integration", "fixture"]).toContain(relationship.kind)
    }
  })
})
