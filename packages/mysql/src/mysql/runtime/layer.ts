import { Config, Context, Effect, Layer, Redacted } from "effect"
import type { SqlError } from "effect/unstable/sql/SqlError"
import { MysqlClient } from "@effect/sql-mysql2"
import { RunExecutor, make as makeRunExecutor } from "tenetkit/runtime/driver/execution/run-executor"
import { layer as activeExecutionsLayer } from "tenetkit/runtime/driver/execution/active-executions"
import { makeRuntime } from "tenetkit/runtime/driver/memory/layer"
import { Runtime } from "tenetkit/runtime/driver/service"
import { RunStore } from "tenetkit/runtime/driver/run/store"
import { RunClaims } from "tenetkit/runtime/driver/sql/run/claims"
import { mysqlServices, type StoreError, type Options } from "../store/implementation.js"
import { layer as modelPreviewLayer } from "tenetkit/runtime/driver/execution/model-response/preview"

export type { Options }

export const layer = (
  options: Options,
): Layer.Layer<Runtime | RunStore | RunClaims | RunExecutor, StoreError | SqlError | Config.ConfigError> => {
  const maxConnections = options.maxConnections ?? 10
  const client = MysqlClient.layer({
    url: Redacted.make(options.url),
    maxConnections,
  })
  const services = Layer.effectContext(
    mysqlServices({ ...options, maxConnections }).pipe(
      Effect.map(({ store, claims }) => Context.make(RunStore, store).pipe(Context.add(RunClaims, claims))),
    ),
  ).pipe(Layer.provide(client))
  const dependencies = Layer.mergeAll(services, activeExecutionsLayer, modelPreviewLayer)
  const runtime = Layer.effect(Runtime, makeRuntime(options)).pipe(Layer.provide(dependencies))
  const host = Layer.effect(RunExecutor, makeRunExecutor({ workerId: "mysql", resolver: options.resolver })).pipe(
    Layer.provide(dependencies),
  )
  return Layer.mergeAll(runtime, host, services)
}
