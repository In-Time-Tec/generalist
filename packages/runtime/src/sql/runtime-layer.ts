import { Layer } from "effect"
import { makeRuntime } from "../memory/runtime-layer.js"
import { Runtime } from "../runtime.js"
import { RunStore } from "../run-store.js"
import { layer as sqliteClientLayer } from "./bun-client.js"
import type { SqliteStoreError, SqliteStoreOptions } from "./store.js"
import { makeSqliteRunStore } from "./store.js"
import { ExecutionHost, make as makeExecutionHost } from "../execution-host.js"
import { layer as activeExecutionsLayer } from "../active-executions.js"
import { LocalScheduler, layer as localSchedulerLayer } from "../local-scheduler.js"
import { layer as modelPreviewLayer } from "../model-preview.js"

export type { SqliteStoreOptions }

export const layerSqlite = (
  options: SqliteStoreOptions,
): Layer.Layer<Runtime | RunStore | ExecutionHost | LocalScheduler, SqliteStoreError> => {
  const client = sqliteClientLayer({ filename: options.filename })
  const store = Layer.effect(RunStore, makeSqliteRunStore(options)).pipe(Layer.provide(client))
  const dependencies = Layer.mergeAll(store, activeExecutionsLayer, modelPreviewLayer)
  const runtime = Layer.effect(Runtime, makeRuntime(options)).pipe(Layer.provide(dependencies))
  const host = Layer.effect(ExecutionHost, makeExecutionHost({ workerId: "sqlite", resolver: options.resolver })).pipe(
    Layer.provide(dependencies),
  )
  const scheduler = localSchedulerLayer({ workerId: "sqlite", ...options.scheduler }).pipe(
    Layer.provide(Layer.merge(dependencies, host)),
  )
  return Layer.mergeAll(runtime, host, store, scheduler)
}
