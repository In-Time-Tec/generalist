import { expect, it } from "vitest"
import { SCHEMA_VERSION, schemaChecksum } from "../../src/runtime/sql/schema.js"

it("freezes the sqlite schema checksum", () => {
  expect(SCHEMA_VERSION).toBe(9)
  expect(schemaChecksum()).toBe("2338cd95242ce39da54592f8b4abf764a2a56bffc51a9ee0066a8db140f49dff")
})
