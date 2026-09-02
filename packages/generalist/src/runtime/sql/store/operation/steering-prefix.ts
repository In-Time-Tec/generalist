import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { RuntimeUnavailable } from "../../../errors.js"
import type { Inbox } from "../../../run/event.js"
import type { RecordOperationInput } from "../../../run/store.js"
import { loadEventsAfter } from "../statements.js"

interface PendingRow {
  readonly entry_id: string
}

const sameEntries = (rows: ReadonlyArray<PendingRow>, expected: ReadonlyArray<string>): boolean =>
  rows.length === expected.length && rows.every((entry, index) => entry.entry_id === expected[index])

/** @internal Verify that an operation consumes one pending inbox lane prefix. */
export const validateSteeringPrefix = (input: RecordOperationInput) =>
  Effect.gen(function* () {
    const steeringEntryIds = input.steeringEntryIds ?? []
    if (steeringEntryIds.length === 0) return
    const sql = yield* SqlClient.SqlClient
    const pending = yield* sql<PendingRow>`
      SELECT entry_id FROM generalist_run_steering
      WHERE run_id = ${input.runId} AND consumed_operation_id IS NULL AND discarded_reason IS NULL
      ORDER BY sequence
    `
    const inbox = new Map(
      (yield* loadEventsAfter(input.runId, -1))
        .filter((event): event is Inbox => event._tag === "Inbox")
        .map((event) => [event.entryId, event]),
    )
    const first = inbox.get(steeringEntryIds[0] ?? "")
    const lane = first?.policy === "enqueue" ? "enqueue" : "steering"
    const selected = pending
      .filter((entry) => {
        const policy = inbox.get(entry.entry_id)?.policy ?? "steer"
        return (policy === "enqueue" ? "enqueue" : "steering") === lane
      })
      .slice(0, steeringEntryIds.length)
    if (!sameEntries(selected, steeringEntryIds)) {
      return yield* RuntimeUnavailable.make({ message: `${lane} entries are not the pending lane prefix` })
    }
  })
