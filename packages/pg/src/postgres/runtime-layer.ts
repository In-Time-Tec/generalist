import { Context, Effect, Layer } from "effect"
import { PgClient } from "@effect/sql-pg"
import { SqlClient } from "effect/unstable/sql"
import type { SqlError } from "effect/unstable/sql/SqlError"
import { makeRuntime } from "tenetkit/runtime/driver/memory/layer"
import { Runtime, type LayerOptions } from "tenetkit/runtime/driver/service"
import { RunStore } from "tenetkit/runtime/driver/run/store"
import { RunClaims } from "tenetkit/runtime/driver/sql/run/claims"
import { postgresServices } from "./store/index.js"
import { ExecutionHost, make as makeExecutionHost } from "tenetkit/runtime/driver/execution/host"
import { layer as activeExecutionsLayer } from "tenetkit/runtime/driver/execution/active-executions"
import { layer as modelPreviewLayer } from "tenetkit/runtime/driver/execution/model-response/preview"
import {
  SchemaMigrationFailed,
  type SchemaChecksumMismatch,
  type SchemaDirty,
  type SchemaUpgradeRequired,
  type SchemaVersionUnsupported,
} from "tenetkit/runtime/driver/sql/errors"
import { layerClient } from "./client.js"

/** @experimental PostgreSQL Runtime options independent of client acquisition. */
export interface PostgresOptions extends LayerOptions {
  readonly source?: string
}

/** @experimental PostgreSQL Runtime options for the URL-backed convenience Layer. */
export interface PostgresUrlOptions extends PostgresOptions {
  readonly url: string
  readonly maxConnections?: number
}

/** @experimental PostgreSQL Runtime construction failures. */
export type PostgresStoreError =
  | SchemaDirty
  | SchemaChecksumMismatch
  | SchemaVersionUnsupported
  | SchemaUpgradeRequired
  | SchemaMigrationFailed

type PostgresServices = Runtime | RunStore | RunClaims | ExecutionHost

/**
 * @experimental Build the PostgreSQL Runtime from the caller's `PgClient`.
 *
 * Host transactions must use the `SqlClient` exposed by the same client Layer. Runtime operations
 * then nest through that exact transaction service and therefore use PostgreSQL savepoints.
 */
export const layer = (
  options: PostgresOptions,
): Layer.Layer<PostgresServices, PostgresStoreError | SqlError, PgClient.PgClient> => {
  const client = Layer.effectContext(
    PgClient.PgClient.pipe(
      Effect.map((pg) => Context.make(PgClient.PgClient, pg).pipe(Context.add(SqlClient.SqlClient, pg))),
    ),
  )
  const services = Layer.effectContext(
    postgresServices(options).pipe(
      Effect.map(({ store, claims }) => Context.make(RunStore, store).pipe(Context.add(RunClaims, claims))),
    ),
  ).pipe(Layer.provide(client))
  const dependencies = Layer.mergeAll(services, activeExecutionsLayer, modelPreviewLayer)
  const runtime = Layer.effect(Runtime, makeRuntime(options)).pipe(Layer.provide(dependencies))
  const host = Layer.effect(
    ExecutionHost,
    makeExecutionHost({ workerId: "postgres", resolver: options.resolver }),
  ).pipe(Layer.provide(dependencies))
  return Layer.mergeAll(runtime, host, services)
}

/** @experimental Build the PostgreSQL Runtime and its client from a URL. */
export const layerPostgres = (
  options: PostgresUrlOptions,
): Layer.Layer<PostgresServices, PostgresStoreError | SqlError> => {
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
  return layer(options).pipe(Layer.provide(client))
}
