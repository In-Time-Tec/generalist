import { expect, it } from "vitest"
import { SCHEMA_VERSION, schemaChecksum } from "../../../../src/runtime/sql/codec/schema.js"

it("freezes the logical SQL Runtime schema checksum", () => {
  expect(SCHEMA_VERSION).toBe(7)
  expect(schemaChecksum()).toBe("5d46f20734a08af389ccb570727c459022316e0b341fa4322e3e28636fc79e09")
})
