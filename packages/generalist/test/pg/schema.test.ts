import { expect, it } from "vitest"
import { SCHEMA_VERSION, schemaChecksum } from "../../src/pg/schema.js"

it("freezes the logical SQL Runtime schema checksum", () => {
  expect(SCHEMA_VERSION).toBe(9)
  expect(schemaChecksum()).toBe("d5f76f5ec53632b3e0ab89cea4eee5d34d5a4062fa02af969239e14d0b18b9b0")
})
