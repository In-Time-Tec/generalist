import { Effect, Function, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import type { SqlError } from "effect/unstable/sql/SqlError"
import { RunNotFound, RuntimeUnavailable } from "../errors.js"
import type { CommitInterruptedModelResponseInput } from "../model-response-interrupted.js"
import {
  sameInterruptedModelOutcome,
  sameInterruptedModelResponse,
  validateInterruptedModelResponse,
} from "../model-response-interrupted.js"
import { appendInterruptedSessionEntry, verifyInterruptedSessionEntry } from "./session-store.js"
import type { OperationRecord } from "./operations.js"
import type { OperationRow } from "./rows.js"
import { appendEvent, loadEventsAfter, loadRun, nowIso, toOperationRecord } from "./store-helpers.js"
import type { EventHub } from "./subscribers.js"
import { encodeJsonValue } from "./codecs.js"

type CompleteEffect = Effect.Effect<OperationRecord, RunNotFound | RuntimeUnavailable | SqlError, SqlClient.SqlClient>

const requireRun = (runId: string) =>
  loadRun(runId).pipe(
    Effect.flatMap((run) => (run === undefined ? Effect.fail(RunNotFound.make({ runId })) : Effect.succeed(run))),
  )

export const commitInterruptedModelResponse: {
  (input: CommitInterruptedModelResponseInput): (hub: EventHub) => CompleteEffect
  (hub: EventHub, input: CommitInterruptedModelResponseInput): CompleteEffect
} = Function.dual(2, (hub: EventHub, input: CommitInterruptedModelResponseInput) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const run = yield* requireRun(input.runId)
    const rows = yield* sql<OperationRow>`
      SELECT * FROM baton_run_operations WHERE run_id = ${input.runId} AND operation_id = ${input.operationId}
    `
    const row = rows[0]
    if (row === undefined) return yield* RuntimeUnavailable.make({ message: "operation missing" })
    const current = toOperationRecord(row)
    const validated = validateInterruptedModelResponse({
      runId: input.runId,
      sessionId: run.message.sessionId,
      record: current,
      outcome: input.outcome,
      event: input.event,
    })
    if (Schema.is(RuntimeUnavailable)(validated)) return yield* validated
    const sessionEntry = validated.entry
    if (current.status === "failed") {
      if (!sameInterruptedModelOutcome({ left: { _tag: "Failed", error: current.error }, right: input.outcome })) {
        return yield* RuntimeUnavailable.make({
          message: `model operation ${input.operationId} has a divergent interrupted outcome retry`,
        })
      }
      const prior = (yield* loadEventsAfter(input.runId, -1)).filter(
        (event) => event._tag === "ModelResponseInterrupted" && event.operationKey === input.event.operationKey,
      )
      if (
        prior.length !== 1 ||
        prior[0]?._tag !== "ModelResponseInterrupted" ||
        !sameInterruptedModelResponse({ left: prior[0], right: validated.event })
      ) {
        return yield* RuntimeUnavailable.make({
          message: `model operation ${input.operationId} has a divergent interrupted outbox retry`,
        })
      }
      yield* verifyInterruptedSessionEntry(sessionEntry).pipe(
        Effect.mapError((error) => RuntimeUnavailable.make({ message: error.message })),
      )
      return current
    }
    if (current.status !== "running") {
      return yield* RuntimeUnavailable.make({
        message: `model operation ${input.operationId} cannot commit an interruption from ${current.status}`,
      })
    }
    yield* appendInterruptedSessionEntry(sessionEntry).pipe(
      Effect.mapError((error) => RuntimeUnavailable.make({ message: error.message })),
    )
    const finished = yield* nowIso
    yield* sql`
      UPDATE baton_run_operations
      SET status = 'failed', error_json = ${encodeJsonValue(input.outcome.error)}, finished_at = ${finished}
      WHERE run_id = ${input.runId} AND operation_id = ${input.operationId}
        AND status IN ('requested', 'running')
    `
    yield* appendEvent(
      hub,
      yield* requireRun(input.runId),
      validated.event as unknown as { readonly _tag: string } & Record<string, unknown>,
    )
    const completed = yield* sql<OperationRow>`
      SELECT * FROM baton_run_operations WHERE run_id = ${input.runId} AND operation_id = ${input.operationId}
    `
    return toOperationRecord(completed[0]!)
  }),
)
