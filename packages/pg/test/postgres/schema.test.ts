import { expect, it } from "vitest"
import { SCHEMA_VERSION, schemaChecksum } from "../../src/postgres/schema.js"

it("freezes the postgres schema checksum", () => {
  expect(SCHEMA_VERSION).toBe(3)
  expect(schemaChecksum()).toBe("8ca827b12364298b93a13c211f5ffc8ebd933f6e3c9ebae01244ad3054c9c5e5")
})
