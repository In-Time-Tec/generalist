import { Effect, Function } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { RunNotFound, RunTerminal, RuntimeUnavailable } from "../../errors.js"
import { StaleClaim } from "../errors.js"
import type { SqlError } from "effect/unstable/sql/SqlError"
import { checkpointRef } from "../../executable-manifest.js"
import { isTerminal } from "../../run.js"
import type { Interface as RunStoreInterface } from "../../run-store.js"
import { encodeContinuation } from "../../steering.js"
import { encodeExecutableRef, encodeJson } from "../codecs.js"
import type { EventHub } from "../subscribers.js"
import { encodeReason, WaitResolution } from "../../run-wait.js"
import { lockRun } from "./locks.js"
import { appendEvent, requireRun } from "./pg-helpers.js"
import { requireExecutionClaim } from "../store-execution.js"
import { groupIdFromSuspension, resultFromInspection } from "../../child-group.js"
import { inspectFanOut } from "../store-fan-out.js"
import { ExecutionCheckpoint, ExecutionSuspension } from "../../execution-state.js"

type SuspendEffect = Effect.Effect<
  undefined,
  RunNotFound | RunTerminal | RuntimeUnavailable | SqlError | StaleClaim,
  SqlClient.SqlClient
>

export const suspend: {
  (input: Parameters<RunStoreInterface["suspend"]>[0]): (hub: EventHub) => SuspendEffect
  (hub: EventHub, input: Parameters<RunStoreInterface["suspend"]>[0]): SuspendEffect
} = Function.dual(2, (hub: EventHub, input: Parameters<RunStoreInterface["suspend"]>[0]) =>
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
        driver_checkpoint_json = COALESCE(${input.checkpoint === undefined ? null : encodeJson(ExecutionCheckpoint, input.checkpoint)}, driver_checkpoint_json),
        executable_ref_json = ${encodeExecutableRef(executableRef)},
        suspension_json = ${encodeJson(ExecutionSuspension, input.suspension)},
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
        ${loaded.runId}, ${input.wait.waitId}, ${encodeReason(input.wait.reason)}, 'open', NULL, NULL, NULL, NULL, NOW(), NULL
      )
      ON CONFLICT (run_id, wait_id) DO UPDATE SET
        status = 'open', reason = EXCLUDED.reason, response_json = NULL, opened_at = EXCLUDED.opened_at, closed_at = NULL
    `
    yield* appendEvent(hub, loaded, { _tag: "RunWaiting", wait: input.wait }, "waiting")
    const groupId = groupIdFromSuspension(input.suspension)
    if (groupId !== undefined) {
      const rows = yield* sql<{ parent_run_id: string; status: string }>`
        SELECT parent_run_id, status FROM baton_fan_outs WHERE fan_out_id = ${groupId}
      `
      const group = rows[0]
      if (group?.parent_run_id === loaded.runId && group.status !== "running") {
        const resolution = {
          _tag: "Signal" as const,
          name: input.wait.waitId,
          payload: resultFromInspection(
            yield* inspectFanOut(groupId).pipe(
              Effect.mapError(() => RuntimeUnavailable.make({ message: `child group ${groupId} disappeared` })),
            ),
          ),
        }
        yield* sql`
          UPDATE baton_run_waits SET status = 'signaled', response_json = ${encodeJson(WaitResolution, resolution)}, closed_at = NOW()
          WHERE run_id = ${loaded.runId} AND wait_id = ${input.wait.waitId} AND status = 'open'
        `
        yield* appendEvent(
          hub,
          yield* requireRun(loaded.runId),
          { _tag: "RunResumed", waitId: input.wait.waitId, resolution },
          "running",
        )
      }
    }
    yield* sql`UPDATE baton_runs SET owner_worker_id = NULL, lease_expires_at = NULL WHERE run_id = ${loaded.runId}`
  }),
)
