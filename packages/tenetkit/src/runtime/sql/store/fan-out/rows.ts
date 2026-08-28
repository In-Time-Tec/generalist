import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { decodeJson } from "../../codec/codecs.js"
import {
  FanOutJoin,
  FanOutMemberOrigin,
  type FanOutInspection,
  type FanOutMemberResult,
} from "../../../child/fan-out.js"
import type { RunEvent } from "../../../run/event.js"
import { Prompt } from "effect/unstable/ai"
import { FanOutNotFound } from "../../../errors.js"
import type { ChildReadiness } from "../../../child/readiness.js"

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
      concurrency: loaded.fanOut.concurrency,
      members: loaded.members.map(decodeMember),
    } satisfies FanOutInspection
  })
export const decodeMember = (row: MemberRow): FanOutMemberResult => {
  const outcome =
    row.outcome_json === null ? {} : decodeJson(Schema.Record(Schema.String, Schema.Unknown), row.outcome_json)
  let member: FanOutMemberResult = {
    ordinal: row.ordinal,
    key: row.member_key,
    selection: row.selection,
    prompt: decodeJson(Prompt.Prompt, row.prompt_json),
    childRunId: row.child_run_id,
    depth: Number(row.depth),
    readiness: row.readiness,
    status: row.status,
  }
  if (row.display_label !== null) member = { ...member, label: row.display_label }
  if (row.origin_json !== null) member = { ...member, origin: decodeJson(FanOutMemberOrigin, row.origin_json) }
  if (row.terminal_event_id !== null) member = { ...member, terminalEventId: row.terminal_event_id }
  if (outcome.result !== undefined) member = { ...member, result: outcome.result }
  if (outcome.error !== undefined) member = { ...member, error: outcome.error }
  const reason = Schema.decodeUnknownOption(Schema.String)(outcome.reason)
  if (reason._tag === "Some") member = { ...member, reason: reason.value }
  return member
}
export const outcomeFor = (event: RunEvent) => {
  if (event._tag === "RunCompleted") return { result: event.result }
  if (event._tag === "RunFailed") return { error: event.error }
  if (event._tag === "RunCancelled" && event.reason !== undefined) return { reason: event.reason }
  return {}
}
