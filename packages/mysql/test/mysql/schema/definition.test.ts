import { expect, it } from "vitest"
import { SCHEMA_VERSION, schemaChecksum } from "../../../src/mysql/schema/definition.js"

it("freezes the mysql schema definition checksum", () => {
  expect(SCHEMA_VERSION).toBe(2)
  expect(schemaChecksum()).toBe("7f242b1c76b75b0cba8e13318706580f22381ca0ed5dca2daf6c5f31c2b7b701")
})
