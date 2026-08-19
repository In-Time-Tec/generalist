import { expect, it } from "vitest"
import { SCHEMA_VERSION, schemaChecksum } from "../src/postgres/schema.js"

it("freezes the postgres schema checksum", () => {
  expect(SCHEMA_VERSION).toBe(8)
  expect(schemaChecksum()).toBe("1962316a596c160a6f1f08adc7904bc66406c013e2956f7282b0fec6df88eb46")
})
