import { expect, it } from "vitest"
import {
  SCHEMA_STATEMENTS as sqliteStatements,
  SCHEMA_VERSION as sqliteVersion,
  schemaChecksum as sqliteChecksum,
} from "../src/sql/schema.js"
import {
  SCHEMA_STATEMENTS as postgresStatements,
  SCHEMA_VERSION as postgresVersion,
  schemaChecksum as postgresChecksum,
} from "../src/sql/postgres/schema.js"
import {
  SCHEMA_STATEMENTS as mysqlStatements,
  SCHEMA_VERSION as mysqlVersion,
  schemaChecksum as mysqlChecksum,
} from "../src/sql/mysql/schema.js"

it("freezes schema checksums for every dialect", () => {
  expect({ sqliteVersion, postgresVersion, mysqlVersion }).toEqual({
    sqliteVersion: 3,
    postgresVersion: 1,
    mysqlVersion: 1,
  })
  expect(sqliteChecksum()).toBe("4fa402776d638ae81de873c1e30dbed4c932a2da031b6150fe82d900f043db8a")
  expect(postgresChecksum()).toBe("f64d6874bb8e8eb0eaf477574bc2ff9315ea2d9af1b68c44b7d5b4cd7c49c1d7")
  expect(mysqlChecksum()).toBe("3b7d0c2cdbfa2aff1bff9cb3094ceb1417409454172489bb618a053b21db26bc")
})

it.each([
  ["sqlite", sqliteStatements],
  ["postgres", postgresStatements],
  ["mysql", mysqlStatements],
])("keeps the %s acknowledgement boundary relational", (_, statements) => {
  const runs = statements.find((statement) => statement.includes("CREATE TABLE IF NOT EXISTS baton_runs"))!
  const events = statements.find((statement) => statement.includes("CREATE TABLE IF NOT EXISTS baton_run_events"))!
  const acknowledgements = statements.find((statement) =>
    statement.includes("CREATE TABLE IF NOT EXISTS baton_run_acks"),
  )!
  expect(runs).toContain("last_committed_sequence")
  expect(events).toContain("event_tag")
  expect(acknowledgements).toMatch(/run_id .*PRIMARY KEY/)
  expect(acknowledgements).toMatch(/sequence .*NOT NULL/)
  expect(acknowledgements).toMatch(/acknowledged_at .*NOT NULL/)
  expect(acknowledgements).toMatch(/FOREIGN KEY \(run_id\)|PRIMARY KEY REFERENCES baton_runs\(run_id\)/)
})
