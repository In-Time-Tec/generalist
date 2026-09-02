import { layer as sqliteClientLayer } from "@effect/sql-sqlite-bun/SqliteClient"
import { describe } from "@effect/vitest"
import { Layer } from "effect"
import { adjust as adjustTestClock } from "effect/testing/TestClock"
import { layerMemory, layerSql } from "../../src/memo.js"
import { apply as applySqliteSchema } from "../../src/runtime/sql/migrate.js"
import { Testing } from "../../src/testing/index.js"
import { mysqlAvailable, mysqlDatabase } from "../mysql/runtime/environment.js"
import { postgresAvailable, postgresDatabase } from "../pg/database.js"

Testing.memo({ layer: layerMemory(), adjustClock: adjustTestClock("1 hour") })

const sqliteSchema = Layer.effectDiscard(applySqliteSchema("memo-conformance")).pipe(
  Layer.provideMerge(sqliteClientLayer({ filename: ":memory:" })),
)
Testing.memo({ layer: layerSql().pipe(Layer.provide(sqliteSchema)), adjustClock: adjustTestClock("1 hour") })

if (postgresAvailable) {
  const database = postgresDatabase("memo_conformance")
  Testing.memo({
    layer: database.provision(layerSql().pipe(Layer.provide(database.client))),
    adjustClock: adjustTestClock("1 hour"),
  })
} else {
  describe.skip("PostgreSQL Memo conformance (set GENERALIST_DATABASE_URL or DATABASE_URL)", () => undefined)
}

if (mysqlAvailable) {
  const database = mysqlDatabase("memo_conformance")
  Testing.memo({
    layer: database.provision(layerSql().pipe(Layer.provide(database.client))),
    adjustClock: adjustTestClock("1 hour"),
  })
} else {
  describe.skip("MySQL Memo conformance (set GENERALIST_MYSQL_URL or MYSQL_URL)", () => undefined)
}
