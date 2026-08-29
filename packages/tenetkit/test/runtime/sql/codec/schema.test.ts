import { expect, it } from "vitest"
import { SCHEMA_VERSION, schemaChecksum } from "../../../../src/runtime/sql/codec/schema.js"

it("freezes the sqlite schema checksum", () => {
  expect(SCHEMA_VERSION).toBe(3)
  expect(schemaChecksum()).toBe("3fac45bb8bb24f99a5ab7ca44e4dc67855f26d88f30f7ab7ee70b6d4e33cad40")
})
