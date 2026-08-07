import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { decodeJson } from "./codecs.js"
import type { FanOutInspection, FanOutMemberResult } from "../fan-out.js"
import type { RunEvent } from "../run-event.js"

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
  readonly child_run_id: string
  readonly status: FanOutMemberResult["status"]
  readonly terminal_event_id: string | null
  readonly outcome_json: string | null
}
export const loadFanOut = (fanOutId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const fanOut = (yield* sql<FanOutRow>`SELECT * FROM baton_fan_outs WHERE fan_out_id = ${fanOutId}`)[0]
    if (fanOut === undefined) return undefined
    const members = yield* sql<MemberRow>`
      SELECT * FROM baton_fan_out_members WHERE fan_out_id = ${fanOutId} ORDER BY ordinal ASC
    `
    return { fanOut, members }
  })
export const decodeMember = (row: MemberRow): FanOutMemberResult => {
  const outcome =
    row.outcome_json === null ? {} : decodeJson(Schema.Record(Schema.String, Schema.Unknown), row.outcome_json)
  return {
    ordinal: Number(row.ordinal),
    key: row.member_key,
    childRunId: row.child_run_id,
    status: row.status,
    ...(row.terminal_event_id === null ? {} : { terminalEventId: row.terminal_event_id }),
    ...(outcome.result === undefined ? {} : { result: outcome.result }),
    ...(outcome.error === undefined ? {} : { error: outcome.error }),
  }
}
export const outcomeFor = (event: RunEvent): Record<string, unknown> =>
  event._tag === "RunCompleted" ? { result: event.result } : event._tag === "RunFailed" ? { error: event.error } : {}
