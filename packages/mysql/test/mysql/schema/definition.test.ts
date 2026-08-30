import { expect, it } from "vitest"
import { SCHEMA_VERSION, schemaChecksum } from "../../../src/mysql/schema/definition.js"

it("freezes the mysql schema definition checksum", () => {
  expect(SCHEMA_VERSION).toBe(4)
  expect(schemaChecksum()).toBe("a73424b153a243878f1c999a478ec8425c43101479757c8103056f09d3c81511")
})
