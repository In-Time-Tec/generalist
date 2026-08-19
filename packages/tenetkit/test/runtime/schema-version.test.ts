import { expect, it } from "vitest"
import { SCHEMA_VERSION, schemaChecksum } from "../../src/runtime/sql/schema.js"

it("freezes the sqlite schema checksum", () => {
  expect(SCHEMA_VERSION).toBe(9)
  expect(schemaChecksum()).toBe("48372a08a8b55da723db3a46741587edfdb823dc28bc263b8e99ee7d77dba2ac")
})
