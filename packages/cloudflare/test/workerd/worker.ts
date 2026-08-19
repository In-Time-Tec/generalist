import { Effect, Layer } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { RuntimeUnavailable } from "tenetkit/runtime/driver/errors"
import { RunStore } from "tenetkit/runtime/driver/run-store"
import {
  layerRunStore,
  layerSqlClient,
  makeProjection,
  schema as activationSchema,
  type DurableObjectStorage,
} from "@tenetkit/cloudflare/durable-objects"
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

  alarm(): Promise<void> {
    return Promise.resolve()
  }

  fetch(): Promise<Response> {
    const storage = this.state.storage
    const sqlLayer = layerSqlClient(storage)
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
          yield* activationSchema
          const committedAlarm = 4_000_000_000_000
          const rolledBackAlarm = 3_000_000_000_000
          const rearm = (at: number) =>
            Effect.tryPromise({
              try: () => storage.setAlarm(at),
              catch: (cause) => RuntimeUnavailable.make({ message: `alarm failed: ${String(cause)}` }),
            })
          const insertRun = (runId: string) => sql`
            INSERT INTO baton_runs (
              run_id, status, address, session_id, message_id, message_json, message_digest, idempotency_key,
              executable_ref_json, executable_manifest_json, root_run_id, depth, max_depth, max_subagents,
              attempt, attempt_fence, last_sequence, cancellation_requested, accepted_sequence,
              responded_wait_ids_json, created_at, updated_at
            ) VALUES (
              ${runId}, 'running', 'agent:test', 'session', ${runId}, '{}', 'digest', ${runId},
              '{}', '{}', ${runId}, 0, 4, 4,
              1, 1, -1, 0, 1,
              '[]', '2026-08-19T00:00:00.000Z', '2026-08-19T00:00:00.000Z'
            )
          `
          yield* sql.withTransaction(
            Effect.gen(function* () {
              yield* sql`DELETE FROM tenetkit_activations WHERE run_id = 'workerd-committed'`
              yield* sql`DELETE FROM baton_runs WHERE run_id = 'workerd-committed'`
              yield* insertRun("workerd-committed")
              yield* makeProjection(sql, rearm(committedAlarm)).applyInTransaction([
                { runId: "workerd-committed", intent: "execute", attemptFence: 1, runStatus: "running" },
              ])
            }),
          )
          yield* Effect.exit(
            sql.withTransaction(
              Effect.gen(function* () {
                yield* sql`DELETE FROM baton_runs WHERE run_id = 'workerd-rolled-back'`
                yield* insertRun("workerd-rolled-back")
                yield* makeProjection(sql, rearm(rolledBackAlarm)).applyInTransaction([
                  { runId: "workerd-rolled-back", intent: "execute", attemptFence: 1, runStatus: "running" },
                ])
                return yield* RuntimeUnavailable.make({ message: "force rollback" })
              }),
            ),
          )
          const tables = yield* sql<{ readonly name: string }>`
            SELECT name FROM sqlite_schema
            WHERE type = 'table' AND substr(name, 1, 6) = 'baton_'
            ORDER BY name
          `
          const probe = yield* sql<{ readonly requests: number }>`SELECT requests FROM workerd_probe WHERE id = 1`
          const committed = yield* sql<{ readonly count: number }>`
            SELECT COUNT(*) AS count FROM baton_runs r JOIN tenetkit_activations a ON a.run_id = r.run_id
            WHERE r.run_id = 'workerd-committed'
          `
          const rolledBack = yield* sql<{ readonly count: number }>`
            SELECT COUNT(*) AS count FROM baton_runs r LEFT JOIN tenetkit_activations a ON a.run_id = r.run_id
            WHERE r.run_id = 'workerd-rolled-back' OR a.run_id = 'workerd-rolled-back'
          `
          const schemaMeta = yield* sql<{
            readonly version: number
          }>`SELECT version FROM baton_schema_meta WHERE id = 1`
          const migrations = yield* sql<{ readonly id: number; readonly name: string }>`
            SELECT migration_id AS id, name FROM baton_sql_migrations ORDER BY migration_id
          `
          const info = yield* store.info
          return Response.json({
            backend: info.backend,
            probe: Number(probe[0]?.requests ?? 0),
            tables: tables.map((row) => row.name),
            committed: Number(committed[0]?.count ?? 0),
            rolledBack: Number(rolledBack[0]?.count ?? 0),
            alarm: yield* Effect.promise(() => storage.getAlarm()),
            schemaVersion: Number(schemaMeta[0]?.version ?? 0),
            migrations,
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
