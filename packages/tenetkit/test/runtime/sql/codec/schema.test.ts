import { expect, it } from "vitest"
import { SCHEMA_VERSION, schemaChecksum } from "../../../../src/runtime/sql/codec/schema.js"

it("freezes the sqlite schema checksum", () => {
  expect(SCHEMA_VERSION).toBe(2)
  expect(schemaChecksum()).toBe("c7a0cc65a10f51d3ef0f6e634f1d7487bb8a38735aa01f879b79a219164b87ce")
})
