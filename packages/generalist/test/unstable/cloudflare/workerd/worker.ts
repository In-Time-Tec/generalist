import { Effect, Exit, Layer, Schema, Stream } from "effect"
import { Prompt, Tool, Toolkit } from "effect/unstable/ai"
import { Agent, AgentEvent, Approvals, Permissions } from "generalist"
import { decodeConfig as decodeOpenRouterConfig } from "generalist/providers/openrouter"
import { TestModel } from "generalist/testing"
import { SqlClient } from "effect/unstable/sql"
import {
  Address,
  Errors,
  ExecutableManifest,
  Message,
  RunEvent,
  RunStore as RunStoreFacade,
  type Runtime,
} from "generalist/runtime"
import {
  HibernatingWebSocket,
  layerRunStore,
  layerSqlClient,
  type DurableObjectStorage,
} from "generalist/unstable/cloudflare/durable-objects"
import { SqliteRunActivation } from "generalist/runtime/sql-driver"
import { inspectLogicalSqlSchema } from "../../../runtime/sql/schema-conformance.js"

const test = ExecutableManifest.makeTest
const makeMessage = Message.make
const AgentExecutionFailure = Errors.AgentExecutionFailure
const RuntimeUnavailable = Errors.RuntimeUnavailable
const RunStore = RunStoreFacade.RunStore

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
  readonly acceptWebSocket: (socket: HibernatingWebSocket.Socket, tags?: ReadonlyArray<string>) => void
  readonly getWebSockets: (tag?: string) => ReadonlyArray<HibernatingWebSocket.Socket>
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
  output: planSchema,
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
    TestModel.object({ output: { objective: "Arrange service", facts: ["Provider serves Boise"] } }),
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
  const planned = yield* Agent.run(planner, "Find a provider and propose a plan.").pipe(
    Effect.provideContext(successServices),
  )

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
  const denied = yield* Agent.run(planner, "Buy the service.").pipe(Effect.provideContext(deniedServices), Effect.exit)

  const exhaustedFixture = yield* TestModel.make([TestModel.text("must not execute")])
  const exhaustedServices = yield* Layer.build(exhaustedFixture.layer)
  const exhausted = yield* Agent.run(
    Agent.make({ name: "workerd-budget", budget: { modelCalls: 0 } }),
    "This model call is outside the budget.",
  ).pipe(Effect.provideContext(exhaustedServices), Effect.exit)
  const exhaustedRequests = yield* exhaustedFixture.requests
  const openRouterConfig = yield* decodeOpenRouterConfig({})

  return Response.json({
    objective: planned.objective,
    facts: planned.facts,
    lookupExecutions,
    denied: Exit.isFailure(denied),
    deniedExecutions,
    budgetExhausted: Exit.isFailure(exhausted),
    budgetModelRequests: exhaustedRequests.length,
    openRouterBundled: Object.keys(openRouterConfig).length === 0,
  })
})

const replayExecutable = test("workerd-replay", "1")
const replayEvents: ReadonlyArray<RunEvent.RunEvent> = [0, 1].map(
  (sequence): RunEvent.RunEvent => ({
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
const replayRuntime: Runtime.Service = {
  register: unusedEffect,
  start: unusedEffect,
  startExecution: unusedEffect,
  admit: unusedEffect,
  activate: unusedEffect,
  send: unusedEffect,
  spawn: unusedEffect,
  events: unusedStream,
  previews: unusedStream,
  snapshot: unusedEffect,
  history: ({ cursor }) => Effect.succeed(replayEvents.filter((event) => event.sequence > (cursor ?? -1))),
  acknowledge: unusedEffect,
  acknowledged: unusedEffect,
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
  readonly 1: HibernatingWebSocket.Socket
}

export class ReplayObject {
  private readonly replay: ReturnType<typeof HibernatingWebSocket.make>

  constructor(state: DurableObjectState) {
    this.replay = HibernatingWebSocket.make({ state, runtime: replayRuntime, pageSize: 1, fuel: 1 })
  }

  fetch(request: Request): Promise<Response> {
    if (new URL(request.url).pathname.endsWith("/flush")) {
      return this.replay.flush("replay-run").then((result) => Response.json(result))
    }
    const pair = new WebSocketPair()
    this.replay.accept(pair[1])
    return Promise.resolve(new Response(null, { status: 101, webSocket: pair[0] }))
  }

  webSocketMessage(socket: HibernatingWebSocket.Socket, message: string | ArrayBuffer): Promise<void> {
    return this.replay.webSocketMessage(socket, message)
  }

  webSocketClose(socket: HibernatingWebSocket.Socket): void {
    this.replay.webSocketClose(socket)
  }

  webSocketError(socket: HibernatingWebSocket.Socket): void {
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
          const pluralRunId = `workerd-plural-${probeCount[0]?.requests ?? 0}`
          const acknowledgementRunId = `workerd-acknowledgement-${probeCount[0]?.requests ?? 0}`
          const cancellationExecutable = test("workerd-cancellation", "1")
          const cancellationMessage = makeMessage({
            id: cancellationRunId,
            to: Address.make("agent:test"),
            sessionId: "session",
            prompt: Prompt.make("cancel"),
            idempotencyKey: cancellationRunId,
            correlationId: cancellationRunId,
          })
          const pluralMessage = makeMessage({
            id: pluralRunId,
            to: Address.make("agent:test"),
            sessionId: "session",
            prompt: Prompt.make("wait for three responses"),
            idempotencyKey: pluralRunId,
            correlationId: pluralRunId,
          })
          const acknowledgementMessage = makeMessage({
            id: acknowledgementRunId,
            to: Address.make("agent:test"),
            sessionId: `session:${acknowledgementRunId}`,
            prompt: Prompt.make("acknowledge completed model cycles"),
            idempotencyKey: acknowledgementRunId,
            correlationId: acknowledgementRunId,
          })
          yield* SqliteRunActivation.createSchema
          const committedAlarm = 4_000_000_000_000
          const rolledBackAlarm = 3_000_000_000_000
          const rearm = (at: number) =>
            Effect.tryPromise({
              try: () => storage.setAlarm(at),
              catch: (cause) => RuntimeUnavailable.make({ message: `alarm failed: ${String(cause)}` }),
            })
          const insertRun = (runId: string) => sql`
            INSERT INTO generalist_runs (
              run_id, status, address, session_id, message_id, message_json, message_digest, idempotency_key,
              executable_ref_json, executable_manifest_json, root_run_id, depth, max_depth, max_subagents,
              attempt, attempt_fence, last_sequence, cancellation_requested, accepted_sequence,
              created_at, updated_at
            ) VALUES (
              ${runId}, 'running', 'agent:test', 'session', ${runId}, '{}', 'digest', ${runId},
              '{}', '{}', ${runId}, 0, 4, 4,
              1, 1, -1, 0, 1,
              '2026-08-19T00:00:00.000Z', '2026-08-19T00:00:00.000Z'
            )
          `
          yield* sql.withTransaction(
            Effect.gen(function* () {
              yield* sql`DELETE FROM generalist_activations WHERE run_id = 'workerd-committed'`
              yield* sql`DELETE FROM generalist_runs WHERE run_id = 'workerd-committed'`
              yield* insertRun("workerd-committed")
              yield* SqliteRunActivation.makeProjection(sql, rearm(committedAlarm)).applyInTransaction([
                { runId: "workerd-committed", intent: "execute", attemptFence: 1, runStatus: "running" },
              ])
            }),
          )
          yield* Effect.exit(
            sql.withTransaction(
              Effect.gen(function* () {
                yield* sql`DELETE FROM generalist_runs WHERE run_id = 'workerd-rolled-back'`
                yield* insertRun("workerd-rolled-back")
                yield* SqliteRunActivation.makeProjection(sql, rearm(rolledBackAlarm)).applyInTransaction([
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
            FROM generalist_runs WHERE run_id = ${cancellationRunId}
          `
          yield* store.fail({
            ...claim,
            error: AgentExecutionFailure.make({ message: "execution interrupted" }),
          })
          yield* store.admitStart({
            runId: pluralRunId,
            message: pluralMessage,
            executableRef: cancellationExecutable.ref,
            executableManifest: cancellationExecutable.manifest,
            registrations: [],
            treePolicy: { maxDepth: 4, maxSubagents: 4 },
            initialChildren: [],
            initialFanOuts: [],
          })
          const pluralClaim = yield* store.claimExecution({ runId: pluralRunId, ownerId: "workerd" })
          const pluralWaitIds = ["a", "b", "c"].map((suffix) => `${pluralRunId}:${suffix}`)
          const pluralCalls = pluralWaitIds.map((waitId) => ({
            type: "tool-call" as const,
            id: waitId,
            name: "workerd-conformance",
            params: {},
            providerExecuted: false,
            metadata: {},
          }))
          const pluralSuspension = AgentEvent.AgentSuspended.make({
            checkpoint: {
              turn: 0,
              calls: pluralCalls.map((call) => ({
                call,
                operationKey: `workerd:${call.id}`,
                state: { _tag: "Waiting" as const, reason: "tool-wait" as const, waitId: call.id, token: call.id },
              })),
              activeTools: ["workerd-conformance"],
              authorizationContextDigest: "",
              activatedSkills: [],
              invocationPath: [],
            },
            waits: pluralCalls.map((call, callIndex) => ({
              waitId: call.id,
              token: call.id,
              reason: "tool-wait" as const,
              callIndex,
              call,
            })),
          })
          yield* store.suspend({
            ...pluralClaim,
            waits: pluralWaitIds.map((waitId) => ({
              waitId,
              reason: { _tag: "ToolWait" as const },
              status: "open" as const,
              openedAt: "2026-08-29T00:00:00.000Z",
            })),
            suspension: pluralSuspension,
          })
          const suffixes = (waits: ReadonlyArray<{ readonly waitId: string }>) =>
            waits.map(({ waitId }) => waitId.slice(waitId.lastIndexOf(":") + 1))
          const pluralInitialOrder = suffixes((yield* store.inspect(pluralRunId)).waits)
          const firstResolution = { _tag: "ToolResult" as const, result: "first", encodedResult: "first" }
          yield* store.respond({ runId: pluralRunId, waitId: pluralWaitIds[0]!, resolution: firstResolution })
          yield* store.respond({
            runId: pluralRunId,
            waitId: pluralWaitIds[2]!,
            resolution: { _tag: "ToolResult", result: "third", encodedResult: "third" },
          })
          const pluralRemainingAfterOutOfOrder = suffixes((yield* store.inspect(pluralRunId)).waits)
          yield* store.respond({ runId: pluralRunId, waitId: pluralWaitIds[0]!, resolution: firstResolution })
          const pluralConflictingTag = yield* store
            .respond({
              runId: pluralRunId,
              waitId: pluralWaitIds[0]!,
              resolution: { _tag: "ToolResult", result: "changed", encodedResult: "changed" },
            })
            .pipe(Effect.match({ onFailure: (error) => error._tag, onSuccess: () => "success" }))
          yield* store.respond({
            runId: pluralRunId,
            waitId: pluralWaitIds[1]!,
            resolution: { _tag: "ToolResult", result: "second", encodedResult: "second" },
          })
          const pluralFinalOpen = (yield* store.inspect(pluralRunId)).waits.length
          const pluralEvents = yield* store.history({ runId: pluralRunId, cursor: -1, limit: 100 })
          const pluralResumeEvents = pluralEvents.filter((event) => event._tag === "RunResumed").length
          const pluralRows = yield* sql<{ readonly wait_id: string }>`
            SELECT wait_id FROM generalist_run_waits WHERE run_id = ${pluralRunId} ORDER BY authored_order
          `
          const pluralAuthoredHistory = suffixes(pluralRows.map(({ wait_id: waitId }) => ({ waitId })))

          yield* store.admitStart({
            runId: acknowledgementRunId,
            message: acknowledgementMessage,
            executableRef: cancellationExecutable.ref,
            executableManifest: cancellationExecutable.manifest,
            registrations: [],
            treePolicy: { maxDepth: 4, maxSubagents: 4 },
            initialChildren: [],
            initialFanOuts: [],
          })
          const acknowledgementClaim = yield* store.claimExecution({
            runId: acknowledgementRunId,
            ownerId: "workerd",
          })
          const acknowledgementInitialSequence = (yield* store.acknowledged(acknowledgementRunId)).sequence
          yield* store.emitAgentEvent({
            ...acknowledgementClaim,
            event: { _tag: "TurnCompleted", turn: 0 },
          })
          yield* store.emitAgentEvent({
            ...acknowledgementClaim,
            event: { _tag: "TurnStarted", turn: 1 },
          })
          yield* store.emitAgentEvent({
            ...acknowledgementClaim,
            event: { _tag: "TurnCompleted", turn: 1 },
          })
          yield* store.emitAgentEvent({
            ...acknowledgementClaim,
            event: { _tag: "TurnStarted", turn: 2 },
          })
          const acknowledgementHistory = yield* store.history({
            runId: acknowledgementRunId,
            cursor: -1,
            limit: 100,
          })
          const acknowledgementBoundaries = acknowledgementHistory.filter((event) => event._tag === "TurnCompleted")
          const firstAcknowledgementBoundary = acknowledgementBoundaries[0]!.sequence
          const lastAcknowledgementBoundary = acknowledgementBoundaries[1]!.sequence
          const nonBoundary = acknowledgementHistory.find(
            (event) =>
              event.sequence > firstAcknowledgementBoundary &&
              event.sequence < lastAcknowledgementBoundary &&
              event._tag !== "TurnCompleted",
          )!.sequence
          const acknowledgementInvalidTag = yield* store
            .acknowledge({ runId: acknowledgementRunId, sequence: nonBoundary })
            .pipe(Effect.match({ onFailure: (error) => error._tag, onSuccess: () => "success" }))
          yield* store.acknowledge({ runId: acknowledgementRunId, sequence: firstAcknowledgementBoundary })
          yield* store.acknowledge({ runId: acknowledgementRunId, sequence: lastAcknowledgementBoundary })
          yield* store.acknowledge({ runId: acknowledgementRunId, sequence: firstAcknowledgementBoundary })
          const acknowledgedSequence = (yield* store.acknowledged(acknowledgementRunId)).sequence
          const acknowledgementBeyondTag = yield* store
            .acknowledge({ runId: acknowledgementRunId, sequence: lastAcknowledgementBoundary + 1 })
            .pipe(Effect.match({ onFailure: (error) => error._tag, onSuccess: () => "success" }))
          const acknowledgementTailSequences = acknowledgementHistory
            .filter((event) => event.sequence > acknowledgedSequence)
            .map((event) => event.sequence)

          let transitionAffected: readonly [number, number] = [-1, -1]
          yield* Effect.exit(
            sql.withTransaction(
              Effect.gen(function* () {
                const probeWaitId = `${pluralRunId}:affected-row-probe`
                yield* sql`
                  INSERT INTO generalist_run_waits
                    (run_id, wait_id, authored_order, reason, status, response_json, opened_at, closed_at)
                  VALUES
                    (${pluralRunId}, ${probeWaitId}, 3, '{"_tag":"ToolWait"}', 'open', NULL,
                     '2026-08-29T00:00:00.000Z', NULL)
                `
                const first = yield* sql<{ readonly wait_id: string }>`
                  UPDATE generalist_run_waits
                  SET status = 'responded', response_json = '{"_tag":"ToolResult","result":"probe","encodedResult":"probe"}',
                      closed_at = '2026-08-29T00:00:01.000Z'
                  WHERE run_id = ${pluralRunId} AND wait_id = ${probeWaitId} AND status = 'open'
                  RETURNING wait_id
                `
                const duplicate = yield* sql<{ readonly wait_id: string }>`
                  UPDATE generalist_run_waits
                  SET status = 'responded', response_json = '{"_tag":"ToolResult","result":"probe","encodedResult":"probe"}',
                      closed_at = '2026-08-29T00:00:01.000Z'
                  WHERE run_id = ${pluralRunId} AND wait_id = ${probeWaitId} AND status = 'open'
                  RETURNING wait_id
                `
                transitionAffected = [first.length, duplicate.length]
                return yield* RuntimeUnavailable.make({ message: "roll back affected-row probe" })
              }),
            ),
          )
          const cancellationTerminal = yield* sql<{ readonly status: string }>`
            SELECT status FROM generalist_runs WHERE run_id = ${cancellationRunId}
          `
          const tables = yield* sql<{ readonly name: string }>`
            SELECT name FROM sqlite_schema
            WHERE type = 'table' AND substr(name, 1, 11) = 'generalist_'
            ORDER BY name
          `
          const probe = yield* sql<{ readonly requests: number }>`SELECT requests FROM workerd_probe WHERE id = 1`
          const committed = yield* sql<{ readonly count: number }>`
            SELECT COUNT(*) AS count FROM generalist_runs r JOIN generalist_activations a ON a.run_id = r.run_id
            WHERE r.run_id = 'workerd-committed'
          `
          const rolledBack = yield* sql<{ readonly count: number }>`
            SELECT COUNT(*) AS count FROM generalist_runs r LEFT JOIN generalist_activations a ON a.run_id = r.run_id
            WHERE r.run_id = 'workerd-rolled-back' OR a.run_id = 'workerd-rolled-back'
          `
          const schemaMeta = yield* sql<{
            readonly version: number
          }>`SELECT version FROM generalist_schema_meta WHERE id = 1`
          const migrations = yield* sql<{ readonly id: number; readonly name: string }>`
            SELECT migration_id AS id, name FROM generalist_sql_migrations ORDER BY migration_id
          `
          const [probeRow] = decodeProbeRow(probe)
          const [committedRow] = decodeCountRow(committed)
          const [rolledBackRow] = decodeCountRow(rolledBack)
          const [requestedRow] = decodeRequestedRow(requested)
          const [terminalRow] = decodeTerminalRow(cancellationTerminal)
          const [schemaRow] = decodeSchemaRow(schemaMeta)
          const info = yield* store.info
          const logicalSchemaViolations = yield* inspectLogicalSqlSchema
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
            logicalSchemaViolations,
            migrations,
            transitionAffected,
            pluralInitialOrder,
            pluralRemainingAfterOutOfOrder,
            pluralConflictingTag,
            pluralFinalOpen,
            pluralResumeEvents,
            pluralAuthoredHistory,
            acknowledgementInitialSequence,
            acknowledgedSequence,
            acknowledgementInvalidTag,
            acknowledgementBeyondTag,
            acknowledgementTailSequences,
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
