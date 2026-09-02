import { DateTime, Effect, Function } from "effect"
import { SqlClient } from "effect/unstable/sql"
import type { SqlError } from "effect/unstable/sql/SqlError"
import {
  AwaitEventResult,
  WakeEvent as WakeEventSchema,
  matches,
  type WakeEvent,
} from "../../../../core/agent/tools/wake-event.js"
import { RunNotFound, RunTerminal, RuntimeUnavailable } from "../../../errors.js"
import { isTerminal } from "../../../run.js"
import type { WaitResolution } from "../../../run/wait.js"
import type { DueAwaitEvent, WakeDisposition } from "../../../execution/trigger/wake.js"
import { encodeJson } from "../../codec/codecs.js"
import type { DecodedRun } from "../../codec/rows.js"
import type { EventHub } from "../../subscribers.js"
import { appendEvent, loadRun, loadRunWait, loadRunWaitsByStatus, transitionRunWait } from "../statements.js"

const iso = (millis: number): string => DateTime.formatIso(DateTime.makeUnsafe(millis))

const eventResolution = (event: WakeEvent): WaitResolution => {
  const result: AwaitEventResult = { _tag: "Event", event }
  return { _tag: "ToolResult", result, encodedResult: result }
}

const timeoutResolution = (deadline: string): WaitResolution => {
  const result: AwaitEventResult = { _tag: "TimedOut", deadline }
  return { _tag: "ToolResult", result, encodedResult: result }
}

const requireLiveRun = (
  runId: string,
): Effect.Effect<DecodedRun, RunNotFound | RunTerminal | RuntimeUnavailable | SqlError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const run = yield* loadRun(runId)
    if (run === undefined) return yield* RunNotFound.make({ runId })
    if (isTerminal(run.status)) return yield* RunTerminal.make({ runId, status: run.status })
    return run
  })

interface WakeInput {
  readonly runId: string
  readonly event: WakeEvent
  readonly now: number
}

type WakeEffect = Effect.Effect<
  WakeDisposition,
  RunNotFound | RunTerminal | RuntimeUnavailable | SqlError,
  SqlClient.SqlClient
>

export const wake: {
  (input: WakeInput): (hub: EventHub) => WakeEffect
  (hub: EventHub, input: WakeInput): WakeEffect
} = Function.dual(2, (hub: EventHub, input: WakeInput) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    let run = yield* requireLiveRun(input.runId)
    const prior = yield* sql<{ readonly dedupe_key: string }>`
      SELECT dedupe_key FROM generalist_run_wake_events
      WHERE run_id = ${input.runId} AND dedupe_key = ${input.event.dedupeKey}
    `
    if (prior.length > 0) {
      yield* appendEvent(hub, run, { _tag: "Duplicate", dedupeKey: input.event.dedupeKey })
      return { _tag: "Duplicate" }
    }
    yield* sql`
      INSERT INTO generalist_run_wake_events (run_id, dedupe_key, event_json, received_at)
      VALUES (${input.runId}, ${input.event.dedupeKey}, ${encodeJson(WakeEventSchema, input.event)}, ${iso(input.now)})
    `
    yield* appendEvent(hub, run, { _tag: "WakeReceived", event: input.event })
    run = (yield* loadRun(input.runId))!
    const wait = (yield* loadRunWaitsByStatus(input.runId, "open")).find(
      (candidate) => candidate.reason._tag === "AwaitEvent" && matches(candidate.reason.filter, input.event),
    )
    if (wait === undefined) return { _tag: "Ignored" }
    const resolution = eventResolution(input.event)
    const affected = yield* transitionRunWait({
      runId: input.runId,
      waitId: wait.waitId,
      status: "responded",
      resolution,
      closedAt: iso(input.now),
    })
    if (affected !== 1) return { _tag: "Ignored" }
    yield* appendEvent(hub, run, { _tag: "RunResumed", waitId: wait.waitId, resolution }, "running")
    return { _tag: "Resumed", waitId: wait.waitId }
  }),
)

export const dueAwaitEvents = (input: {
  readonly now: number
  readonly limit: number
}): Effect.Effect<ReadonlyArray<DueAwaitEvent>, SqlError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<{
      readonly run_id: string
      readonly wait_id: string
      readonly due_at: string | Date
    }>`
      SELECT run_id, wait_id, due_at FROM generalist_run_waits
      WHERE status = 'open' AND due_at IS NOT NULL AND due_at <= ${iso(input.now)}
      ORDER BY due_at ASC, run_id ASC, wait_id ASC
      LIMIT ${input.limit}
    `
    return rows.map((row) => ({
      runId: row.run_id,
      waitId: row.wait_id,
      deadline: DateTime.formatIso(DateTime.makeUnsafe(row.due_at)),
    }))
  })

type TimeoutAwaitEventInput = DueAwaitEvent & { readonly now: number }
type TimeoutAwaitEventEffect = Effect.Effect<
  boolean,
  RunNotFound | RunTerminal | RuntimeUnavailable | SqlError,
  SqlClient.SqlClient
>

export const timeoutAwaitEvent: {
  (input: TimeoutAwaitEventInput): (hub: EventHub) => TimeoutAwaitEventEffect
  (hub: EventHub, input: TimeoutAwaitEventInput): TimeoutAwaitEventEffect
} = Function.dual(2, (hub: EventHub, input: TimeoutAwaitEventInput) =>
  Effect.gen(function* () {
    const run = yield* requireLiveRun(input.runId)
    const wait = yield* loadRunWait(input.runId, input.waitId)
    if (
      wait?.status !== "open" ||
      wait.reason._tag !== "AwaitEvent" ||
      wait.reason.deadline !== input.deadline ||
      DateTime.toEpochMillis(DateTime.makeUnsafe(wait.reason.deadline)) > input.now
    ) {
      return false
    }
    const resolution = timeoutResolution(input.deadline)
    const affected = yield* transitionRunWait({
      runId: input.runId,
      waitId: input.waitId,
      status: "responded",
      resolution,
      closedAt: iso(input.now),
    })
    if (affected !== 1) return false
    yield* appendEvent(hub, run, { _tag: "TimedOut", waitId: input.waitId, deadline: input.deadline })
    yield* appendEvent(
      hub,
      (yield* loadRun(input.runId))!,
      { _tag: "RunResumed", waitId: input.waitId, resolution },
      "running",
    )
    return true
  }),
)
