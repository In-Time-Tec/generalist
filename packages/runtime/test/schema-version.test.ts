import { expect, it } from "vitest"
import { SCHEMA_VERSION as sqliteVersion, schemaChecksum as sqliteChecksum } from "../src/sql/schema.js"
import { SCHEMA_VERSION as postgresVersion, schemaChecksum as postgresChecksum } from "../src/sql/postgres/schema.js"
import { SCHEMA_VERSION as mysqlVersion, schemaChecksum as mysqlChecksum } from "../src/sql/mysql/schema.js"

it("freezes schema checksums for every dialect", () => {
  expect({ sqliteVersion, postgresVersion, mysqlVersion }).toEqual({
    sqliteVersion: 7,
    postgresVersion: 6,
    mysqlVersion: 6,
  })
  expect(sqliteChecksum()).toBe("848485ca16e31dcfa790f6293c5ce8182a1ea5cc0468b7b37dba77f4aea71529")
  expect(postgresChecksum()).toBe("453d8a861a831fca98dc969226d130d1f64d767b93893621553682a1adcec022")
  expect(mysqlChecksum()).toBe("89475b3daaa109e63fdf7d8fdec81db5c76cbca10e413732549041f51b7847d6")
})
