import { expect, it } from "vitest"
import { SCHEMA_VERSION, schemaChecksum } from "../../../../src/runtime/sql/codec/schema.js"

it("freezes the logical SQL Runtime schema checksum", () => {
  expect(SCHEMA_VERSION).toBe(10)
  expect(schemaChecksum()).toBe("988a36dc0c951edaca0e2780a6c373344f5133102aee479b099ba334f051f43f")
})
