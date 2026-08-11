import { Context, Effect, Layer, Redacted } from "effect"
import type { SqlError } from "effect/unstable/sql/SqlError"
import { PgClient } from "@effect/sql-pg"
import { makeRuntime } from "../../memory/runtime-layer.js"
import { Runtime } from "../../runtime.js"
import { RunStore } from "../../run-store.js"
import { RunClaims } from "../run-claims.js"
import { makePostgresServices } from "./store.js"
import { ExecutionHost, make as makeExecutionHost } from "../../execution-host.js"
import { layer as activeExecutionsLayer } from "../../active-executions.js"
import type { LayerOptions } from "../../runtime.js"
import { layer as modelPreviewLayer } from "../../model-preview.js"
import {
  SchemaMigrationFailed,
  type SchemaChecksumMismatch,
  type SchemaDirty,
  type SchemaUpgradeRequired,
  type SchemaVersionUnsupported,
} from "../errors.js"

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
