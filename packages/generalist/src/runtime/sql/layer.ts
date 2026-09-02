import { Layer } from "effect"
import { layer } from "@effect/sql-sqlite-bun/SqliteClient"
import { layerRegisteredAgents as runtimeLayer } from "../memory/layer/service.js"
import { Runtime } from "../service.js"
import { RunStore } from "../run/store.js"
import { layerSqliteStore, type SqliteStoreError, type SqliteStoreOptions } from "./store.js"
import { layerRegisteredAgents as runExecutorLayer, RunExecutor } from "../execution/run-executor.js"
import { layer as activeExecutionsLayer } from "../execution/active-executions.js"
import { LocalScheduler } from "../execution/local-scheduler.js"
import { layer as localSchedulerLayer } from "../execution/local-scheduler-internal.js"
import { layer as modelPreviewLayer } from "../execution/model-response/preview-internal.js"
import { ExternalChildStore } from "../child/external/store.js"
import { ExecutableResolver } from "../executable/resolver.js"
import { make as makeRegisteredAgents } from "../executable/registered-agent.js"

export interface BunSqliteStoreOptions extends SqliteStoreOptions {
  readonly filename: string
}

export const layerSqlite = (
  options: BunSqliteStoreOptions,
): Layer.Layer<
  Runtime | RunStore | ExternalChildStore | RunExecutor | LocalScheduler,
  SqliteStoreError,
  ExecutableResolver
> =>
  // Registrations belong to one built Runtime, so the map is created per build rather than per Layer value.
  Layer.suspend(() => {
    const client = layer({ filename: options.filename })
    const store = layerSqliteStore({ ...options, source: options.source ?? options.filename }).pipe(
      Layer.provide(client),
    )
    const agents = makeRegisteredAgents()
    const dependencies = Layer.mergeAll(store, activeExecutionsLayer, modelPreviewLayer)
    const runtime = runtimeLayer(agents)(options).pipe(Layer.provide(dependencies))
    const host = runExecutorLayer(agents).pipe(Layer.provide(dependencies))
    const scheduler = localSchedulerLayer({ workerId: "sqlite", ...options.scheduler }).pipe(
      Layer.provide(Layer.merge(dependencies, host)),
    )
    return Layer.mergeAll(runtime, host, store, scheduler)
  })
