import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { RunNotFound } from "../../errors.js"
import { projectRunSnapshot, projectTreeCheckpoint } from "../../execution/inspection.js"
import { make as makeTreeCursor } from "../../tree/cursor.js"
import { decodeEvent, decodeSqlInteger } from "../codec/codecs.js"
import { decodeRunEffect, loadRunWaitsByStatus } from "../store/statements.js"
import { loadRunBranches } from "../store/fork/index.js"
import type { EventRow, RunRow } from "../codec/rows.js"
import type { ChildReadiness } from "../../child/readiness.js"

interface FirstPositionRow {
  readonly run_id: string
  readonly first_position: number | string | bigint
}

const loadRuns = (rootRunId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<RunRow>`SELECT * FROM generalist_runs WHERE root_run_id = ${rootRunId}`
    const eventRows = yield* sql<EventRow>`
      SELECT e.run_id, e.sequence, e.event_id, e.event_json
      FROM generalist_run_events e JOIN generalist_runs r ON r.run_id = e.run_id
      WHERE r.root_run_id = ${rootRunId}
      ORDER BY e.run_id ASC, e.sequence ASC
    `
    const positions = yield* sql<FirstPositionRow>`
      SELECT run_id, MIN(position) AS first_position
      FROM generalist_tree_event_index WHERE root_run_id = ${rootRunId} GROUP BY run_id
    `
    const links = yield* sql<{ child_run_id: string; readiness: ChildReadiness }>`
      SELECT l.child_run_id, l.readiness
      FROM generalist_run_links l JOIN generalist_runs r ON r.run_id = l.child_run_id
      WHERE r.root_run_id = ${rootRunId}
    `
    const byRun = new Map<string, Array<ReturnType<typeof decodeEvent>>>()
    for (const row of eventRows) {
      const events = byRun.get(row.run_id) ?? []
      events.push(decodeEvent(row.event_json))
      byRun.set(row.run_id, events)
    }
    const first = new Map(positions.map((row) => [row.run_id, decodeSqlInteger(row.first_position)] as const))
    const readiness = new Map(links.map((row) => [row.child_run_id, row.readiness] as const))
    return yield* Effect.forEach(rows, (row) =>
      Effect.gen(function* () {
        const run = yield* decodeRunEffect(row)
        const waits = yield* loadRunWaitsByStatus(run.runId, "open")
        const branches = yield* loadRunBranches(run.runId)
        const inspection = {
          runId: run.runId,
          status: run.status,
          executableRef: run.executableRef,
          executableManifest: run.executableManifest,
          depth: run.depth,
          treePolicy: run.treePolicy,
          waits,
          lastSequence: run.lastSequence,
          durability: "durable" as const,
          branches,
        }
        if (run.parentRunId !== undefined) Object.assign(inspection, { parentRunId: run.parentRunId })
        const childReadiness = readiness.get(run.runId)
        if (childReadiness !== undefined) Object.assign(inspection, { childReadiness })
        const result = {
          inspection,
          rootRunId: run.rootRunId,
          events: byRun.get(run.runId) ?? [],
          firstTreePosition: first.get(run.runId) ?? -1,
        }
        if (run.parentRunId !== undefined) Object.assign(result, { parentRunId: run.parentRunId })
        if (run.invocationId !== undefined) Object.assign(result, { invocationId: run.invocationId })
        if (run.terminalEventId !== undefined) Object.assign(result, { terminalEventId: run.terminalEventId })
        return result
      }),
    )
  })

export const loadRunSnapshot = (runId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const roots = yield* sql<{
      readonly root_run_id: string
    }>`SELECT root_run_id FROM generalist_runs WHERE run_id = ${runId}`
    const rootRunId = roots[0]?.root_run_id
    if (rootRunId === undefined) return yield* RunNotFound.make({ runId })
    const runs = yield* loadRuns(rootRunId)
    const run = runs.find((candidate) => candidate.inspection.runId === runId)
    if (run === undefined) return yield* RunNotFound.make({ runId })
    return yield* projectRunSnapshot(run)
  })

export const loadTreeCheckpoint = (rootRunId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const roots = yield* sql<{ readonly last_position: number | string | bigint }>`
      SELECT last_position FROM generalist_tree_roots WHERE root_run_id = ${rootRunId}
    `
    const root = roots[0]
    if (root === undefined) return yield* RunNotFound.make({ runId: rootRunId })
    const runs = yield* loadRuns(rootRunId)
    return yield* projectTreeCheckpoint(
      rootRunId,
      makeTreeCursor(rootRunId, decodeSqlInteger(root.last_position)),
      runs,
    )
  })
