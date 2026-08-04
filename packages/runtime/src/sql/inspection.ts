import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { RunNotFound } from "../errors.js"
import { projectRunSnapshot, projectTreeInspection } from "../inspection.js"
import { makeCursor } from "../tree-cursor.js"
import { decodeEvent } from "./codecs.js"
import { decodeRunEffect, loadRunWait } from "./store-helpers.js"
import type { EventRow, RunRow } from "./rows.js"

interface FirstPositionRow {
  readonly run_id: string
  readonly first_position: number
}

const loadRuns = (rootRunId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<RunRow>`SELECT * FROM baton_runs WHERE root_run_id = ${rootRunId}`
    const eventRows = yield* sql<EventRow>`
      SELECT e.run_id, e.sequence, e.event_id, e.event_json
      FROM baton_run_events e JOIN baton_runs r ON r.run_id = e.run_id
      WHERE r.root_run_id = ${rootRunId}
      ORDER BY e.run_id ASC, e.sequence ASC
    `
    const positions = yield* sql<FirstPositionRow>`
      SELECT run_id, MIN(position) AS first_position
      FROM baton_tree_event_index WHERE root_run_id = ${rootRunId} GROUP BY run_id
    `
    const byRun = new Map<string, Array<ReturnType<typeof decodeEvent>>>()
    for (const row of eventRows) {
      const events = byRun.get(row.run_id) ?? []
      events.push(decodeEvent(row.event_json))
      byRun.set(row.run_id, events)
    }
    const first = new Map(positions.map((row) => [row.run_id, Number(row.first_position)] as const))
    return yield* Effect.forEach(rows, (row) =>
      Effect.gen(function* () {
        const run = yield* decodeRunEffect(row)
        const wait = yield* loadRunWait(run.runId, run.activeWaitId)
        return {
          inspection: {
            runId: run.runId,
            status: run.status,
            executableRef: run.executableRef,
            executableManifest: run.executableManifest,
            lastSequence: run.lastSequence,
            durability: "durable" as const,
            ...(run.parentRunId === undefined ? {} : { parentRunId: run.parentRunId }),
            ...(wait === undefined ? {} : { wait }),
          },
          rootRunId: run.rootRunId,
          ...(run.parentRunId === undefined ? {} : { parentRunId: run.parentRunId }),
          ...(run.invocationId === undefined ? {} : { invocationId: run.invocationId }),
          ...(run.terminalEventId === undefined ? {} : { terminalEventId: run.terminalEventId }),
          events: byRun.get(run.runId) ?? [],
          firstTreePosition: first.get(run.runId) ?? -1,
        }
      }),
    )
  })

export const loadRunSnapshot = (runId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const roots = yield* sql<{
      readonly root_run_id: string
    }>`SELECT root_run_id FROM baton_runs WHERE run_id = ${runId}`
    const rootRunId = roots[0]?.root_run_id
    if (rootRunId === undefined) return yield* RunNotFound.make({ runId })
    const runs = yield* loadRuns(rootRunId)
    const run = runs.find((candidate) => candidate.inspection.runId === runId)
    if (run === undefined) return yield* RunNotFound.make({ runId })
    return yield* projectRunSnapshot(run)
  })

export const loadTreeInspection = (rootRunId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const roots = yield* sql<{ readonly last_position: number }>`
      SELECT last_position FROM baton_tree_roots WHERE root_run_id = ${rootRunId}
    `
    const root = roots[0]
    if (root === undefined) return yield* RunNotFound.make({ runId: rootRunId })
    const runs = yield* loadRuns(rootRunId)
    return yield* projectTreeInspection(rootRunId, makeCursor(rootRunId, Number(root.last_position)), runs)
  })
