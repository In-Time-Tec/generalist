import { Config, Context, Effect, Layer, Redacted } from "effect"
import type { SqlError } from "effect/unstable/sql/SqlError"
import { MysqlClient } from "@effect/sql-mysql2"
import { ExecutionHost, make as makeExecutionHost } from "tenetkit/runtime/driver/execution-host"
import { layer as activeExecutionsLayer } from "tenetkit/runtime/driver/active-executions"
import { makeRuntime } from "tenetkit/runtime/driver/memory/runtime-layer"
import { Runtime } from "tenetkit/runtime/driver/runtime"
import { RunStore } from "tenetkit/runtime/driver/run-store"
import { RunClaims } from "tenetkit/runtime/driver/sql/run-claims"
import { makeMysqlServices, type MysqlStoreError, type MysqlStoreOptions } from "./store.js"
import { layer as modelPreviewLayer } from "tenetkit/runtime/driver/model-preview"

export type { MysqlStoreOptions }

export const layerMysql = (
  options: MysqlStoreOptions,
): Layer.Layer<Runtime | RunStore | RunClaims | ExecutionHost, MysqlStoreError | SqlError | Config.ConfigError> => {
  const maxConnections = options.maxConnections ?? 10
  const client = MysqlClient.layer({
    url: Redacted.make(options.url),
    maxConnections,
  })
  const services = Layer.effectContext(
    makeMysqlServices({ ...options, maxConnections }).pipe(
      Effect.map(({ store, claims }) => Context.make(RunStore, store).pipe(Context.add(RunClaims, claims))),
    ),
  ).pipe(Layer.provide(client))
  const dependencies = Layer.mergeAll(services, activeExecutionsLayer, modelPreviewLayer)
  const runtime = Layer.effect(Runtime, makeRuntime(options)).pipe(Layer.provide(dependencies))
  const host = Layer.effect(ExecutionHost, makeExecutionHost({ workerId: "mysql", resolver: options.resolver })).pipe(
    Layer.provide(dependencies),
  )
  return Layer.mergeAll(runtime, host, services)
}
