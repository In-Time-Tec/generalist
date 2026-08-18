import { expect, it } from "vitest"
import { SCHEMA_VERSION, schemaChecksum } from "../../src/runtime/sql/schema.js"

it("freezes the sqlite schema checksum", () => {
  expect(SCHEMA_VERSION).toBe(8)
  expect(schemaChecksum()).toBe("8c4d3189fec1bc044e790db21b499b0ca160743b6e6c64e92de985a26304c7d9")
})
