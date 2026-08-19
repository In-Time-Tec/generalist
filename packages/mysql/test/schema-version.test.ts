import { expect, it } from "vitest"
import { SCHEMA_VERSION, schemaChecksum } from "../src/mysql/schema.js"

it("freezes the mysql schema checksum", () => {
  expect(SCHEMA_VERSION).toBe(1)
  expect(schemaChecksum()).toBe("0f8a00fe75b4dddacf91d9efa732d929a9b706be7ddb283236764558f410550f")
})
