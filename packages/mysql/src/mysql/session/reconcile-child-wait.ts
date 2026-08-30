import { DateTime, Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { ownsChildSuspension, resultFromChildEvent } from "tenetkit/runtime/driver/child/group"
import { isTerminal } from "tenetkit/runtime/driver/run"
import type { RunEvent } from "tenetkit/runtime/driver/run/event"
import { encodeJson } from "tenetkit/runtime/driver/sql/codec/codecs"
import type { DecodedRun } from "tenetkit/runtime/driver/sql/codec/rows"
import { appendEvent } from "tenetkit/runtime/driver/sql/run-store"
import type { EventHub } from "tenetkit/runtime/driver/sql/subscribers"
import { WaitResolution } from "tenetkit/runtime/driver/run/wait"

export const reconcileChildWait = (input: {
  readonly hub: EventHub
  readonly parent: DecodedRun
  readonly child: DecodedRun
  readonly event: RunEvent
}) =>
  Effect.gen(function* () {
    if (
      isTerminal(input.parent.status) ||
      input.parent.cancellationRequested ||
      input.parent.activeWaitId === undefined ||
      (input.event._tag !== "RunCompleted" &&
        input.event._tag !== "RunFailed" &&
        input.event._tag !== "RunCancelled") ||
      !ownsChildSuspension({
        parentRunId: input.parent.runId,
        waitId: input.parent.activeWaitId,
        childRunId: input.child.runId,
        metadata: input.child.message.metadata,
        suspension: input.parent.suspension,
      })
    ) {
      return
    }
    const sql = yield* SqlClient.SqlClient
    const wait = (yield* sql<{ status: string }>`
      SELECT status FROM tenetkit_run_waits
      WHERE run_id = ${input.parent.runId} AND wait_id = ${input.parent.activeWaitId}
    `)[0]
    if (wait?.status !== "open") return
    const result = resultFromChildEvent({
      childRunId: input.child.runId,
      metadata: input.child.message.metadata,
      event: input.event,
    })
    const resolution = { _tag: "ToolResult" as const, result, encodedResult: result }
    const closedAt = yield* DateTime.now.pipe(Effect.map(DateTime.formatIso))
    yield* sql`
      UPDATE tenetkit_run_waits
      SET status = 'responded', response_json = ${encodeJson(WaitResolution, resolution)}, closed_at = ${closedAt}
      WHERE run_id = ${input.parent.runId} AND wait_id = ${input.parent.activeWaitId} AND status = 'open'
    `
    yield* appendEvent(
      input.hub,
      input.parent,
      { _tag: "RunResumed", waitId: input.parent.activeWaitId, resolution },
      "running",
    )
  })
