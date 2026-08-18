import { expect, it } from "vitest"
import { SCHEMA_VERSION, schemaChecksum } from "../src/postgres/schema.js"

it("freezes the postgres schema checksum", () => {
  expect(SCHEMA_VERSION).toBe(7)
  expect(schemaChecksum()).toBe("4d86018b3453e9757e05694ce981fc486a15a00ebb36874b49821f6289e6d495")
})
