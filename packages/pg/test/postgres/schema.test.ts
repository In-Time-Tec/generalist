import { expect, it } from "vitest"
import { SCHEMA_VERSION, schemaChecksum } from "../../src/postgres/schema.js"

it("freezes the postgres schema checksum", () => {
  expect(SCHEMA_VERSION).toBe(1)
  expect(schemaChecksum()).toBe("1cb3fef614ebbfa34726c62f11ab162874d7b71aa58886351214f7fedf915f14")
})
