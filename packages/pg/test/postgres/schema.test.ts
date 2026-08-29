import { expect, it } from "vitest"
import { SCHEMA_VERSION, schemaChecksum } from "../../src/postgres/schema.js"

it("freezes the postgres schema checksum", () => {
  expect(SCHEMA_VERSION).toBe(2)
  expect(schemaChecksum()).toBe("e95179fb7e01831e1a0d86e44a65b709199387e7623f2db44956ad7fa8ed6699")
})
