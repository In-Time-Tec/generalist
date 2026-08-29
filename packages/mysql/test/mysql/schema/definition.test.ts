import { expect, it } from "vitest"
import { SCHEMA_VERSION, schemaChecksum } from "../../../src/mysql/schema/definition.js"

it("freezes the mysql schema definition checksum", () => {
  expect(SCHEMA_VERSION).toBe(3)
  expect(schemaChecksum()).toBe("50c911e850c155c623d4a6528292517795262102f3f5927aa5b0fb2d183009f6")
})
