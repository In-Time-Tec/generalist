import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { decodeJson } from "./codecs.js"
import { FanOutJoin, FanOutMemberOrigin, type FanOutInspection, type FanOutMemberResult } from "../fan-out.js"
import type { RunEvent } from "../run-event.js"
import { Prompt } from "effect/unstable/ai"
import { FanOutNotFound } from "../errors.js"
import type { ChildReadiness } from "../child-readiness.js"

export interface FanOutRow {
  readonly fan_out_id: string
  readonly parent_run_id: string
  readonly idempotency_key: string
  readonly input_digest: string
  readonly join_json: string
  readonly remainder: FanOutInspection["remainder"]
  readonly concurrency: number
  readonly status: FanOutInspection["status"]
}
export interface MemberRow {
  readonly ordinal: number
  readonly member_key: string
  readonly selection: string
  readonly display_label: string | null
  readonly prompt_json: string
  readonly origin_json: string | null
  readonly child_run_id: string
  readonly depth: number | string
  readonly readiness: ChildReadiness
  readonly status: FanOutMemberResult["status"]
  readonly terminal_event_id: string | null
  readonly outcome_json: string | null
}
export const loadFanOut = (fanOutId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const fanOut = (yield* sql<FanOutRow>`SELECT * FROM tenetkit_fan_outs WHERE fan_out_id = ${fanOutId}`)[0]
    if (fanOut === undefined) return undefined
    const members = yield* sql<MemberRow>`
      SELECT m.*, l.readiness
      FROM tenetkit_fan_out_members m
      JOIN tenetkit_run_links l ON l.child_run_id = m.child_run_id
      WHERE m.fan_out_id = ${fanOutId}
      ORDER BY m.ordinal ASC
    `
    return { fanOut, members }
  })
export const inspectFanOut = (fanOutId: string) =>
  Effect.gen(function* () {
    const loaded = yield* loadFanOut(fanOutId)
    if (loaded === undefined) return yield* FanOutNotFound.make({ fanOutId })
    return {
      fanOutId: loaded.fanOut.fan_out_id,
      parentRunId: loaded.fanOut.parent_run_id,
      idempotencyKey: loaded.fanOut.idempotency_key,
      status: loaded.fanOut.status,
      join: decodeJson(FanOutJoin, loaded.fanOut.join_json),
      remainder: loaded.fanOut.remainder,
      concurrency: Number(loaded.fanOut.concurrency),
      members: loaded.members.map(decodeMember),
    } satisfies FanOutInspection
  })
export const decodeMember = (row: MemberRow): FanOutMemberResult => {
  const outcome =
    row.outcome_json === null ? {} : decodeJson(Schema.Record(Schema.String, Schema.Unknown), row.outcome_json)
  return {
    ordinal: Number(row.ordinal),
    key: row.member_key,
    selection: row.selection,
    ...(row.display_label === null ? {} : { label: row.display_label }),
    prompt: decodeJson(Prompt.Prompt, row.prompt_json),
    ...(row.origin_json === null ? {} : { origin: decodeJson(FanOutMemberOrigin, row.origin_json) }),
    childRunId: row.child_run_id,
    depth: Number(row.depth),
    readiness: row.readiness,
    status: row.status,
    ...(row.terminal_event_id === null ? {} : { terminalEventId: row.terminal_event_id }),
    ...(outcome.result === undefined ? {} : { result: outcome.result }),
    ...(outcome.error === undefined ? {} : { error: outcome.error }),
    ...(typeof outcome.reason === "string" ? { reason: outcome.reason } : {}),
  }
}
export const outcomeFor = (event: RunEvent): Record<string, unknown> =>
  event._tag === "RunCompleted"
    ? { result: event.result }
    : event._tag === "RunFailed"
      ? { error: event.error }
      : event._tag === "RunCancelled" && event.reason !== undefined
        ? { reason: event.reason }
        : {}
