import { expect, it } from "vitest"
import { SCHEMA_VERSION, schemaChecksum } from "../../src/postgres/schema.js"

it("freezes the logical SQL Runtime schema checksum", () => {
  expect(SCHEMA_VERSION).toBe(4)
  expect(schemaChecksum()).toBe("440b5f1b645eb00d37f28a2f4cbb3dab9e7da4a10864631a860967aaef934729")
})
