import { Layer } from "effect"
import { makeRuntime } from "../memory/runtime-layer.js"
import { Runtime } from "../runtime.js"
import { RunStore } from "../run-store.js"
import { layer as sqliteClientLayer } from "./bun-client.js"
import type { SqliteStoreError, SqliteStoreOptions } from "./store.js"
import { makeSqliteRunStore } from "./store.js"
import { AgentHost, make as makeAgentHost } from "../agent-host.js"
import { layer as activeExecutionsLayer } from "../active-executions.js"

export type { SqliteStoreOptions }

export const layerSqlite = (
  options: SqliteStoreOptions,
): Layer.Layer<Runtime | RunStore | AgentHost, SqliteStoreError> => {
  const client = sqliteClientLayer({ filename: options.filename })
  const store = Layer.effect(RunStore, makeSqliteRunStore(options)).pipe(Layer.provide(client))
  const dependencies = Layer.merge(store, activeExecutionsLayer)
  const runtime = Layer.effect(Runtime, makeRuntime(options)).pipe(Layer.provide(dependencies))
  const host = Layer.effect(AgentHost, makeAgentHost({ workerId: "sqlite", resolver: options.resolver })).pipe(
    Layer.provide(dependencies),
  )
  return Layer.mergeAll(runtime, host, store)
}
