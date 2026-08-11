import { expect, it } from "vitest"
import { SCHEMA_VERSION as sqliteVersion, schemaChecksum as sqliteChecksum } from "../src/sql/schema.js"
import { SCHEMA_VERSION as postgresVersion, schemaChecksum as postgresChecksum } from "../src/sql/postgres/schema.js"
import { SCHEMA_VERSION as mysqlVersion, schemaChecksum as mysqlChecksum } from "../src/sql/mysql/schema.js"

it("freezes schema checksums for every dialect", () => {
  expect({ sqliteVersion, postgresVersion, mysqlVersion }).toEqual({
    sqliteVersion: 5,
    postgresVersion: 3,
    mysqlVersion: 3,
  })
  expect(sqliteChecksum()).toBe("8d9b11f16424580ced098444542e85e9b8aa43083ea3820efec45b5c3b93333e")
  expect(postgresChecksum()).toBe("6034b9296b9896ac80df8bcb55d193abf40d2a776aba71de34e8b789b9496903")
  expect(mysqlChecksum()).toBe("01b5de38e6bf15536bc6081f1e8b697c2c7e47966671dbe54daeb6b964aaef87")
})
