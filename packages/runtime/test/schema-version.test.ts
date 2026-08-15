import { expect, it } from "vitest"
import { SCHEMA_VERSION as sqliteVersion, schemaChecksum as sqliteChecksum } from "../src/sql/schema.js"
import { SCHEMA_VERSION as postgresVersion, schemaChecksum as postgresChecksum } from "../src/sql/postgres/schema.js"
import { SCHEMA_VERSION as mysqlVersion, schemaChecksum as mysqlChecksum } from "../src/sql/mysql/schema.js"

it("freezes schema checksums for every dialect", () => {
  expect({ sqliteVersion, postgresVersion, mysqlVersion }).toEqual({
    sqliteVersion: 8,
    postgresVersion: 7,
    mysqlVersion: 7,
  })
  expect(sqliteChecksum()).toBe("8c4d3189fec1bc044e790db21b499b0ca160743b6e6c64e92de985a26304c7d9")
  expect(postgresChecksum()).toBe("4d86018b3453e9757e05694ce981fc486a15a00ebb36874b49821f6289e6d495")
  expect(mysqlChecksum()).toBe("6cfa29360d837cbfb4fecedc03fae46ebc0ea0dab4980c424941c56022f2b5b1")
})
