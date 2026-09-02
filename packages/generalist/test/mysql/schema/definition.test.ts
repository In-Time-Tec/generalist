import { expect, it } from "vitest"
import { SCHEMA_VERSION, schemaChecksum } from "../../../src/mysql/schema/definition.js"

it("freezes the logical SQL Runtime schema checksum", () => {
  expect(SCHEMA_VERSION).toBe(8)
  expect(schemaChecksum()).toBe("ccb5567158d6f58180e3abf2bf744e74e526a467f08ef2706826ff77e3d4682c")
})
