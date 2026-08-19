import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { RunNotFound, RunTerminal } from "tenetkit/runtime/driver/errors"
import { isTerminal } from "tenetkit/runtime/driver/run"
import { loadRun } from "./pg-helpers.js"

/**
 * One Run-level lock serializing admission, steering, response, resume, timeout,
 * cancellation, and terminal settlement. Always taken advisory-first, then row,
 * so every writer acquires them in the same order.
 */
export const lockRun = (runId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`SELECT pg_advisory_xact_lock(hashtext(${`run:${runId}`}))`
    yield* sql`SELECT run_id FROM tenetkit_runs WHERE run_id = ${runId} FOR UPDATE`
  })

export const lockRunHierarchy = (runId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const hierarchy = [runId]
    let current = runId
    while (true) {
      const row = (yield* sql<{ parent_run_id: string | null }>`
        SELECT parent_run_id FROM tenetkit_runs WHERE run_id = ${current}
      `)[0]
      if (row?.parent_run_id === null || row?.parent_run_id === undefined) break
      hierarchy.push(row.parent_run_id)
      current = row.parent_run_id
    }
    for (const id of hierarchy.reverse()) yield* lockRun(id)
  })

/**
 * One mailbox-level lock serializing admission into one target session's inbox.
 *
 * A mailbox entry takes the next sequence for its target, so concurrent senders must be serialized
 * on the target rather than on any one sender's Run.
 */
export const lockMailbox = (targetSessionId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`SELECT pg_advisory_xact_lock(hashtext(${`mailbox:${targetSessionId}`}))`
  }).pipe(Effect.asVoid)

export const lockSpawnParent = (runId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`SELECT run_id FROM tenetkit_runs WHERE run_id = ${runId} FOR UPDATE`
    const parent = yield* loadRun(runId)
    if (parent === undefined) return yield* RunNotFound.make({ runId })
    if (isTerminal(parent.status)) return yield* RunTerminal.make({ runId, status: parent.status })
    return parent
  })
