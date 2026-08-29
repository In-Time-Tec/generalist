import { Layer } from "effect"
import { layer } from "@effect/sql-sqlite-bun/SqliteClient"
import { layer as runtimeLayer } from "../memory/layer/service.js"
import { Runtime } from "../service.js"
import { RunStore } from "../run/store.js"
import { layerSqliteStore, type SqliteStoreError, type SqliteStoreOptions } from "./store.js"
import { ExecutionHost, make as makeExecutionHost } from "../execution/host.js"
import { layer as activeExecutionsLayer } from "../execution/active-executions.js"
import { LocalScheduler, layer as localSchedulerLayer } from "../execution/local-scheduler.js"
import { layer as modelPreviewLayer } from "../execution/model-response/preview.js"
import { ExternalChildStore } from "../child/external/store.js"

export interface BunSqliteStoreOptions extends SqliteStoreOptions {
  readonly filename: string
}

export const layerSqlite = (
  options: BunSqliteStoreOptions,
): Layer.Layer<Runtime | RunStore | ExternalChildStore | ExecutionHost | LocalScheduler, SqliteStoreError> => {
  const client = layer({ filename: options.filename })
  const store = layerSqliteStore({ ...options, source: options.source ?? options.filename }).pipe(Layer.provide(client))
  const dependencies = Layer.mergeAll(store, activeExecutionsLayer, modelPreviewLayer)
  const runtime = runtimeLayer(options).pipe(Layer.provide(dependencies))
  const host = Layer.effect(ExecutionHost, makeExecutionHost({ workerId: "sqlite", resolver: options.resolver })).pipe(
    Layer.provide(dependencies),
  )
  const scheduler = localSchedulerLayer({ workerId: "sqlite", ...options.scheduler }).pipe(
    Layer.provide(Layer.merge(dependencies, host)),
  )
  return Layer.mergeAll(runtime, host, store, scheduler)
}
