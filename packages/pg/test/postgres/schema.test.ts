import { expect, it } from "vitest"
import { SCHEMA_VERSION, schemaChecksum } from "../../src/postgres/schema.js"

it("freezes the postgres schema checksum", () => {
  expect(SCHEMA_VERSION).toBe(1)
  expect(schemaChecksum()).toBe("dede3341e53e6e7fac58aa4c6b1419939d2eea027abaf3d463b5bac4bfafed70")
})
