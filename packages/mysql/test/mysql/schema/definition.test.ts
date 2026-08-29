import { expect, it } from "vitest"
import { SCHEMA_VERSION, schemaChecksum } from "../../../src/mysql/schema/definition.js"

it("freezes the mysql schema definition checksum", () => {
  expect(SCHEMA_VERSION).toBe(1)
  expect(schemaChecksum()).toBe("38acedc6ff4e1539914eb9d2acaba17ea7db88f1093bd716c25c721663d7b697")
})
