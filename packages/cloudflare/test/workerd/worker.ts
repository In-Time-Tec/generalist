import { Effect, Exit, Layer, Schema, Stream } from "effect"
import { Prompt } from "effect/unstable/ai"
import { Agent, Approvals, Permissions, Tool, Toolkit } from "tenetkit"
import { decodeConfig as decodeOpenRouterConfig } from "tenetkit/ai/openrouter"
import { TestModel } from "tenetkit/test"
import { SqlClient } from "effect/unstable/sql"
import { test } from "tenetkit/runtime/driver/executable/manifest"
import { make as makeMessage } from "tenetkit/runtime/driver/messaging/message"
import { Address } from "tenetkit/runtime/driver/address"
import type { Interface as RuntimeInterface } from "tenetkit/runtime/driver/service"
import { AgentExecutionFailure, RuntimeUnavailable } from "tenetkit/runtime/driver/errors"
import type { RunEvent } from "tenetkit/runtime/driver/run/event"
import { RunStore } from "tenetkit/runtime/driver/run/store"
import {
  layerRunStore,
  layerSqlClient,
  makeHibernatingWebSocket,
  makeProjection,
  schema as activationSchema,
  type DurableObjectStorage,
} from "@tenetkit/cloudflare/durable-objects"

declare global {
  var WebSocketPair: new () => SocketPair
  interface ResponseInit {
    webSocket?: WebSocket
  }
}

interface ObjectId {
  readonly name: string
}

interface ObjectNamespace {
  readonly idFromName: (name: string) => ObjectId
  readonly get: (id: ObjectId) => { readonly fetch: (request: Request) => Promise<Response> }
}

interface Env {
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

const lookup = Tool.make("lookup", {
  description: "Look up a provider fact",
  parameters: Schema.Struct({ query: Schema.String }),
  success: Schema.String,
})

const purchase = Tool.make("purchase", {
  description: "Make a purchase",
  parameters: Schema.Struct({ item: Schema.String }),
  success: Schema.String,
})

const plannerToolkit = Toolkit.make(lookup, purchase)
const planSchema = Schema.Struct({
  objective: Schema.String,
  facts: Schema.Array(Schema.String),
})
const planner = Agent.make({
  name: "workerd-planner",
  instructions: "Use read-only lookup, then return the structured plan.",
  toolkit: plannerToolkit,
  budget: {
    modelCalls: 3,
    toolCalls: 1,
    totalTokens: 128,
    deadline: "2099-01-01T00:00:00.000Z",
  },
})
const failClosed = Permissions.layerRuleset({
  rules: [{ pattern: "lookup", level: "allow" }],
  fallback: "deny",
})

const decodeProbeRow = Schema.decodeUnknownSync(Schema.Tuple([Schema.Struct({ requests: Schema.Finite })]))
const decodeCountRow = Schema.decodeUnknownSync(Schema.Tuple([Schema.Struct({ count: Schema.Finite })]))
const decodeRequestedRow = Schema.decodeUnknownSync(
  Schema.Tuple([Schema.Struct({ cancellation_requested: Schema.Unknown, storage_type: Schema.String })]),
)
const decodeTerminalRow = Schema.decodeUnknownSync(Schema.Tuple([Schema.Struct({ status: Schema.String })]))
const decodeSchemaRow = Schema.decodeUnknownSync(Schema.Tuple([Schema.Struct({ version: Schema.Finite })]))

const agentConformance = Effect.fn("CloudflareWorkerd.agentConformance")(function* () {
  let lookupExecutions = 0
  let deniedExecutions = 0
  const successFixture = yield* TestModel.make([
    TestModel.toolCall("lookup", { query: "Boise provider" }, { id: "lookup-1" }),
    TestModel.text("I found one provider."),
    TestModel.object({ objective: "Arrange service", facts: ["Provider serves Boise"] }),
  ])
  const successLayer = Layer.mergeAll(
    successFixture.layer,
    plannerToolkit.toLayer({
      lookup: ({ query }) =>
        Effect.sync(() => {
          lookupExecutions += 1
          return `${query}: available`
        }),
      purchase: ({ item }) =>
        Effect.sync(() => {
          deniedExecutions += 1
          return item
        }),
    }),
    failClosed,
    Approvals.layerDenyAll,
  )
  const successServices = yield* Layer.build(successLayer)
  const planned = yield* Agent.generate(planner, {
    prompt: "Find a provider and propose a plan.",
    output: { schema: planSchema },
  }).pipe(Effect.provideContext(successServices))

  const deniedFixture = yield* TestModel.make([
    TestModel.toolCall("purchase", { item: "unapproved service" }, { id: "purchase-1" }),
  ])
  const deniedServices = yield* Layer.build(
    Layer.mergeAll(
      deniedFixture.layer,
      plannerToolkit.toLayer({
        lookup: ({ query }) => Effect.succeed(query),
        purchase: ({ item }) =>
          Effect.sync(() => {
            deniedExecutions += 1
            return item
          }),
      }),
      failClosed,
      Approvals.layerDenyAll,
    ),
  )
  const denied = yield* Agent.generate(planner, { prompt: "Buy the service." }).pipe(
    Effect.provideContext(deniedServices),
    Effect.exit,
  )

  const exhaustedFixture = yield* TestModel.make([TestModel.text("must not execute")])
  const exhaustedServices = yield* Layer.build(exhaustedFixture.layer)
  const exhausted = yield* Agent.generate(Agent.make({ name: "workerd-budget", budget: { modelCalls: 0 } }), {
    prompt: "This model call is outside the budget.",
  }).pipe(Effect.provideContext(exhaustedServices), Effect.exit)
  const exhaustedRequests = yield* exhaustedFixture.requests

  return Response.json({
    objective: planned.value.objective,
    facts: planned.value.facts,
    lookupExecutions,
    denied: Exit.isFailure(denied),
    deniedExecutions,
    budgetExhausted: Exit.isFailure(exhausted),
    budgetModelRequests: exhaustedRequests.length,
    openRouterBundled: Object.keys(decodeOpenRouterConfig({})).length === 0,
  })
})

const replayExecutable = test("workerd-replay", "1")
const replayEvents: ReadonlyArray<RunEvent> = [0, 1].map(
  (sequence): RunEvent => ({
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
  }),
)
const unusedEffect = () => Effect.die("unused Runtime operation")
const unusedStream = () => Stream.die("unused Runtime operation")
const replayRuntime: RuntimeInterface = {
  start: unusedEffect,
  admit: unusedEffect,
  activate: unusedEffect,
  send: unusedEffect,
  spawn: unusedEffect,
  events: unusedStream,
  previews: unusedStream,
  snapshot: unusedEffect,
  history: ({ cursor }) => Effect.succeed(replayEvents.filter((event) => event.sequence > (cursor ?? -1))),
  sessionEntry: unusedEffect,
  resolveModelResponse: unusedEffect,
  treeReplay: unusedEffect,
  treeChanges: unusedStream,
  treeCheckpoint: unusedEffect,
  list: unusedEffect,
  respond: unusedEffect,
  respondApproval: unusedEffect,
  signal: unusedEffect,
  cancel: () => Effect.void,
  cancelSession: unusedEffect,
  awaitSessionTerminal: unusedEffect,
  steer: unusedEffect,
  sendMessage: unusedEffect,
  messages: unusedEffect,
  childSettlements: unusedEffect,
  childSettlementChanges: unusedStream,
  awaitChildSettlement: unusedEffect,
  directory: unusedEffect,
  registerAgentName: unusedEffect,
  resolveOperation: unusedEffect,
  inspect: unusedEffect,
  fanOut: unusedEffect,
  inspectFanOut: unusedEffect,
  awaitFanOut: unusedEffect,
}

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
    const pair = new WebSocketPair()
    this.replay.accept(pair[1])
    return Promise.resolve(new Response(null, { status: 101, webSocket: pair[0] }))
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
          const cancellationRunId = `workerd-cancellation-${probeCount[0]?.requests ?? 0}`
          const cancellationExecutable = test("workerd-cancellation", "1")
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
          const [probeRow] = decodeProbeRow(probe)
          const [committedRow] = decodeCountRow(committed)
          const [rolledBackRow] = decodeCountRow(rolledBack)
          const [requestedRow] = decodeRequestedRow(requested)
          const [terminalRow] = decodeTerminalRow(cancellationTerminal)
          const [schemaRow] = decodeSchemaRow(schemaMeta)
          const info = yield* store.info
          return Response.json({
            backend: info.backend,
            probe: probeRow.requests,
            tables: tables.map((row) => row.name),
            committed: committedRow.count,
            rolledBack: rolledBackRow.count,
            cancellationStoredType: requestedRow.storage_type,
            cancellationStoredValue: Number(requestedRow.cancellation_requested),
            cancellationTerminalStatus: terminalRow.status,
            alarm: yield* Effect.promise(() => storage.getAlarm()),
            schemaVersion: schemaRow.version,
            migrations,
          })
        }).pipe(Effect.provideContext(context)),
      ),
    )
    return Effect.runPromise(program)
  }
}

export default {
  fetch(request: Request, bindings: Env): Promise<Response> {
    if (new URL(request.url).pathname === "/agent") {
      return Effect.runPromise(Effect.scoped(agentConformance().pipe(Effect.orDie)))
    }
    const replay = new URL(request.url).pathname.startsWith("/replay")
    const namespace = replay ? bindings.REPLAY_OBJECTS : bindings.SQL_OBJECTS
    return namespace.get(namespace.idFromName("default")).fetch(request)
  },
}
