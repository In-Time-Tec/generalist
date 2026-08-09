import { expect, it } from "vitest"
import { SCHEMA_VERSION as sqliteVersion, schemaChecksum as sqliteChecksum } from "../src/sql/schema.js"
import { SCHEMA_VERSION as postgresVersion, schemaChecksum as postgresChecksum } from "../src/sql/postgres/schema.js"
import { SCHEMA_VERSION as mysqlVersion, schemaChecksum as mysqlChecksum } from "../src/sql/mysql/schema.js"

it("freezes schema checksums for every dialect", () => {
  expect({ sqliteVersion, postgresVersion, mysqlVersion }).toEqual({
    sqliteVersion: 3,
    postgresVersion: 2,
    mysqlVersion: 2,
  })
  expect(sqliteChecksum()).toBe("646ffa224696dff192b63921ff8cea127813dbc4524b7416d537f92df1c46095")
  expect(postgresChecksum()).toBe("285ad815a4d33e6d360787b58aaf38d326a6963c136bde7e027069630cedcebf")
  expect(mysqlChecksum()).toBe("3ed9ba31beccc138d24bfdc31a5d89873e96220d45280825f92fd9727e710aad")
})
