import { Database } from "bun:sqlite"
import {
  driverConformance,
  modelResponseFaultConformance,
  type ClaimExecution,
  type ModelResponseFaultBoundary,
} from "tenetkit/test/runtime-driver"
import { Effect } from "effect"
import { assistantAddress, memoryLayer } from "../../runtime/execution/fixtures.js"
import { sqliteLayer, tempDbPath } from "../../runtime/sql/scenario.js"

const claim: ClaimExecution = ({ store }, { runId, workerId }) =>
  store.claimExecution({ runId, ownerId: workerId }).pipe(Effect.orDie)

const sqlitePath = tempDbPath("runtime-driver-conformance")
const sqliteTestLayer = sqliteLayer(sqlitePath, { scheduler: { pollInterval: "1 hour" } })
const triggerName = (boundary: ModelResponseFaultBoundary) => `tenetkit_fault_${boundary.replaceAll("-", "_")}`
const quote = (value: string): string => value.replaceAll("'", "''")

const sqliteFaultTrigger = (boundary: ModelResponseFaultBoundary, runId: string, sessionId: string): string => {
  const name = triggerName(boundary)
  switch (boundary) {
    case "after-claim-validation":
      return `CREATE TRIGGER ${name} BEFORE INSERT ON tenetkit_session_entries
        WHEN NEW.session_id = '${quote(sessionId)}' AND NEW.tag = 'ModelResponse'
        BEGIN SELECT RAISE(ABORT, '${boundary}'); END`
    case "after-session-entry":
      return `CREATE TRIGGER ${name} BEFORE UPDATE ON tenetkit_sessions
        WHEN NEW.session_id = '${quote(sessionId)}' AND NEW.leaf_id <> OLD.leaf_id
        BEGIN SELECT RAISE(ABORT, '${boundary}'); END`
    case "after-session-leaf":
      return `CREATE TRIGGER ${name} BEFORE UPDATE ON tenetkit_run_operations
        WHEN NEW.run_id = '${quote(runId)}' AND NEW.status = 'succeeded'
        BEGIN SELECT RAISE(ABORT, '${boundary}'); END`
    case "after-operation":
      return `CREATE TRIGGER ${name} BEFORE UPDATE ON tenetkit_runs
        WHEN NEW.run_id = '${quote(runId)}' AND NEW.driver_checkpoint_json IS NOT OLD.driver_checkpoint_json
        BEGIN SELECT RAISE(ABORT, '${boundary}'); END`
    case "after-checkpoint":
      return `CREATE TRIGGER ${name} BEFORE INSERT ON tenetkit_run_events
        WHEN NEW.run_id = '${quote(runId)}' AND NEW.event_json LIKE '%ModelResponseCommitted%'
        BEGIN SELECT RAISE(ABORT, '${boundary}'); END`
    case "after-event":
      return `CREATE TRIGGER ${name} BEFORE UPDATE ON tenetkit_tree_roots
        WHEN NEW.root_run_id = '${quote(runId)}'
        BEGIN SELECT RAISE(ABORT, '${boundary}'); END`
    case "after-tree-position":
      return `CREATE TRIGGER ${name} BEFORE INSERT ON tenetkit_tree_event_index
        WHEN NEW.run_id = '${quote(runId)}'
        BEGIN SELECT RAISE(ABORT, '${boundary}'); END`
    case "after-tree-index":
      return `CREATE TRIGGER ${name} BEFORE UPDATE ON tenetkit_runs
        WHEN NEW.run_id = '${quote(runId)}' AND NEW.last_sequence > OLD.last_sequence
        BEGIN SELECT RAISE(ABORT, '${boundary}'); END`
    case "before-commit":
      return `CREATE TRIGGER ${name} AFTER UPDATE ON tenetkit_runs
        WHEN NEW.run_id = '${quote(runId)}' AND NEW.last_sequence > OLD.last_sequence
        BEGIN SELECT RAISE(ABORT, '${boundary}'); END`
  }
}

driverConformance({
  name: "memory",
  address: assistantAddress,
  layer: memoryLayer,
  capabilities: {
    admission: true,
    runtime: { claim },
    runTree: { claim },
  },
})

driverConformance({
  name: "sqlite",
  address: assistantAddress,
  layer: sqliteTestLayer,
  capabilities: {
    admission: true,
    runtime: { claim },
    runTree: { claim },
  },
})

modelResponseFaultConformance({
  name: "SQLite",
  address: assistantAddress,
  layer: sqliteTestLayer,
  claim: ({ store, runId, workerId }) => store.claimExecution({ runId, ownerId: workerId }).pipe(Effect.orDie),
  install: ({ boundary, runId, sessionId }) =>
    Effect.sync(() => {
      const database = new Database(sqlitePath)
      database.run(sqliteFaultTrigger(boundary, runId, sessionId))
      database.close()
    }),
  remove: (boundary) =>
    Effect.sync(() => {
      const database = new Database(sqlitePath)
      database.run(`DROP TRIGGER IF EXISTS ${triggerName(boundary)}`)
      database.close()
    }),
})
