import { expect, it } from "vitest"
import { SCHEMA_VERSION, schemaChecksum } from "../../../../src/runtime/sql/codec/schema.js"

it("freezes the logical SQL Runtime schema checksum", () => {
  expect(SCHEMA_VERSION).toBe(6)
  expect(schemaChecksum()).toBe("18d42d25b5249f1cfe3654bc42c647cb9b317b6a48b7cc209b84ec2f8cc35f27")
})
