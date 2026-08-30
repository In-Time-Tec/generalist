import { expect, it } from "vitest"
import { SCHEMA_VERSION, schemaChecksum } from "../../src/postgres/schema.js"

it("freezes the postgres schema checksum", () => {
  expect(SCHEMA_VERSION).toBe(4)
  expect(schemaChecksum()).toBe("4e87717f759d2fe3e003a54b7fb11241f7d826b54ff6918c4acce9b1bf0ed686")
})
