import { Effect, Layer } from "effect"
import type { ExecutionHost } from "./execution-host.js"
import type { RunStore } from "./run-store.js"
import type { ExternalChildStore } from "./external-child-store.js"
import type { Runtime } from "./runtime.js"
import type { LocalScheduler } from "./local-scheduler.js"
import type { SqliteStoreError, SqliteStoreOptions } from "./sql/store.js"
import type { BunSqliteStoreOptions } from "./sql/runtime-layer.js"
import type { SqlClient } from "effect/unstable/sql"

export type { BunSqliteStoreOptions, SqliteStoreOptions }

export const layerSqlite = (
  options: BunSqliteStoreOptions,
): Layer.Layer<Runtime | RunStore | ExternalChildStore | ExecutionHost | LocalScheduler, SqliteStoreError> =>
  Layer.unwrap(
    Effect.promise(() => import("./sql/runtime-layer.js")).pipe(Effect.map((module) => module.layerSqlite(options))),
  )

export const layerSqliteStore = (
  options: SqliteStoreOptions,
): Layer.Layer<RunStore | ExternalChildStore, SqliteStoreError, SqlClient.SqlClient> =>
  Layer.unwrap(
    Effect.promise(() => import("./sql/store.js")).pipe(Effect.map((module) => module.layerSqliteStore(options))),
  )
