import { Config, Context, Effect, Layer, Redacted } from "effect"
import type { SqlError } from "effect/unstable/sql/SqlError"
import { MysqlClient } from "@effect/sql-mysql2"
import { ExecutionHost, make as makeExecutionHost } from "../../execution-host.js"
import { layer as activeExecutionsLayer } from "../../active-executions.js"
import { makeRuntime } from "../../memory/runtime-layer.js"
import { Runtime } from "../../runtime.js"
import { RunStore } from "../../run-store.js"
import { RunClaims } from "../run-claims.js"
import { makeMysqlServices, type MysqlStoreError, type MysqlStoreOptions } from "./store.js"

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
  const dependencies = Layer.merge(services, activeExecutionsLayer)
  const runtime = Layer.effect(Runtime, makeRuntime(options)).pipe(Layer.provide(dependencies))
  const host = Layer.effect(ExecutionHost, makeExecutionHost({ workerId: "mysql", resolver: options.resolver })).pipe(
    Layer.provide(dependencies),
  )
  return Layer.mergeAll(runtime, host, services)
}
