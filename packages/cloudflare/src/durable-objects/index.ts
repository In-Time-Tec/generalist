import type { Layer } from "effect"
import type { SqlClient } from "effect/unstable/sql"
import { SqliteClient } from "@effect/sql-sqlite-do"
import type { RunStore } from "tenetkit/runtime/driver/run-store"
import { layerSqliteStore, type SqliteStoreError, type SqliteStoreOptions } from "tenetkit/runtime/driver/sql/store"

export { drain, type DrainOptions, type DrainResult } from "./drain.js"
export { makeProjection, migrateAndBackfill, nextDueAt, schema, type Rearm } from "./activations.js"
export { makeExclusiveExecutionRecovery } from "./recovery.js"
export {
  makeHibernatingWebSocket,
  type Attachment,
  type FlushResult,
  type HibernatingWebSocket,
  type HibernatingWebSocketOptions,
  type HibernatingWebSocketState,
} from "./hibernating-websocket.js"

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
): Layer.Layer<RunStore, SqliteStoreError, SqlClient.SqlClient> =>
  layerSqliteStore({ ...options, source: options.source ?? "durable-object" })
