import { Function, Layer } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { SqliteClient } from "@effect/sql-sqlite-do"
import { RunStore } from "tenetkit/runtime/driver/run-store"
import { layerSqliteStore, type SqliteStoreError, type SqliteStoreOptions } from "tenetkit/runtime/driver/sql/store"

/** @experimental */
export type DurableObjectStorage = Parameters<typeof SqliteClient.make>[0]["storage"]

/** @experimental */
export const makeSqlClient = (storage: DurableObjectStorage) => SqliteClient.make({ storage })

/** @experimental */
export const layerSqlClient = (
  storage: DurableObjectStorage,
): Layer.Layer<SqlClient.SqlClient | SqliteClient.SqliteClient> => SqliteClient.layer({ storage })

/** @experimental */
export const layerRunStore: {
  (storage: DurableObjectStorage, options: SqliteStoreOptions): Layer.Layer<RunStore, SqliteStoreError>
  (options: SqliteStoreOptions): (storage: DurableObjectStorage) => Layer.Layer<RunStore, SqliteStoreError>
} = Function.dual(
  2,
  (storage: DurableObjectStorage, options: SqliteStoreOptions): Layer.Layer<RunStore, SqliteStoreError> =>
    layerSqliteStore({ ...options, source: options.source ?? "durable-object" }).pipe(
      Layer.provide(layerSqlClient(storage)),
    ),
)
