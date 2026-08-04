import { Context, Effect, Layer, Redacted } from "effect"
import type { SqlError } from "effect/unstable/sql/SqlError"
import { PgClient } from "@effect/sql-pg"
import { makeRuntime } from "../../memory/runtime-layer.js"
import { Runtime } from "../../runtime.js"
import { RunStore } from "../../run-store.js"
import { RunClaims } from "../run-claims.js"
import { makePostgresServices, type PostgresStoreError, type PostgresStoreOptions } from "./store.js"
import { AgentHost, make as makeAgentHost } from "../../agent-host.js"
import { layer as activeExecutionsLayer } from "../../active-executions.js"

export type { PostgresStoreOptions }

export const layerPostgres = (
  options: PostgresStoreOptions,
): Layer.Layer<Runtime | RunStore | RunClaims | AgentHost, PostgresStoreError | SqlError> => {
  const client = PgClient.layer({ url: Redacted.make(options.url) })
  const services = Layer.effectContext(
    makePostgresServices(options).pipe(
      Effect.map(({ store, claims }) => Context.make(RunStore, store).pipe(Context.add(RunClaims, claims))),
    ),
  ).pipe(Layer.provide(client))
  const dependencies = Layer.merge(services, activeExecutionsLayer)
  const runtime = Layer.effect(Runtime, makeRuntime(options)).pipe(Layer.provide(dependencies))
  const host = Layer.effect(AgentHost, makeAgentHost({ workerId: "postgres", agents: options.agents })).pipe(
    Layer.provide(dependencies),
  )
  return Layer.mergeAll(runtime, host, services)
}
