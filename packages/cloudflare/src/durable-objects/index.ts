import type { Layer } from "effect"
import type { SqlClient } from "effect/unstable/sql"
import { SqliteClient } from "@effect/sql-sqlite-do"
import type { ExternalChildStore, RunStore } from "tenetkit/runtime"
import { layerSqliteStore, type SqliteStoreError, type SqliteStoreOptions } from "tenetkit/runtime/sql-driver"

export * as HibernatingWebSocket from "./hibernating-websocket.js"

/** @experimental */
export type DurableObjectStorage = NonNullable<Parameters<typeof SqliteClient.make>[0]["storage"]>

/** @experimental */
export const makeSqlClient = (storage: DurableObjectStorage) => SqliteClient.make({ storage })

/** @experimental */
export const layerSqlClient = (
  storage: DurableObjectStorage,
): Layer.Layer<SqlClient.SqlClient | SqliteClient.SqliteClient> => SqliteClient.layer({ storage })

/** @experimental */
export const layerRunStore = (
  options: SqliteStoreOptions,
): Layer.Layer<RunStore.RunStore | ExternalChildStore.ExternalChildStore, SqliteStoreError, SqlClient.SqlClient> =>
  layerSqliteStore({ ...options, source: options.source ?? "durable-object" })
