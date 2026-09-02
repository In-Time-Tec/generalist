import { Layer } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { ExternalChildStore } from "../../child/external/store.js"
import { ExecutableResolver } from "../../executable/resolver.js"
import { layer as activeExecutionsLayer } from "../../execution/active-executions.js"
import { LocalScheduler } from "../../execution/local-scheduler.js"
import { layer as localSchedulerLayer, make as makeLocalScheduler } from "../../execution/local-scheduler-internal.js"
import { layer as modelPreviewLayer } from "../../execution/model-response/preview-internal.js"
import { layerRegisteredAgents as runExecutorLayer, RunExecutor } from "../../execution/run-executor.js"
import { layerRegisteredAgents as runtimeLayer } from "../../memory/layer/service.js"
import { RunStore } from "../../run/store.js"
import { Runtime } from "../../service.js"
import { make as makeRegisteredAgents } from "../../executable/registered-agent.js"
import { layerSqliteStore, type SqliteStoreError, type SqliteStoreOptions } from "../store.js"

/** Services constructed by an exclusive SQLite Runtime host. */
export type SqliteRuntimeServices = Runtime | RunStore | ExternalChildStore | RunExecutor | LocalScheduler
export interface SqliteRuntimeOptions {
  readonly options: SqliteStoreOptions
  readonly workerId: string
  readonly schedulerMode?: "poll" | "external"
}

/** Assemble one exclusive SQLite host around Runtime's lifecycle kernel. */
export const layerSqliteRuntime = (
  input: SqliteRuntimeOptions,
): Layer.Layer<SqliteRuntimeServices, SqliteStoreError, SqlClient.SqlClient | ExecutableResolver> => {
  const store = layerSqliteStore(input.options)
  const agents = makeRegisteredAgents()
  const dependencies = Layer.mergeAll(store, activeExecutionsLayer, modelPreviewLayer)
  const runtime = runtimeLayer(agents)(input.options).pipe(Layer.provide(dependencies))
  const host = runExecutorLayer(agents).pipe(Layer.provide(dependencies))
  const scheduler = (
    input.schedulerMode === "external"
      ? Layer.effect(LocalScheduler, makeLocalScheduler({ workerId: input.workerId, ...input.options.scheduler }))
      : localSchedulerLayer({ workerId: input.workerId, ...input.options.scheduler })
  ).pipe(Layer.provide(Layer.merge(dependencies, host)))
  return Layer.mergeAll(runtime, host, store, scheduler)
}
