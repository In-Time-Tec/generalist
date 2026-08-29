import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import type { SqlError } from "effect/unstable/sql/SqlError"
import { WaitResolution as WaitResolutionSchema, type RunWait, type WaitResolution } from "../../run/wait.js"
import { encodeJson } from "../codec/codecs.js"

interface TransitionRunWaitInput {
  readonly runId: string
  readonly waitId: string
  readonly status: Exclude<RunWait["status"], "open">
  readonly resolution?: WaitResolution
  readonly closedAt: string
}

/** The one portable affected-row primitive for exact open -> terminal wait transitions. */
export const transitionRunWait = (
  input: TransitionRunWaitInput,
): Effect.Effect<number, SqlError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const resolution = input.resolution === undefined ? null : encodeJson(WaitResolutionSchema, input.resolution)
    return yield* sql.onDialectOrElse({
      mysql: () =>
        Effect.gen(function* () {
          yield* sql`
            UPDATE tenetkit_run_waits SET status = ${input.status}, response_json = ${resolution}, closed_at = ${input.closedAt}
            WHERE run_id = ${input.runId} AND wait_id = ${input.waitId} AND status = 'open'
          `
          const rows = yield* sql<{ readonly affected: number | string }>`SELECT ROW_COUNT() AS affected`
          return Number(rows[0]?.affected ?? 0)
        }),
      pg: () =>
        sql<{ readonly wait_id: string }>`
          UPDATE tenetkit_run_waits SET status = ${input.status}, response_json = ${resolution}, closed_at = ${input.closedAt}
          WHERE run_id = ${input.runId} AND wait_id = ${input.waitId} AND status = 'open'
          RETURNING wait_id
        `.pipe(Effect.map((rows) => rows.length)),
      orElse: () =>
        sql<{ readonly wait_id: string }>`
          UPDATE tenetkit_run_waits SET status = ${input.status}, response_json = ${resolution}, closed_at = ${input.closedAt}
          WHERE run_id = ${input.runId} AND wait_id = ${input.waitId} AND status = 'open'
          RETURNING wait_id
        `.pipe(Effect.map((rows) => rows.length)),
    })
  })
