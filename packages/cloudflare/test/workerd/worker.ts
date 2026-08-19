import { Effect, Layer } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { RunStore } from "tenetkit/runtime/driver/run-store"
import { layerRunStore, layerSqlClient, type DurableObjectStorage } from "@tenetkit/cloudflare/durable-objects"
import { WorkerContext, make } from "@tenetkit/cloudflare/workers"

interface ObjectNamespace {
  readonly idFromName: (name: string) => unknown
  readonly get: (id: unknown) => { readonly fetch: (request: Request) => Promise<Response> }
}

interface Env extends Readonly<Record<string, unknown>> {
  readonly SQL_OBJECTS: ObjectNamespace
}

interface DurableObjectState {
  readonly storage: DurableObjectStorage
}

export class SqlObject {
  constructor(private readonly state: DurableObjectState) {}

  fetch(): Promise<Response> {
    const sqlLayer = layerSqlClient(this.state.storage)
    const storeLayer = layerRunStore({
      addresses: [],
      resolver: { resolve: () => Effect.die("resolver must not run during conformance") },
    }).pipe(Layer.provide(sqlLayer))
    const live = Layer.merge(sqlLayer, storeLayer)
    const program = Effect.scoped(
      Effect.flatMap(Layer.build(live), (context) =>
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient
          const store = yield* RunStore
          yield* sql.unsafe(
            "CREATE TABLE IF NOT EXISTS workerd_probe (id INTEGER PRIMARY KEY, requests INTEGER NOT NULL)",
          )
          yield* sql.unsafe("INSERT OR IGNORE INTO workerd_probe (id, requests) VALUES (1, 0)")
          yield* sql.unsafe("UPDATE workerd_probe SET requests = requests + 1 WHERE id = 1")
          const tables = yield* sql<{ readonly name: string }>`
            SELECT name FROM sqlite_schema
            WHERE type = 'table' AND substr(name, 1, 6) = 'baton_'
            ORDER BY name
          `
          const probe = yield* sql<{ readonly requests: number }>`SELECT requests FROM workerd_probe WHERE id = 1`
          const info = yield* store.info
          return Response.json({
            backend: info.backend,
            probe: Number(probe[0]?.requests ?? 0),
            tables: tables.map((row) => row.name),
          })
        }).pipe(Effect.provideContext(context)),
      ),
    )
    return Effect.runPromise(program)
  }
}

export default make<Env, never>((request) =>
  Effect.gen(function* () {
    const context = yield* WorkerContext
    const bindings = context.bindings as Env
    const id = bindings.SQL_OBJECTS.idFromName("default")
    return yield* Effect.promise(() => bindings.SQL_OBJECTS.get(id).fetch(request))
  }),
)
