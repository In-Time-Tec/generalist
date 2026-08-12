import { expect, it } from "vitest"
import { SCHEMA_VERSION as sqliteVersion, schemaChecksum as sqliteChecksum } from "../src/sql/schema.js"
import { SCHEMA_VERSION as postgresVersion, schemaChecksum as postgresChecksum } from "../src/sql/postgres/schema.js"
import { SCHEMA_VERSION as mysqlVersion, schemaChecksum as mysqlChecksum } from "../src/sql/mysql/schema.js"

it("freezes schema checksums for every dialect", () => {
  expect({ sqliteVersion, postgresVersion, mysqlVersion }).toEqual({
    sqliteVersion: 6,
    postgresVersion: 5,
    mysqlVersion: 5,
  })
  expect(sqliteChecksum()).toBe("2f7577598f2eb330eecfd0103fd5da32f7afb56b302b2cffefb17f9dcb9124bd")
  expect(postgresChecksum()).toBe("8c6590014f6b8c9935896fc29d9ec061274023fc7f41c9a283ad5e84d2bf2f26")
  expect(mysqlChecksum()).toBe("3b1418878291309105920ede9eaadf823fa823bfb7d50f770457fe834e7abbd6")
})
