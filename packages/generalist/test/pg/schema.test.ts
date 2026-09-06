import { expect, it } from "vitest"
import { SCHEMA_VERSION, schemaChecksum } from "../../src/pg/schema.js"

it("freezes the logical SQL Runtime schema checksum", () => {
  expect(SCHEMA_VERSION).toBe(11)
  expect(schemaChecksum()).toBe("6f59fca9569bc686037f450989cea5f588220fdad53620cdbe7769284d9bbcac")
})
