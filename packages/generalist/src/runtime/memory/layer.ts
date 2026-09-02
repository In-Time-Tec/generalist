import { Layer } from "effect"
import { ExternalChildStore } from "../child/external/store.js"
import { ExecutableResolver } from "../executable/resolver.js"
import { layer as activeExecutionsLayer } from "../execution/active-executions.js"
import { RunExecutor } from "../execution/run-executor.js"
import { makeWith as makeRunExecutor } from "../execution/run-executor-internal.js"
import { LocalScheduler } from "../execution/local-scheduler.js"
import { layer as localSchedulerLayer } from "../execution/local-scheduler-internal.js"
import { layer as modelPreviewLayer } from "../execution/model-response/preview-internal.js"
import { RunStore } from "../run/store.js"
import { Runtime, type LayerOptions } from "../service.js"
import { make as makeRegisteredAgents } from "../executable/registered-agent.js"
import { layer as runtimeLayer } from "./layer/service.js"
import { layerMemory as storeLayer } from "./store.js"

export { makeRuntime } from "./layer/service.js"

export const layerMemory = (
  options: LayerOptions,
): Layer.Layer<Runtime | RunStore | ExternalChildStore | RunExecutor | LocalScheduler, never, ExecutableResolver> => {
  const store = storeLayer(options)
  const active = activeExecutionsLayer
  const agents = makeRegisteredAgents()
  const dependencies = Layer.mergeAll(store, active, modelPreviewLayer)
  const runtime = runtimeLayer(options, agents).pipe(Layer.provide(dependencies))
  const host = Layer.effect(RunExecutor, makeRunExecutor(agents)).pipe(Layer.provide(dependencies))
  const scheduler = localSchedulerLayer({ workerId: "memory", ...options.scheduler }).pipe(
    Layer.provide(Layer.mergeAll(store, active, host)),
  )
  return Layer.mergeAll(runtime, host, store, scheduler)
}
