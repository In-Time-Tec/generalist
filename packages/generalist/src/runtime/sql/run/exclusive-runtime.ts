import { Effect, Layer } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { ExternalChildStore, type Service as ExternalChildStoreService } from "../../child/external/store.js"
import { ExecutableResolver, type Service as ExecutableResolverService } from "../../executable/resolver.js"
import { layer as activeExecutionsLayer } from "../../execution/active-executions.js"
import { LocalScheduler } from "../../execution/local-scheduler.js"
import { layer as localSchedulerLayer, make as makeLocalScheduler } from "../../execution/local-scheduler-internal.js"
import { layer as modelPreviewLayer } from "../../execution/model-response/preview-internal.js"
import { layerRegisteredAgents as runExecutorLayer, RunExecutor } from "../../execution/run-executor.js"
import { layerRegisteredAgents as runtimeLayer } from "../../memory/layer/service.js"
import { RunStore, type Service as RunStoreService } from "../../run/store.js"
import { Runtime } from "../../service.js"
import { make as makeRegisteredAgents } from "../../executable/registered-agent.js"
import { layerSqliteStore, type SqliteStoreError, type SqliteStoreOptions } from "../store.js"
import { layer as triggerSchedulerLayer } from "../../execution/trigger/scheduler.js"

/** Services constructed by an exclusive SQLite Runtime host. */
export type SqliteRuntimeServices = Runtime | RunStore | ExternalChildStore | RunExecutor | LocalScheduler

/** Storage authority supplied to executable reconstruction inside this exact Runtime build. */
export interface SqliteRuntimeResolverInput {
  readonly sql: SqlClient.SqlClient
  readonly ownerId: string
  readonly runStore: RunStoreService
  readonly externalChildStore: ExternalChildStoreService
}
export interface SqliteRuntimeOptions {
  readonly options: SqliteStoreOptions
  readonly workerId: string
  readonly schedulerMode?: "poll" | "external"
  readonly makeExecutableResolver: (input: SqliteRuntimeResolverInput) => ExecutableResolverService
  readonly decorateRunExecutor?: (executor: typeof RunExecutor.Service) => typeof RunExecutor.Service
}

/** Assemble one exclusive SQLite host around Runtime's lifecycle kernel. */
export const layerSqliteRuntime = (
  input: SqliteRuntimeOptions,
): Layer.Layer<SqliteRuntimeServices, SqliteStoreError, SqlClient.SqlClient> =>
  // Registrations belong to one built Runtime, so the map is created per build rather than per Layer value.
  Layer.suspend(() => {
    const store = layerSqliteStore(input.options)
    const agents = makeRegisteredAgents()
    const resolver = Layer.effect(
      ExecutableResolver,
      Effect.gen(function* () {
        return input.makeExecutableResolver({
          sql: yield* SqlClient.SqlClient,
          ownerId: input.workerId,
          runStore: yield* RunStore,
          externalChildStore: yield* ExternalChildStore,
        })
      }),
    ).pipe(Layer.provide(store))
    const dependencies = Layer.mergeAll(store, activeExecutionsLayer, modelPreviewLayer)
    const runtime = runtimeLayer(agents)(input.options).pipe(Layer.provide(dependencies), Layer.provide(resolver))
    const executor = runExecutorLayer(agents).pipe(
      Layer.provide(Layer.merge(dependencies, runtime)),
      Layer.provide(resolver),
    )
    const host =
      input.decorateRunExecutor === undefined
        ? executor
        : Layer.effect(RunExecutor, Effect.map(RunExecutor, input.decorateRunExecutor)).pipe(Layer.provide(executor))
    const scheduler = (
      input.schedulerMode === "external"
        ? Layer.effect(LocalScheduler, makeLocalScheduler({ workerId: input.workerId, ...input.options.scheduler }))
        : localSchedulerLayer({ workerId: input.workerId, ...input.options.scheduler })
    ).pipe(Layer.provide(Layer.merge(dependencies, host)))
    const triggers = triggerSchedulerLayer(input.options.scheduler).pipe(Layer.provide(Layer.merge(runtime, store)))
    return Layer.mergeAll(runtime, host, store, scheduler, triggers)
  })
