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
  expect(sqliteChecksum()).toBe("ce0e7adfbced0457bfe706458590c829cae5c5333740ff7329ab4d928048de6b")
  expect(postgresChecksum()).toBe("effcf8cdaeddba5bfc6c5bf8c4cd942e7d10d0d0fdaf3d5d8050f856bfaebaf3")
  expect(mysqlChecksum()).toBe("2331207f562571d887456e5bbbd2b196210e6121372c95e28a02dcc2a60ea27b")
})
