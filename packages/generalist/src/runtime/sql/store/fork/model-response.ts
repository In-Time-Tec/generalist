import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { RuntimeUnavailable } from "../../../errors.js"
import {
  completedOperationRefValue,
  retargetCompletedOperationRef,
  validateCompletedOperationSource,
} from "../../../execution/model-response/commit.js"
import { ForkCheckpoint } from "../../../execution/recovery/fork-checkpoint.js"
import { encode as encodeBounded, maximumEventBytes } from "../../../execution/payload/index.js"
import { decodeEvent, decodeJsonValue, encodeEvent, encodeJsonValue } from "../../codec/codecs.js"
import type { EventRow, OperationRow } from "../../codec/rows.js"
import { type EntryRow, SessionStorage } from "../../session/storage.js"

/** Copy authenticated source bytes and issue branch-local references inside the fork transaction. */
export const copyModelResponse = (input: {
  readonly runId: string
  readonly newRunId: string
  readonly targetSessionId: string
  readonly row: OperationRow
}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const { row, targetSessionId } = input
    if (row.result_json === null)
      return yield* RuntimeUnavailable.make({ message: "copied model operation has no result" })
    const persisted = completedOperationRefValue(decodeJsonValue(row.result_json))
    if (persisted === undefined)
      return yield* RuntimeUnavailable.make({ message: "copied model operation has an invalid completed reference" })
    const entryRows = yield* sql<EntryRow>`
    SELECT entry_id, parent_id, seq, tag, payload_json FROM generalist_session_entries
    WHERE session_id = ${persisted.sessionId} AND entry_id = ${persisted.sessionEntryId}
  `
    const sourceEntry = entryRows[0] === undefined ? undefined : SessionStorage.toEntry(entryRows[0])
    const sourceEventRows = yield* sql<EventRow>`
    SELECT * FROM generalist_run_events WHERE run_id = ${input.runId} AND sequence = ${row.completed_sequence}
  `
    const sourceEvent = sourceEventRows[0] === undefined ? undefined : decodeEvent(sourceEventRows[0].event_json)
    const content = validateCompletedOperationSource({
      value: persisted,
      sessionId: persisted.sessionId,
      operationKey: row.operation_key,
      entry: sourceEntry,
      event: sourceEvent?._tag === "ModelResponseCommitted" ? sourceEvent : undefined,
    })
    if ("_tag" in content) return yield* content
    const reference = retargetCompletedOperationRef({
      value: persisted,
      sessionId: targetSessionId,
      operationId: ForkCheckpoint.forkOperationKey(row.operation_key, input.runId, input.newRunId),
      content,
    })
    if (Schema.is(RuntimeUnavailable)(reference)) return yield* reference
    yield* sql`
    UPDATE generalist_session_entries SET payload_json = ${yield* SessionStorage.fromEntry({
      ...sourceEntry!,
      metadata: { ...sourceEntry!.metadata, modelResponseDigest: reference.digest },
    }).pipe(Effect.mapError((error) => RuntimeUnavailable.make({ message: error.message })))}
    WHERE session_id = ${targetSessionId} AND entry_id = ${sourceEntry!.id}
  `
    const eventRows = yield* sql<EventRow>`
    SELECT * FROM generalist_run_events WHERE run_id = ${input.newRunId} AND sequence = ${row.completed_sequence}
  `
    const event = eventRows[0] === undefined ? undefined : decodeEvent(eventRows[0].event_json)
    if (event?._tag === "ModelResponseCommitted") {
      yield* sql`
      UPDATE generalist_run_events SET event_json = ${yield* encodeBounded({ value: { ...event, digest: reference.digest }, boundary: "fork event", serialize: encodeEvent, limit: maximumEventBytes })}
      WHERE run_id = ${input.newRunId} AND sequence = ${row.completed_sequence}
    `
    }
    return encodeJsonValue(reference)
  })
