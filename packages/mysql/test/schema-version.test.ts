import { expect, it } from "vitest"
import { SCHEMA_VERSION, schemaChecksum } from "../src/mysql/schema.js"

it("freezes the mysql schema checksum", () => {
  expect(SCHEMA_VERSION).toBe(7)
  expect(schemaChecksum()).toBe("6cfa29360d837cbfb4fecedc03fae46ebc0ea0dab4980c424941c56022f2b5b1")
})
