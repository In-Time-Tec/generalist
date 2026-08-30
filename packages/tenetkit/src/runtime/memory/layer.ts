import { Layer } from "effect"
import { ExternalChildStore } from "../child/external/store.js"
import { layer as activeExecutionsLayer } from "../execution/active-executions.js"
import { RunExecutor } from "../execution/run-executor.js"
import { make as makeRunExecutor } from "../execution/run-executor-internal.js"
import { LocalScheduler } from "../execution/local-scheduler.js"
import { layer as localSchedulerLayer } from "../execution/local-scheduler-internal.js"
import { layer as modelPreviewLayer } from "../execution/model-response/preview-internal.js"
import { RunStore } from "../run/store.js"
import { Runtime, type LayerOptions } from "../service.js"
import { layer as runtimeLayer } from "./layer/service.js"
import { layerMemory as storeLayer } from "./store.js"

export { serviceEffect as makeRuntime } from "./layer/service.js"

export const layer = (
  options: LayerOptions,
): Layer.Layer<Runtime | RunStore | ExternalChildStore | RunExecutor | LocalScheduler> => {
  const store = storeLayer(options)
  const active = activeExecutionsLayer
  const dependencies = Layer.mergeAll(store, active, modelPreviewLayer)
  const runtime = runtimeLayer(options).pipe(Layer.provide(dependencies))
  const host = Layer.effect(RunExecutor, makeRunExecutor({ workerId: "memory", resolver: options.resolver })).pipe(
    Layer.provide(dependencies),
  )
  const scheduler = localSchedulerLayer({ workerId: "memory", ...options.scheduler }).pipe(
    Layer.provide(Layer.mergeAll(store, active, host)),
  )
  return Layer.mergeAll(runtime, host, store, scheduler)
}

export const layerMemory = layer
