import { expect, it } from "vitest"
import { SCHEMA_VERSION as sqliteVersion, schemaChecksum as sqliteChecksum } from "../src/sql/schema.js"
import { SCHEMA_VERSION as postgresVersion, schemaChecksum as postgresChecksum } from "../src/sql/postgres/schema.js"
import { SCHEMA_VERSION as mysqlVersion, schemaChecksum as mysqlChecksum } from "../src/sql/mysql/schema.js"

it("freezes schema checksums for every dialect", () => {
  expect({ sqliteVersion, postgresVersion, mysqlVersion }).toEqual({
    sqliteVersion: 3,
    postgresVersion: 1,
    mysqlVersion: 1,
  })
  expect(sqliteChecksum()).toBe("22caaa19e194b66509d398e190c8bcf44456911c063a02caaf27c7cc75fb86ae")
  expect(postgresChecksum()).toBe("a911568929516be3ceb71e44adf2acdca57bb44741eca035e2ac42e1dc1981ea")
  expect(mysqlChecksum()).toBe("105ea4f53b140423a7b9a9ca3a4efeeffeeb86d10d8b3c022ac1a92e5f60c553")
})
