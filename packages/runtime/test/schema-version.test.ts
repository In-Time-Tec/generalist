import { expect, it } from "vitest"
import { SCHEMA_VERSION as sqliteVersion, schemaChecksum as sqliteChecksum } from "../src/sql/schema.js"
import { SCHEMA_VERSION as postgresVersion, schemaChecksum as postgresChecksum } from "../src/sql/postgres/schema.js"
import { SCHEMA_VERSION as mysqlVersion, schemaChecksum as mysqlChecksum } from "../src/sql/mysql/schema.js"

it("freezes schema checksums for every dialect", () => {
  expect({ sqliteVersion, postgresVersion, mysqlVersion }).toEqual({
    sqliteVersion: 2,
    postgresVersion: 1,
    mysqlVersion: 1,
  })
  expect(sqliteChecksum()).toBe("83f8e8297130a76ad59cc251bce2809d309e87fbc36ee090674419c21ef18435")
  expect(postgresChecksum()).toBe("86f321718e6e5b932e318e037114b2147a741454be0cabda2d3a82545555a138")
  expect(mysqlChecksum()).toBe("879fc8d05eab92bd53deffe335e2cefbbf07dae90834531d2458de76ebd4b602")
})
