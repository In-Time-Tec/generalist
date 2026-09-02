import { Database } from "bun:sqlite"
import {
  modelResponseFaultConformance,
  type ClaimExecution,
  type ModelResponseFaultBoundary,
} from "generalist/testing/runtime-driver"
import { Testing } from "generalist/testing"
import { Effect } from "effect"
import { assistantAddress, memoryLayer, scheduleDefinition } from "../../runtime/execution/fixtures.js"
import { sqliteManualClaimLayer, tempDbPath } from "../../runtime/sql/scenario.js"

const claim: ClaimExecution = ({ store }, { runId, workerId }) =>
  store.claimExecution({ runId, ownerId: workerId }).pipe(Effect.orDie)

const sqlitePath = tempDbPath("runtime-driver-conformance")
const sqliteTestLayer = sqliteManualClaimLayer(sqlitePath)
const triggerName = (boundary: ModelResponseFaultBoundary) => `generalist_fault_${boundary.replaceAll("-", "_")}`
const quote = (value: string): string => value.replaceAll("'", "''")

const sqliteFaultTrigger = (boundary: ModelResponseFaultBoundary, runId: string, sessionId: string): string => {
  const name = triggerName(boundary)
  switch (boundary) {
    case "after-claim-validation":
      return `CREATE TRIGGER ${name} BEFORE INSERT ON generalist_session_entries
        WHEN NEW.session_id = '${quote(sessionId)}' AND NEW.tag = 'ModelResponse'
        BEGIN SELECT RAISE(ABORT, '${boundary}'); END`
    case "after-session-entry":
      return `CREATE TRIGGER ${name} BEFORE UPDATE ON generalist_sessions
        WHEN NEW.session_id = '${quote(sessionId)}' AND NEW.leaf_id <> OLD.leaf_id
        BEGIN SELECT RAISE(ABORT, '${boundary}'); END`
    case "after-session-leaf":
      return `CREATE TRIGGER ${name} BEFORE UPDATE ON generalist_run_operations
        WHEN NEW.run_id = '${quote(runId)}' AND NEW.status = 'succeeded'
        BEGIN SELECT RAISE(ABORT, '${boundary}'); END`
    case "after-operation":
      return `CREATE TRIGGER ${name} BEFORE UPDATE ON generalist_runs
        WHEN NEW.run_id = '${quote(runId)}' AND NEW.driver_checkpoint_json IS NOT OLD.driver_checkpoint_json
        BEGIN SELECT RAISE(ABORT, '${boundary}'); END`
    case "after-checkpoint":
      return `CREATE TRIGGER ${name} BEFORE INSERT ON generalist_run_events
        WHEN NEW.run_id = '${quote(runId)}' AND NEW.event_json LIKE '%ModelResponseCommitted%'
        BEGIN SELECT RAISE(ABORT, '${boundary}'); END`
    case "after-event":
      return `CREATE TRIGGER ${name} BEFORE UPDATE ON generalist_tree_roots
        WHEN NEW.root_run_id = '${quote(runId)}'
        BEGIN SELECT RAISE(ABORT, '${boundary}'); END`
    case "after-tree-position":
      return `CREATE TRIGGER ${name} BEFORE INSERT ON generalist_tree_event_index
        WHEN NEW.run_id = '${quote(runId)}'
        BEGIN SELECT RAISE(ABORT, '${boundary}'); END`
    case "after-tree-index":
      return `CREATE TRIGGER ${name} BEFORE UPDATE ON generalist_runs
        WHEN NEW.run_id = '${quote(runId)}' AND NEW.last_sequence > OLD.last_sequence
        BEGIN SELECT RAISE(ABORT, '${boundary}'); END`
    case "before-commit":
      return `CREATE TRIGGER ${name} AFTER UPDATE ON generalist_runs
        WHEN NEW.run_id = '${quote(runId)}' AND NEW.last_sequence > OLD.last_sequence
        BEGIN SELECT RAISE(ABORT, '${boundary}'); END`
  }
}

Testing.runtimeDriver({
  name: "memory",
  address: assistantAddress,
  layer: memoryLayer,
  capabilities: {
    admission: true,
    runtime: { claim },
    "host-sessions": { claim },
    "start-by-agent": { claim },
    "idempotent-start": { claim },
    "unknown-agent-on-recovery": { claim },
    "approval-suspend": { claim, recovery: "reclaim" },
    "await-event": { claim, recovery: "reclaim" },
    schedules: { definition: scheduleDefinition, recovery: "reclaim" },
    "operator-explain": true,
    "operator-retry": { claim },
    "operator-resolve-unknown": { claim },
    "operator-scan": { claim },
    runTree: { claim },
    "fork-rewind": { claim },
  },
})

Testing.runtimeDriver({
  name: "sqlite",
  address: assistantAddress,
  layer: sqliteTestLayer,
  capabilities: {
    admission: true,
    runtime: { claim },
    "host-sessions": { claim },
    "start-by-agent": { claim },
    "idempotent-start": { claim },
    "unknown-agent-on-recovery": { claim },
    "approval-suspend": { claim, recovery: "rebuild" },
    "await-event": { claim, recovery: "rebuild" },
    schedules: { definition: scheduleDefinition, recovery: "rebuild" },
    "operator-explain": true,
    "operator-retry": { claim },
    "operator-resolve-unknown": { claim },
    "operator-scan": { claim },
    runTree: { claim },
    "fork-rewind": { claim },
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
