import type { Layer } from "effect"
import type { SqlClient } from "effect/unstable/sql"
import { SqliteClient } from "@effect/sql-sqlite-do"
import type { ExternalChildStore } from "../../runtime/child/external/store.js"
import type { RunStore } from "../../runtime/run/store.js"
import { layerSqliteStore, type SqliteStoreError, type SqliteStoreOptions } from "../../runtime/sql-driver.js"

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
): Layer.Layer<RunStore | ExternalChildStore, SqliteStoreError, SqlClient.SqlClient> =>
  layerSqliteStore({ ...options, source: options.source ?? "durable-object" })
