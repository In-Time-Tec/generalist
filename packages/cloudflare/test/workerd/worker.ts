import { Effect, Layer } from "effect"
import { Prompt } from "effect/unstable/ai"
import { SqlClient } from "effect/unstable/sql"
import { makeTest } from "tenetkit/runtime/driver/executable-manifest"
import { make as makeMessage } from "tenetkit/runtime/driver/message"
import { Address } from "tenetkit/runtime/driver/address"
import type { Interface as RuntimeInterface } from "tenetkit/runtime/driver/runtime"
import type { RunEvent } from "tenetkit/runtime/driver/run-event"
import { AgentExecutionFailure, RuntimeUnavailable } from "tenetkit/runtime/driver/errors"
import { RunStore } from "tenetkit/runtime/driver/run-store"
import {
  layerRunStore,
  layerSqlClient,
  makeHibernatingWebSocket,
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
  readonly REPLAY_OBJECTS: ObjectNamespace
}

interface DurableObjectState {
  readonly storage: DurableObjectStorage
  readonly acceptWebSocket: (
    socket: import("@tenetkit/cloudflare/durable-objects").HibernatingWebSocket,
    tags?: ReadonlyArray<string>,
  ) => void
  readonly getWebSockets: (
    tag?: string,
  ) => ReadonlyArray<import("@tenetkit/cloudflare/durable-objects").HibernatingWebSocket>
}

const replayExecutable = makeTest("workerd-replay", "1")
const replayEvents = [0, 1].map(
  (sequence) =>
    ({
      _tag: "RunAttemptStarted",
      specVersion: "1",
      eventId: `replay-run:${sequence}`,
      runId: "replay-run",
      sequence,
      executableRef: replayExecutable.ref,
      rootRunId: "replay-run",
      depth: 0,
      occurredAt: "2026-08-19T00:00:00.000Z",
      attempt: 1,
    }) as RunEvent,
)
const replayRuntime = {
  history: ({ cursor }: { readonly cursor?: number }) =>
    Effect.succeed(replayEvents.filter((event) => event.sequence > (cursor ?? -1))),
  resolveModelResponse: () => Effect.die("model response not used"),
  cancel: () => Effect.void,
} as unknown as RuntimeInterface

interface SocketPair {
  readonly 0: WebSocket
  readonly 1: import("@tenetkit/cloudflare/durable-objects").HibernatingWebSocket
}

export class ReplayObject {
  private readonly replay: ReturnType<typeof makeHibernatingWebSocket>

  constructor(state: DurableObjectState) {
    this.replay = makeHibernatingWebSocket({ state, runtime: replayRuntime, pageSize: 1, fuel: 1 })
  }

  fetch(request: Request): Promise<Response> {
    if (new URL(request.url).pathname.endsWith("/flush")) {
      return this.replay.flush("replay-run").then((result) => Response.json(result))
    }
    const Pair = (globalThis as unknown as { readonly WebSocketPair: new () => SocketPair }).WebSocketPair
    const pair = new Pair()
    this.replay.accept(pair[1])
    return Promise.resolve(new Response(null, { status: 101, webSocket: pair[0] } as ResponseInit))
  }

  webSocketMessage(
    socket: import("@tenetkit/cloudflare/durable-objects").HibernatingWebSocket,
    message: string | ArrayBuffer,
  ): Promise<void> {
    return this.replay.webSocketMessage(socket, message)
  }

  webSocketClose(socket: import("@tenetkit/cloudflare/durable-objects").HibernatingWebSocket): void {
    this.replay.webSocketClose(socket)
  }

  webSocketError(socket: import("@tenetkit/cloudflare/durable-objects").HibernatingWebSocket): void {
    this.replay.webSocketError(socket)
  }
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
          const probeCount = yield* sql<{ readonly requests: number }>`SELECT requests FROM workerd_probe WHERE id = 1`
          const cancellationRunId = `workerd-cancellation-${Number(probeCount[0]?.requests ?? 0)}`
          const cancellationExecutable = makeTest("workerd-cancellation", "1")
          const cancellationMessage = makeMessage({
            id: cancellationRunId,
            to: Address.make("agent:test"),
            sessionId: "session",
            prompt: Prompt.make("cancel"),
            idempotencyKey: cancellationRunId,
            correlationId: cancellationRunId,
          })
          yield* activationSchema
          const committedAlarm = 4_000_000_000_000
          const rolledBackAlarm = 3_000_000_000_000
          const rearm = (at: number) =>
            Effect.tryPromise({
              try: () => storage.setAlarm(at),
              catch: (cause) => RuntimeUnavailable.make({ message: `alarm failed: ${String(cause)}` }),
            })
          const insertRun = (runId: string) => sql`
            INSERT INTO tenetkit_runs (
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
              yield* sql`DELETE FROM tenetkit_runs WHERE run_id = 'workerd-committed'`
              yield* insertRun("workerd-committed")
              yield* makeProjection(sql, rearm(committedAlarm)).applyInTransaction([
                { runId: "workerd-committed", intent: "execute", attemptFence: 1, runStatus: "running" },
              ])
            }),
          )
          yield* Effect.exit(
            sql.withTransaction(
              Effect.gen(function* () {
                yield* sql`DELETE FROM tenetkit_runs WHERE run_id = 'workerd-rolled-back'`
                yield* insertRun("workerd-rolled-back")
                yield* makeProjection(sql, rearm(rolledBackAlarm)).applyInTransaction([
                  { runId: "workerd-rolled-back", intent: "execute", attemptFence: 1, runStatus: "running" },
                ])
                return yield* RuntimeUnavailable.make({ message: "force rollback" })
              }),
            ),
          )
          yield* store.admitStart({
            runId: cancellationRunId,
            message: cancellationMessage,
            executableRef: cancellationExecutable.ref,
            executableManifest: cancellationExecutable.manifest,
            registrations: [],
            treePolicy: { maxDepth: 4, maxSubagents: 4 },
            initialChildren: [],
            initialFanOuts: [],
          })
          const claim = yield* store.claimExecution({ runId: cancellationRunId, ownerId: "workerd" })
          yield* store.cancel({ runId: cancellationRunId, reason: "close" })
          const requested = yield* sql<{ readonly cancellation_requested: unknown; readonly storage_type: string }>`
            SELECT cancellation_requested, typeof(cancellation_requested) AS storage_type
            FROM tenetkit_runs WHERE run_id = ${cancellationRunId}
          `
          yield* store.fail({
            runId: cancellationRunId,
            ownerId: claim.ownerId,
            attemptFence: claim.attemptFence,
            error: AgentExecutionFailure.make({ message: "execution interrupted" }),
          })
          const cancellationTerminal = yield* sql<{ readonly status: string }>`
            SELECT status FROM tenetkit_runs WHERE run_id = ${cancellationRunId}
          `
          const tables = yield* sql<{ readonly name: string }>`
            SELECT name FROM sqlite_schema
            WHERE type = 'table' AND substr(name, 1, 9) = 'tenetkit_'
            ORDER BY name
          `
          const probe = yield* sql<{ readonly requests: number }>`SELECT requests FROM workerd_probe WHERE id = 1`
          const committed = yield* sql<{ readonly count: number }>`
            SELECT COUNT(*) AS count FROM tenetkit_runs r JOIN tenetkit_activations a ON a.run_id = r.run_id
            WHERE r.run_id = 'workerd-committed'
          `
          const rolledBack = yield* sql<{ readonly count: number }>`
            SELECT COUNT(*) AS count FROM tenetkit_runs r LEFT JOIN tenetkit_activations a ON a.run_id = r.run_id
            WHERE r.run_id = 'workerd-rolled-back' OR a.run_id = 'workerd-rolled-back'
          `
          const schemaMeta = yield* sql<{
            readonly version: number
          }>`SELECT version FROM tenetkit_schema_meta WHERE id = 1`
          const migrations = yield* sql<{ readonly id: number; readonly name: string }>`
            SELECT migration_id AS id, name FROM tenetkit_sql_migrations ORDER BY migration_id
          `
          const info = yield* store.info
          return Response.json({
            backend: info.backend,
            probe: Number(probe[0]?.requests ?? 0),
            tables: tables.map((row) => row.name),
            committed: Number(committed[0]?.count ?? 0),
            rolledBack: Number(rolledBack[0]?.count ?? 0),
            cancellationStoredType: requested[0]?.storage_type ?? "missing",
            cancellationStoredValue: Number(requested[0]?.cancellation_requested ?? Number.NaN),
            cancellationTerminalStatus: cancellationTerminal[0]?.status ?? "missing",
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
    const replay = new URL(request.url).pathname.startsWith("/replay")
    const namespace = replay ? bindings.REPLAY_OBJECTS : bindings.SQL_OBJECTS
    const id = namespace.idFromName("default")
    return yield* Effect.promise(() => namespace.get(id).fetch(request))
  }),
)
