import { expect, it } from "vitest"
import { SCHEMA_VERSION, schemaChecksum } from "../../../src/mysql/schema/definition.js"

it("freezes the logical SQL Runtime schema checksum", () => {
  expect(SCHEMA_VERSION).toBe(5)
  expect(schemaChecksum()).toBe("f2294d7660cc5bdee163b6c7df36b06557699a292641ecd687d5b262cb2ca9b9")
})
