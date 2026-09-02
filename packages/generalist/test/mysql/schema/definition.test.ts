import { expect, it } from "vitest"
import { SCHEMA_VERSION, schemaChecksum } from "../../../src/mysql/schema/definition.js"

it("freezes the logical SQL Runtime schema checksum", () => {
  expect(SCHEMA_VERSION).toBe(8)
  expect(schemaChecksum()).toBe("3e6286e7016fac1fa5b7a589d34ebe7d851be73bb485332e554aeb679a4f8008")
})
