import { expect, it } from "vitest"
import { SCHEMA_VERSION, schemaChecksum } from "../../src/pg/schema.js"

it("freezes the logical SQL Runtime schema checksum", () => {
  expect(SCHEMA_VERSION).toBe(4)
  expect(schemaChecksum()).toBe("c9ff31038d2758d3398dc9836880285b23a0428fd0a08c4c0752757a6e647d4a")
})
