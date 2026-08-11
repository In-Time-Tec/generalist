import { expect, it } from "vitest"
import { SCHEMA_VERSION as sqliteVersion, schemaChecksum as sqliteChecksum } from "../src/sql/schema.js"
import { SCHEMA_VERSION as postgresVersion, schemaChecksum as postgresChecksum } from "../src/sql/postgres/schema.js"
import { SCHEMA_VERSION as mysqlVersion, schemaChecksum as mysqlChecksum } from "../src/sql/mysql/schema.js"

it("freezes schema checksums for every dialect", () => {
  expect({ sqliteVersion, postgresVersion, mysqlVersion }).toEqual({
    sqliteVersion: 5,
    postgresVersion: 4,
    mysqlVersion: 3,
  })
  expect(sqliteChecksum()).toBe("8d9b11f16424580ced098444542e85e9b8aa43083ea3820efec45b5c3b93333e")
  expect(postgresChecksum()).toBe("bf2c6df338a2ead80e48b39dc6c1e88be4b24daa304feb3f3d7749a1fc7de50b")
  expect(mysqlChecksum()).toBe("01b5de38e6bf15536bc6081f1e8b697c2c7e47966671dbe54daeb6b964aaef87")
})
