import { DateTime, Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import type { SqlError } from "effect/unstable/sql/SqlError"
import { RuntimeUnavailable } from "../../errors.js"
import type { ExecutionClaim, SessionWriteClaim } from "../../run/store.js"
import { StaleSessionClaim } from "../errors.js"

const insertSession = (sessionId: string, created: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql.onDialectOrElse({
      pg: () => sql`
        INSERT INTO generalist_sessions (
          session_id, leaf_id, next_seq, writer_epoch, writer_run_id, writer_owner_id, writer_attempt_fence, updated_at
        ) VALUES (${sessionId}, NULL, 0, 0, NULL, NULL, NULL, ${created})
        ON CONFLICT (session_id) DO NOTHING
      `,
      mysql: () => sql`
        INSERT IGNORE INTO generalist_sessions (
          session_id, leaf_id, next_seq, writer_epoch, writer_run_id, writer_owner_id, writer_attempt_fence, updated_at
        ) VALUES (${sessionId}, NULL, 0, 0, NULL, NULL, NULL, ${created})
      `,
      orElse: () => sql`
        INSERT OR IGNORE INTO generalist_sessions (
          session_id, leaf_id, next_seq, writer_epoch, writer_run_id, writer_owner_id, writer_attempt_fence, updated_at
        ) VALUES (${sessionId}, NULL, 0, 0, NULL, NULL, NULL, ${created})
      `,
    })
  })

interface ClaimInput {
  readonly sessionId: string
  readonly runId: string
  readonly ownerId: string
  readonly runAttemptFence: number
}

const issueSessionWriteClaim = (
  input: ClaimInput,
  onlyIfUnbound: boolean,
): Effect.Effect<SessionWriteClaim, RuntimeUnavailable | SqlError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const created = yield* DateTime.now.pipe(Effect.map(DateTime.formatIso))
    yield* insertSession(input.sessionId, created)
    const available = onlyIfUnbound
      ? sql`AND writer_run_id IS NULL AND writer_owner_id IS NULL AND writer_attempt_fence IS NULL`
      : sql`AND (writer_run_id IS NULL OR writer_run_id = ${input.runId})`
    const rows = yield* sql.onDialectOrElse({
      mysql: () =>
        Effect.gen(function* () {
          const locked = yield* sql`
            SELECT session_id FROM generalist_sessions WHERE session_id = ${input.sessionId} ${available} FOR UPDATE
          `
          if (locked.length !== 1) return []
          yield* sql`
            UPDATE generalist_sessions SET
              writer_epoch = writer_epoch + 1,
              writer_run_id = ${input.runId},
              writer_owner_id = ${input.ownerId},
              writer_attempt_fence = ${input.runAttemptFence},
              updated_at = ${created}
            WHERE session_id = ${input.sessionId} ${available}
          `
          const mutations = yield* sql<{ readonly affected: number | string }>`SELECT ROW_COUNT() AS affected`
          if (Number(mutations[0]?.affected ?? 0) !== 1) return []
          return yield* sql<{ readonly writer_epoch: string | number | bigint }>`
            SELECT writer_epoch FROM generalist_sessions
            WHERE session_id = ${input.sessionId}
              AND writer_run_id = ${input.runId}
              AND writer_owner_id = ${input.ownerId}
              AND writer_attempt_fence = ${input.runAttemptFence}
          `
        }),
      orElse: () => sql<{ readonly writer_epoch: string | number | bigint }>`
        UPDATE generalist_sessions SET
          writer_epoch = writer_epoch + 1,
          writer_run_id = ${input.runId},
          writer_owner_id = ${input.ownerId},
          writer_attempt_fence = ${input.runAttemptFence},
          updated_at = ${created}
        WHERE session_id = ${input.sessionId} ${available}
        RETURNING writer_epoch
      `,
    })
    const epoch = rows[0]?.writer_epoch
    if (epoch === undefined) {
      return yield* RuntimeUnavailable.make({ message: `Session ${input.sessionId} write claim could not be issued` })
    }
    return { ...input, epoch: String(epoch) }
  })

/** @internal Issue a new storage Session epoch and bind it to one exact Run claim. */
export const acquireSessionWriteClaim = (input: ClaimInput) => issueSessionWriteClaim(input, false)

/** @internal Issue a terminal Session claim only when no Run currently owns the Session. */
export const acquireUnboundSessionWriteClaim = (input: ClaimInput) => issueSessionWriteClaim(input, true)

/** @internal Lock and validate one exact Session write binding. */
export const requireSessionWriteClaim = (
  claim: SessionWriteClaim,
): Effect.Effect<void, StaleSessionClaim | SqlError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql.onDialectOrElse({
      pg: () => sql<{ readonly session_id: string }>`
        SELECT session_id FROM generalist_sessions
        WHERE session_id = ${claim.sessionId}
          AND writer_epoch = ${claim.epoch}
          AND writer_run_id = ${claim.runId}
          AND writer_owner_id = ${claim.ownerId}
          AND writer_attempt_fence = ${claim.runAttemptFence}
        FOR UPDATE
      `,
      mysql: () => sql<{ readonly session_id: string }>`
        SELECT session_id FROM generalist_sessions
        WHERE session_id = ${claim.sessionId}
          AND writer_epoch = ${claim.epoch}
          AND writer_run_id = ${claim.runId}
          AND writer_owner_id = ${claim.ownerId}
          AND writer_attempt_fence = ${claim.runAttemptFence}
        FOR UPDATE
      `,
      orElse: () => sql<{ readonly session_id: string }>`
        UPDATE generalist_sessions SET updated_at = updated_at
        WHERE session_id = ${claim.sessionId}
          AND writer_epoch = ${claim.epoch}
          AND writer_run_id = ${claim.runId}
          AND writer_owner_id = ${claim.ownerId}
          AND writer_attempt_fence = ${claim.runAttemptFence}
        RETURNING session_id
      `,
    })
    if (rows.length !== 1) return yield* StaleSessionClaim.make(claim)
  })

/** @internal Revoke only one exact Session write binding without changing its epoch. */
export const revokeSessionWriteClaim = (claim: SessionWriteClaim) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const revoked = yield* sql.onDialectOrElse({
      mysql: () =>
        Effect.gen(function* () {
          yield* sql`
            UPDATE generalist_sessions SET
              writer_run_id = NULL,
              writer_owner_id = NULL,
              writer_attempt_fence = NULL
            WHERE session_id = ${claim.sessionId}
              AND writer_epoch = ${claim.epoch}
              AND writer_run_id = ${claim.runId}
              AND writer_owner_id = ${claim.ownerId}
              AND writer_attempt_fence = ${claim.runAttemptFence}
          `
          const mutations = yield* sql<{ readonly affected: number | string }>`SELECT ROW_COUNT() AS affected`
          return Number(mutations[0]?.affected ?? 0)
        }),
      orElse: () =>
        sql<{ readonly session_id: string }>`
          UPDATE generalist_sessions SET
            writer_run_id = NULL,
            writer_owner_id = NULL,
            writer_attempt_fence = NULL
          WHERE session_id = ${claim.sessionId}
            AND writer_epoch = ${claim.epoch}
            AND writer_run_id = ${claim.runId}
            AND writer_owner_id = ${claim.ownerId}
            AND writer_attempt_fence = ${claim.runAttemptFence}
          RETURNING session_id
        `.pipe(Effect.map((rows) => rows.length)),
    })
    return revoked === 1
  })

/** @internal Revoke the exact Session binding carried by one execution claim. */
export const revokeExecutionSessionWriteClaim = (input: ExecutionClaim) =>
  revokeSessionWriteClaim(input.session).pipe(
    Effect.flatMap((revoked) =>
      revoked
        ? Effect.void
        : RuntimeUnavailable.make({ message: `Run ${input.runId} Session write binding was not revoked` }),
    ),
  )

/** @internal Revoke the binding owned by a locked Run before clearing that Run's owner. */
export const revokeRunSessionWriteClaim = (input: {
  readonly sessionId: string
  readonly runId: string
  readonly ownerId: string | undefined
  readonly runAttemptFence: number
}) =>
  Effect.gen(function* () {
    if (input.ownerId === undefined) return
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql.onDialectOrElse({
      pg: () => sql<{ readonly writer_epoch: string | number | bigint }>`
        SELECT writer_epoch FROM generalist_sessions
        WHERE session_id = ${input.sessionId}
          AND writer_run_id = ${input.runId}
          AND writer_owner_id = ${input.ownerId}
          AND writer_attempt_fence = ${input.runAttemptFence}
        FOR UPDATE
      `,
      mysql: () => sql<{ readonly writer_epoch: string | number | bigint }>`
        SELECT writer_epoch FROM generalist_sessions
        WHERE session_id = ${input.sessionId}
          AND writer_run_id = ${input.runId}
          AND writer_owner_id = ${input.ownerId}
          AND writer_attempt_fence = ${input.runAttemptFence}
        FOR UPDATE
      `,
      orElse: () => sql<{ readonly writer_epoch: string | number | bigint }>`
        SELECT writer_epoch FROM generalist_sessions
        WHERE session_id = ${input.sessionId}
          AND writer_run_id = ${input.runId}
          AND writer_owner_id = ${input.ownerId}
          AND writer_attempt_fence = ${input.runAttemptFence}
      `,
    })
    const epoch = rows[0]?.writer_epoch
    if (epoch === undefined) {
      return yield* RuntimeUnavailable.make({ message: `Run ${input.runId} Session write binding is missing` })
    }
    const revoked = yield* revokeSessionWriteClaim({
      sessionId: input.sessionId,
      runId: input.runId,
      ownerId: input.ownerId,
      runAttemptFence: input.runAttemptFence,
      epoch: String(epoch),
    })
    if (!revoked) {
      return yield* RuntimeUnavailable.make({ message: `Run ${input.runId} Session write binding was not revoked` })
    }
  })
