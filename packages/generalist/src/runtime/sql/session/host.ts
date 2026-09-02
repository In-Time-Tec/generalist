import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import type { SqlError } from "effect/unstable/sql/SqlError"
import { SessionConflict, SessionNotFound, type HostSession, type HostSessionEvent } from "../../session/host.js"
import { RuntimeUnavailable } from "../../errors.js"
import type { RunInspection } from "../../run.js"
import { decodeEvent, decodeSqlInteger } from "../codec/codecs.js"
import { isoFromSql } from "../store/run-decoding.js"
import { decodeRunEffect, loadRunWaitsByStatus, nowIso } from "../store/statements.js"
import { loadRunBranches } from "../store/fork/index.js"
import type { RunRow } from "../codec/rows.js"
import type { Service as RunStoreService } from "../../run/store.js"
import type { EventHub } from "../subscribers.js"
import type { SqlStoreDriver, SqlStoreLocks, SqlStoreRun } from "../store/driver/protocol.js"
import type { WithoutSqlError } from "../effect.js"

interface HostSessionRow {
  readonly session_id: string
  readonly title: string | null
  readonly next_event_sequence: number | string | bigint
  readonly created_at: string | Date
}

const missing = (sessionId: string) =>
  SessionNotFound.make({
    sessionId,
    hint: "Create the Session through host.sessions.create before starting or observing Runs.",
  })

const decodeSession = (row: HostSessionRow): Effect.Effect<HostSession, RuntimeUnavailable> =>
  Effect.gen(function* () {
    const createdAt = isoFromSql(row.created_at)
    if (createdAt === undefined) {
      return yield* RuntimeUnavailable.make({ message: `host Session ${row.session_id} has no creation time` })
    }
    const session = { id: row.session_id, createdAt }
    if (row.title !== null) Object.assign(session, { title: row.title })
    return session
  })

const loadSessionRow = (sessionId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    return (yield* sql<HostSessionRow>`
      SELECT session_id, title, next_event_sequence, created_at
      FROM generalist_host_sessions WHERE session_id = ${sessionId}
    `)[0]
  })

export const createHostSession = (input: { readonly id: string; readonly title?: string }) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    if ((yield* loadSessionRow(input.id)) !== undefined) {
      return yield* SessionConflict.make({
        sessionId: input.id,
        hint: "Use a different Session identity or load the existing Session.",
      })
    }
    const createdAt = yield* nowIso
    yield* sql`
      INSERT INTO generalist_host_sessions (session_id, title, next_event_sequence, created_at)
      VALUES (${input.id}, ${input.title ?? null}, 0, ${createdAt})
    `
    return yield* decodeSession({
      session_id: input.id,
      title: input.title ?? null,
      next_event_sequence: 0,
      created_at: createdAt,
    })
  })

export const getHostSession = (sessionId: string) =>
  Effect.gen(function* () {
    const row = yield* loadSessionRow(sessionId)
    return row === undefined ? yield* missing(sessionId) : yield* decodeSession(row)
  })

export const listHostSessions = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql<HostSessionRow>`
    SELECT session_id, title, next_event_sequence, created_at
    FROM generalist_host_sessions ORDER BY created_at, session_id
  `
  return yield* Effect.forEach(rows, decodeSession)
})

export const hostSessionRuns = (sessionId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* getHostSession(sessionId)
    const rows = yield* sql<RunRow>`
      SELECT * FROM generalist_runs
      WHERE root_run_id = run_id AND session_id = ${sessionId}
      ORDER BY accepted_sequence, run_id
    `
    return yield* Effect.forEach(rows, (row) =>
      Effect.gen(function* () {
        const run = yield* decodeRunEffect(row)
        const waits = yield* loadRunWaitsByStatus(run.runId, "open")
        const branches = yield* loadRunBranches(run.runId)
        const inspection: RunInspection = {
          runId: run.runId,
          status: run.status,
          executableRef: run.executableRef,
          executableManifest: run.executableManifest,
          depth: run.depth,
          treePolicy: run.treePolicy,
          waits,
          lastSequence: run.lastSequence,
          durability: "durable",
          branches,
        }
        return inspection
      }),
    )
  })

interface HostSessionEventRow {
  readonly host_session_sequence: number | string | bigint
  readonly event_json: string
}

const loadHostSessionEvents = (sessionId: string, cursor: number) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const session = yield* loadSessionRow(sessionId)
    if (session === undefined) return yield* missing(sessionId)
    const lastCursor = decodeSqlInteger(session.next_event_sequence) - 1
    const rows = yield* sql<HostSessionEventRow>`
      SELECT host_session_sequence, event_json
      FROM generalist_run_events
      WHERE host_session_id = ${sessionId} AND host_session_sequence > ${cursor}
      ORDER BY host_session_sequence
    `
    const replay = yield* Effect.forEach(rows, (row) =>
      Effect.try({
        try: (): HostSessionEvent => ({
          cursor: decodeSqlInteger(row.host_session_sequence),
          event: decodeEvent(row.event_json),
        }),
        catch: (error) =>
          RuntimeUnavailable.make({ message: `invalid persisted host Session event: ${String(error)}` }),
      }),
    )
    return { replay, lastCursor }
  })

type Locked = <A, E>(
  lock: Effect.Effect<void, SqlError, SqlClient.SqlClient>,
  effect: Effect.Effect<A, E, SqlClient.SqlClient>,
) => Effect.Effect<A, WithoutSqlError<E | SqlError> | RuntimeUnavailable>

/** Construct the SQL RunStore operations owned by product-facing Sessions. */
export const make = <DriverError>(input: {
  readonly driver: SqlStoreDriver<DriverError>
  readonly locks: SqlStoreLocks
  readonly locked: Locked
  readonly runNoTransaction: SqlStoreRun
  readonly hub: EventHub
  readonly capacity: number
}): Pick<
  RunStoreService,
  "createHostSession" | "hostSession" | "listHostSessions" | "hostSessionRuns" | "hostSessionEvents"
> => ({
  createHostSession: (request) => input.locked(input.locks.mailbox(request.id), createHostSession(request)),
  hostSession: (sessionId) => input.runNoTransaction(getHostSession(sessionId)),
  listHostSessions: input.runNoTransaction(listHostSessions),
  hostSessionRuns: (sessionId) => input.runNoTransaction(hostSessionRuns(sessionId)),
  hostSessionEvents: (request) => {
    const loadReplay = input.runNoTransaction(loadHostSessionEvents(request.sessionId, request.cursor))
    if (input.driver.hostSessionEvents !== undefined) {
      return input.driver.hostSessionEvents(request, {
        hub: input.hub,
        capacity: input.capacity,
        runNoTransaction: input.runNoTransaction,
        loadReplay,
        loadAfter: (cursor) =>
          input
            .runNoTransaction(loadHostSessionEvents(request.sessionId, cursor))
            .pipe(Effect.map(({ replay }) => replay)),
      })
    }
    return input.hub.subscribeHostSession({
      sessionId: request.sessionId,
      cursor: request.cursor,
      loadReplay,
      capacity: input.capacity,
    })
  },
})
