import { expect, it } from "vitest"
import { SCHEMA_VERSION, schemaChecksum } from "../../../../src/runtime/sql/codec/schema.js"

it("freezes the sqlite schema checksum", () => {
  expect(SCHEMA_VERSION).toBe(1)
  expect(schemaChecksum()).toBe("54c0f23dd25aa075b89bbc964d51aee1f14494c728aa0cabce5078d6102f03cd")
})
