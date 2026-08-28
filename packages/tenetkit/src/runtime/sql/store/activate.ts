import { Effect, Function } from "effect"
import { SqlClient } from "effect/unstable/sql"
import type { SqlError } from "effect/unstable/sql/SqlError"
import { RunNotFound, RuntimeUnavailable } from "../../errors.js"
import type { RunInspection } from "../../run.js"
import { loadChildReadiness } from "./child/capacity.js"
import { appendEvent, loadRun, loadRunWait } from "./statements.js"
import type { EventHub } from "../subscribers.js"

type ActivateResult = Effect.Effect<RunInspection, RunNotFound | RuntimeUnavailable | SqlError, SqlClient.SqlClient>

const inspection = (runId: string): ActivateResult =>
  Effect.gen(function* () {
    const run = yield* loadRun(runId)
    if (run === undefined) return yield* RunNotFound.make({ runId })
    const wait = yield* loadRunWait(runId, run.activeWaitId)
    const childReadiness = yield* loadChildReadiness(runId)
    const result: RunInspection = {
      runId: run.runId,
      status: run.status,
      executableRef: run.executableRef,
      executableManifest: run.executableManifest,
      depth: run.depth,
      treePolicy: run.treePolicy,
      lastSequence: run.lastSequence,
      durability: "durable",
    }
    if (run.parentRunId !== undefined) Object.assign(result, { parentRunId: run.parentRunId })
    if (childReadiness !== undefined) Object.assign(result, { childReadiness })
    if (wait !== undefined) Object.assign(result, { wait })
    return result
  })

export const activateRoot: {
  (runId: string): (hub: EventHub) => ActivateResult
  (hub: EventHub, runId: string): ActivateResult
} = Function.dual(2, (hub: EventHub, runId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const run = yield* loadRun(runId)
    if (run === undefined) return yield* RunNotFound.make({ runId })
    if (run.parentRunId !== undefined) {
      return yield* RuntimeUnavailable.make({ message: `run ${runId} is not a root` })
    }
    if (run.status !== "queued" || run.cancellationRequested) return yield* inspection(runId)
    const children = yield* sql<{ child_run_id: string }>`
      SELECT child_run_id FROM tenetkit_run_links WHERE parent_run_id = ${runId} LIMIT 1
    `
    if (children.length > 0) {
      return yield* RuntimeUnavailable.make({ message: `run ${runId} has initial children` })
    }
    const attempt = run.attempt + 1
    yield* sql`UPDATE tenetkit_runs SET attempt_fence = attempt_fence + 1 WHERE run_id = ${runId}`
    yield* appendEvent(hub, { ...run, attempt }, { _tag: "RunAttemptStarted", attempt }, "running")
    return yield* inspection(runId)
  }),
)
