import { Context, Effect, Layer, Redacted } from "effect"
import type { SqlError } from "effect/unstable/sql/SqlError"
import { PgClient } from "@effect/sql-pg"
import { makeRuntime } from "tenetkit/runtime/driver/memory/runtime-layer"
import { Runtime } from "tenetkit/runtime/driver/runtime"
import { RunStore } from "tenetkit/runtime/driver/run-store"
import { RunClaims } from "tenetkit/runtime/driver/sql/run-claims"
import { makePostgresServices } from "./store.js"
import { ExecutionHost, make as makeExecutionHost } from "tenetkit/runtime/driver/execution-host"
import { layer as activeExecutionsLayer } from "tenetkit/runtime/driver/active-executions"
import type { LayerOptions } from "tenetkit/runtime/driver/runtime"
import { layer as modelPreviewLayer } from "tenetkit/runtime/driver/model-preview"
import {
  SchemaMigrationFailed,
  type SchemaChecksumMismatch,
  type SchemaDirty,
  type SchemaUpgradeRequired,
  type SchemaVersionUnsupported,
} from "tenetkit/runtime/driver/sql/errors"

export interface PostgresStoreOptions extends LayerOptions {
  readonly url: string
  readonly source?: string
  readonly maxConnections?: number
}
export type PostgresStoreError =
  | SchemaDirty
  | SchemaChecksumMismatch
  | SchemaVersionUnsupported
  | SchemaUpgradeRequired
  | SchemaMigrationFailed

export const layerPostgres = (
  options: PostgresStoreOptions,
): Layer.Layer<Runtime | RunStore | RunClaims | ExecutionHost, PostgresStoreError | SqlError> => {
  const maxConnections = options.maxConnections ?? 10
  const client = Layer.unwrap(
    Effect.gen(function* () {
      if (!Number.isSafeInteger(maxConnections) || maxConnections < 1) {
        return yield* SchemaMigrationFailed.make({
          source: options.source ?? "postgres",
          message: "PostgreSQL maxConnections must be a positive integer",
        })
      }
      return PgClient.layer({ url: Redacted.make(options.url), maxConnections })
    }),
  )
  const services = Layer.effectContext(
    makePostgresServices(options).pipe(
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
