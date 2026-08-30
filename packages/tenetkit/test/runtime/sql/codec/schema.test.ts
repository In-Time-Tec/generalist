import { expect, it } from "vitest"
import { SCHEMA_VERSION, schemaChecksum } from "../../../../src/runtime/sql/codec/schema.js"

it("freezes the sqlite schema checksum", () => {
  expect(SCHEMA_VERSION).toBe(4)
  expect(schemaChecksum()).toBe("593119f1e061fa9a36d96607788a46985ed6b96222c2d7b221be160041819f3f")
})
