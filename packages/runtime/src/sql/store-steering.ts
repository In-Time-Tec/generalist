import { Effect, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import { SqlClient } from "effect/unstable/sql"
import { RunNotFound, RunTerminal, SteeringConflict } from "../errors.js"
import { isTerminal } from "../run.js"
import type { AdmitSteeringInput, ExecutionClaim } from "../run-store.js"
import { encodeContinuation, type ExecutionContinuation, type SteeringEntry } from "../steering.js"
import type { ExecutionResult } from "../execution-state.js"
import { loadRun } from "./store-helpers.js"
import { decodeJson, encodeJson } from "./codecs.js"

interface SteeringRow {
  readonly entry_id: string
  readonly run_id: string
  readonly sequence: number | string
  readonly idempotency_key: string
  readonly digest: string
  readonly prompt_json: string
}

const decode = (row: SteeringRow): SteeringEntry => ({
  entryId: row.entry_id,
  runId: row.run_id,
  sequence: Number(row.sequence),
  idempotencyKey: row.idempotency_key,
  digest: row.digest,
  prompt: decodeJson(Prompt.Prompt, row.prompt_json),
})

export const admitSteering = (input: AdmitSteeringInput) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const run = yield* loadRun(input.runId)
    if (run === undefined) return yield* RunNotFound.make({ runId: input.runId })
    const existing = yield* sql<SteeringRow>`
      SELECT * FROM baton_run_steering
      WHERE run_id = ${input.runId} AND idempotency_key = ${input.idempotencyKey}
    `
    const prior = existing[0]
    if (prior !== undefined) {
      if (prior.digest === input.digest) return
      return yield* SteeringConflict.make({ runId: input.runId, idempotencyKey: input.idempotencyKey })
    }
    if (isTerminal(run.status) || run.pendingOutcome !== undefined) {
      const status = isTerminal(run.status)
        ? run.status
        : run.pendingOutcome?._tag === "Completed"
          ? "succeeded"
          : "failed"
      return yield* RunTerminal.make({ runId: run.runId, status })
    }
    const rows = yield* sql<{ next_sequence: number | string }>`
      SELECT COALESCE(MAX(sequence), -1) + 1 AS next_sequence
      FROM baton_run_steering WHERE run_id = ${input.runId}
    `
    const sequence = Number(rows[0]?.next_sequence ?? 0)
    const encoded = encodeJson(Prompt.Prompt, input.prompt)
    yield* sql`
      INSERT INTO baton_run_steering (
        entry_id, run_id, sequence, idempotency_key, digest, prompt_json, consumed_operation_id
      ) VALUES (
        ${`${input.runId}:steering:${sequence}`}, ${input.runId}, ${sequence}, ${input.idempotencyKey},
        ${input.digest}, ${encoded}, NULL
      )
    `
  })

const readPendingSteering = (runId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<SteeringRow>`
      SELECT * FROM baton_run_steering
      WHERE run_id = ${runId} AND consumed_operation_id IS NULL
      ORDER BY sequence
    `
    return rows.map(decode)
  })

export const readSteering = (input: ExecutionClaim) => readPendingSteering(input.runId)

export const saveCompletionContinuation = (runId: string, result: ExecutionResult) =>
  Effect.gen(function* () {
    if (!("transcript" in result)) return undefined
    const run = yield* loadRun(runId)
    if (run?.cancellationRequested === true) return undefined
    const sql = yield* SqlClient.SqlClient
    const entries = yield* readPendingSteering(runId)
    const continuation: ExecutionContinuation | undefined =
      entries.length === 0
        ? undefined
        : {
            schemaVersion: 1,
            prompt: entries.reduce<Prompt.Prompt>((prompt, entry) => Prompt.concat(prompt, entry.prompt), Prompt.empty),
            history: result.transcript,
            nextTurn: result.turns,
            steeringEntryIds: entries.map((entry) => entry.entryId),
          }
    yield* sql`
      UPDATE baton_runs SET
        transcript_json = ${encodeJson(Prompt.Prompt, result.transcript)},
        continuation_json = ${continuation === undefined ? null : encodeContinuation(continuation)}
      WHERE run_id = ${runId}
    `
    return continuation
  })
