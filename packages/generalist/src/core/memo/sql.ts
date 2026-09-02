import { Clock, Effect, Layer, Option, Schema, Semaphore } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { Store, type Entry, type LayerOptions } from "./service.js"

interface Row {
  readonly value_json: string
  readonly from_run: string
  readonly from_operation: string
  readonly expires_at_millis: number | string
}

const StoredValue = Schema.fromJsonString(Schema.Unknown)

export const layerSql = (options: LayerOptions = {}): Layer.Layer<Store, never, SqlClient.SqlClient> =>
  Layer.effect(
    Store,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const writes = yield* Semaphore.make(1)
      return Store.of({
        modelsEnabled: options.models?.enabled === true,
        get: (key) =>
          Effect.gen(function* () {
            const now = yield* Clock.currentTimeMillis
            const rows = yield* sql<Row>`
                SELECT value_json, from_run, from_operation, expires_at_millis
                FROM generalist_memo_entries
                WHERE memo_key = ${key} AND expires_at_millis > ${now}
              `
            const row = rows[0]
            if (row === undefined) return Option.none<Entry>()
            const value = yield* Schema.decodeEffect(StoredValue)(row.value_json).pipe(Effect.option)
            return Option.map(value, (decoded) => ({
              value: decoded,
              fromRun: row.from_run,
              fromOperation: row.from_operation,
              expiresAtMillis: Number(row.expires_at_millis),
            }))
          }).pipe(Effect.orElseSucceed(() => Option.none<Entry>())),
        put: (key, entry) =>
          writes
            .withPermit(
              Effect.gen(function* () {
                const value = yield* Schema.encodeEffect(StoredValue)(entry.value)
                yield* sql.withTransaction(
                  Effect.gen(function* () {
                    yield* sql`DELETE FROM generalist_memo_entries WHERE memo_key = ${key}`
                    yield* sql`
                      INSERT INTO generalist_memo_entries
                        (memo_key, value_json, from_run, from_operation, expires_at_millis)
                      VALUES (${key}, ${value}, ${entry.fromRun}, ${entry.fromOperation}, ${entry.expiresAtMillis})
                    `
                  }),
                )
              }),
            )
            .pipe(Effect.orElseSucceed(() => undefined)),
      })
    }),
  )
