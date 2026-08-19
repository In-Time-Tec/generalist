import { expect, it } from "vitest"
import { SCHEMA_VERSION, schemaChecksum } from "../src/mysql/schema.js"

it("freezes the mysql schema checksum", () => {
  expect(SCHEMA_VERSION).toBe(8)
  expect(schemaChecksum()).toBe("a90004f0393c21b523027572b500a55248bbe2bb9037b5fcad8370ad7d416ae8")
})
