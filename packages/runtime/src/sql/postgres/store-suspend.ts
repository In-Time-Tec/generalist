import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { RuntimeUnavailable, RunTerminal } from "../../errors.js"
import { checkpointRef } from "../../executable-manifest.js"
import { isTerminal } from "../../run.js"
import type { Interface as RunStoreInterface } from "../../run-store.js"
import { encodeContinuation } from "../../steering.js"
import { encodeExecutableRef } from "../codecs.js"
import type { EventHub } from "../subscribers.js"
import { appendEvent, lockRun, requireRun } from "./pg-helpers.js"
import { requireExecutionClaim } from "../store-execution.js"

export const suspend = (hub: EventHub, input: Parameters<RunStoreInterface["suspend"]>[0]) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* lockRun(input.runId)
    yield* requireExecutionClaim(input)
    const loaded = yield* requireRun(input.runId)
    if (isTerminal(loaded.status)) {
      return yield* RunTerminal.make({ runId: loaded.runId, status: loaded.status })
    }
    if (loaded.cancellationRequested) return
    const executableRef = yield* Effect.try({
      try: () => checkpointRef(loaded.executableRef, loaded.executableManifest, input.checkpoint),
      catch: (error) => RuntimeUnavailable.make({ message: String(error) }),
    })
    yield* sql`
      UPDATE baton_runs SET
        driver_checkpoint_json = COALESCE(${input.checkpoint === undefined ? null : JSON.stringify(input.checkpoint)}, driver_checkpoint_json),
        executable_ref_json = ${encodeExecutableRef(executableRef)},
        suspension_json = ${JSON.stringify(input.suspension)},
        transcript_json = COALESCE(${input.transcript === undefined ? null : JSON.stringify(input.transcript)}, transcript_json),
        continuation_json = CASE WHEN ${input.continuation === undefined ? 0 : 1} = 1
          THEN ${input.continuation === null || input.continuation === undefined ? null : encodeContinuation(input.continuation)}
          ELSE continuation_json END,
        updated_at = NOW()
      WHERE run_id = ${input.runId}
    `
    yield* sql`
      INSERT INTO baton_run_waits (
        run_id, wait_id, reason, status, response_json, due_at, owner_worker_id, lease_expires_at, opened_at, closed_at
      ) VALUES (
        ${loaded.runId}, ${input.wait.waitId}, ${input.wait.reason}, 'open', NULL, NULL, NULL, NULL, NOW(), NULL
      )
      ON CONFLICT (run_id, wait_id) DO UPDATE SET
        status = 'open', reason = EXCLUDED.reason, response_json = NULL, opened_at = EXCLUDED.opened_at, closed_at = NULL
    `
    yield* appendEvent(hub, loaded, { _tag: "RunWaiting", wait: input.wait }, "waiting")
    yield* sql`UPDATE baton_runs SET owner_worker_id = NULL, lease_expires_at = NULL WHERE run_id = ${loaded.runId}`
  })
