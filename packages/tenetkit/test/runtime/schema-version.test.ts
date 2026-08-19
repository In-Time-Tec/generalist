import { expect, it } from "vitest"
import { SCHEMA_VERSION, schemaChecksum } from "../../src/runtime/sql/schema.js"

it("freezes the sqlite schema checksum", () => {
  expect(SCHEMA_VERSION).toBe(1)
  expect(schemaChecksum()).toBe("291a6dc75aaf89b724a827d49be2a80cdd61016604e8c42f0fe1e8cb1b046969")
})
