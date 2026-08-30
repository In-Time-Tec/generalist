import { Effect, Layer } from "effect"
import { PgClient } from "@effect/sql-pg"
import { SqlClient } from "effect/unstable/sql"
import type { SqlError } from "effect/unstable/sql/SqlError"
import {
  SchemaMigrationFailed,
  layerSqlRuntime,
  type SqlDriverStoreError,
  type SqlRuntimeServices,
  type SqlStoreOptions,
} from "tenetkit/runtime/sql-driver"
import { layerClient } from "./client.js"
import { postgresDriver } from "./store/index.js"

/** @experimental PostgreSQL Runtime options independent of client acquisition. */
export interface Options extends SqlStoreOptions {
  readonly source?: string
}

/** @experimental PostgreSQL Runtime options for the URL-backed convenience Layer. */
export interface UrlOptions extends Options {
  readonly url: string
  readonly maxConnections?: number
}

/** @experimental PostgreSQL Runtime construction failures. */
export type StoreError = SqlDriverStoreError

/**
 * @experimental Build the PostgreSQL Runtime from the caller's `PgClient`.
 *
 * Host transactions must use the `SqlClient` exposed by the same client Layer. Runtime operations
 * then nest through that exact transaction service and therefore use PostgreSQL savepoints.
 */
const layerWithClient = (options: Options): Layer.Layer<SqlRuntimeServices, StoreError | SqlError, PgClient.PgClient> =>
  Layer.unwrap(
    PgClient.PgClient.pipe(
      Effect.map((pg) =>
        layerSqlRuntime({ options, workerId: "postgres", driver: postgresDriver({ options, pg }) }).pipe(
          Layer.provide(Layer.succeed(SqlClient.SqlClient, pg)),
        ),
      ),
    ),
  )

/** @experimental Build the PostgreSQL Runtime, optionally acquiring its client from a URL. */
export function layer(options: UrlOptions): Layer.Layer<SqlRuntimeServices, StoreError | SqlError>
export function layer(options: Options): Layer.Layer<SqlRuntimeServices, StoreError | SqlError, PgClient.PgClient>
export function layer(
  options: Options | UrlOptions,
): Layer.Layer<SqlRuntimeServices, StoreError | SqlError, PgClient.PgClient> {
  if (!("url" in options)) return layerWithClient(options)
  const maxConnections = options.maxConnections ?? 10
  const client = Layer.unwrap(
    Effect.gen(function* () {
      if (!Number.isSafeInteger(maxConnections) || maxConnections < 1) {
        return yield* SchemaMigrationFailed.make({
          source: options.source ?? "postgres",
          message: "PostgreSQL maxConnections must be a positive integer",
        })
      }
      return layerClient({ url: options.url, maxConnections })
    }),
  )
  return layerWithClient(options).pipe(Layer.provide(client))
}
