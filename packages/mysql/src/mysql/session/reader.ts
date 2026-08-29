import { Effect, Schema } from "effect"
import { Session } from "tenetkit"
import { SqlClient } from "effect/unstable/sql"
import type { SessionReader } from "tenetkit/runtime/driver/run/store"
import type { SessionRow } from "tenetkit/runtime/driver/sql/session/storage"
import type { RunFn } from "../transaction/events.js"
import { MysqlSessionStorage } from "./storage.js"

const { loadEntries, pathFromRows, storeError } = MysqlSessionStorage

const mapReadError = <A, E>(effect: Effect.Effect<A, E>) =>
  Effect.mapError(effect, (error) => (Schema.is(Session.SessionStoreError)(error) ? error : storeError(String(error))))

/** Read-only MySQL Session hydration with no mutation capability. */
export const mysqlSessionReader = (options: {
  readonly sessionId: string
  readonly runNoTxn: RunFn
}): SessionReader => ({
  path: (leaf) =>
    options
      .runNoTxn(
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient
          const sessions = yield* sql<SessionRow>`
            SELECT leaf_id, next_seq, writer_epoch, writer_run_id, writer_owner_id, writer_attempt_fence
            FROM tenetkit_sessions WHERE session_id = ${options.sessionId}
          `
          return {
            target: leaf ?? sessions[0]?.leaf_id ?? null,
            rows: yield* loadEntries(options.sessionId),
          }
        }).pipe(
          Effect.flatMap(({ rows, target }) => {
            const path = pathFromRows(rows, target)
            return Schema.is(Session.SessionStoreError)(path) ? path : Effect.succeed(path)
          }),
        ),
      )
      .pipe(mapReadError),
  leaf: Effect.orDie(
    options.runNoTxn(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        const rows = yield* sql<SessionRow>`
          SELECT leaf_id, next_seq, writer_epoch, writer_run_id, writer_owner_id, writer_attempt_fence
          FROM tenetkit_sessions WHERE session_id = ${options.sessionId}
        `
        return rows[0]?.leaf_id ?? null
      }),
    ),
  ),
})
