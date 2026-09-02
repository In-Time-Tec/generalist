import { Effect, Function } from "effect"
import { Prompt } from "effect/unstable/ai"
import { SqlClient } from "effect/unstable/sql"
import { InboxFull, defaultCapacity, defaultMaxPendingBytes } from "../../../../core/turn/steering.js"
import { RunBusy, RunNotFound, RunTerminal, RuntimeUnavailable, SteeringConflict } from "../../../errors.js"
import { isTerminal, type RunStatus } from "../../../run.js"
import type { AdmitSteeringInput, ExecutionClaim, PendingRunOutcome, SteeringAdmission } from "../../../run/store.js"
import { encodeContinuation, type ExecutionContinuation, type SteeringEntry } from "../../../run/steering.js"
import type { SqlError } from "effect/unstable/sql/SqlError"
import type { ExecutionResult } from "../../../execution/state.js"
import { appendEvent, loadEventsAfter, loadRun, lockRun } from "../statements.js"
import { decodeJson, encodeJson } from "../../codec/codecs.js"
import type { EventHub } from "../../subscribers.js"
import type { Inbox } from "../../../run/event.js"

interface SteeringRow {
  readonly entry_id: string
  readonly run_id: string
  readonly sequence: number | string
  readonly idempotency_key: string
  readonly digest: string
  readonly prompt_json: string
}

const decode = (row: SteeringRow, inbox: Inbox | undefined): SteeringEntry => ({
  entryId: row.entry_id,
  runId: row.run_id,
  sequence: Number(row.sequence),
  idempotencyKey: row.idempotency_key,
  digest: row.digest,
  prompt: decodeJson(Prompt.Prompt, row.prompt_json),
  policy: inbox?.policy ?? "steer",
  from: inbox?.from ?? { system: true },
  ...(inbox?.addressed === undefined ? undefined : { addressed: inbox.addressed }),
})

type AdmitSteeringEffect = Effect.Effect<
  SteeringAdmission,
  RunNotFound | RunTerminal | RunBusy | RuntimeUnavailable | SteeringConflict | InboxFull | SqlError,
  SqlClient.SqlClient
>

const terminalStatus = (run: {
  readonly status: RunStatus
  readonly pendingOutcome?: PendingRunOutcome | undefined
}): "succeeded" | "failed" | "cancelled" => {
  if (run.status === "succeeded" || run.status === "failed" || run.status === "cancelled") return run.status
  return run.pendingOutcome?._tag === "Completed" ? "succeeded" : "failed"
}

export const admitSteering: {
  (input: AdmitSteeringInput): (hub: EventHub) => AdmitSteeringEffect
  (hub: EventHub, input: AdmitSteeringInput): AdmitSteeringEffect
} = Function.dual(2, (hub: EventHub, input: AdmitSteeringInput) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* lockRun(input.runId)
    const run = yield* loadRun(input.runId)
    if (run === undefined) return yield* RunNotFound.make({ runId: input.runId })
    const existing = yield* sql<SteeringRow>`
      SELECT * FROM generalist_run_steering
      WHERE run_id = ${input.runId} AND idempotency_key = ${input.idempotencyKey}
    `
    const prior = existing[0]
    if (prior !== undefined) {
      if (prior.digest === input.digest) {
        return {
          receipt: { entryId: prior.entry_id, sequence: Number(prior.sequence) },
          duplicate: true,
        } satisfies SteeringAdmission
      }
      return yield* SteeringConflict.make({ runId: input.runId, idempotencyKey: input.idempotencyKey })
    }
    if (input.policy === "reject" && run.ownerWorkerId !== undefined) return yield* RunBusy.make({ runId: run.runId })
    if (isTerminal(run.status) || run.pendingOutcome !== undefined) {
      return yield* RunTerminal.make({ runId: run.runId, status: terminalStatus(run) })
    }
    const pending = yield* sql<Pick<SteeringRow, "prompt_json">>`
      SELECT prompt_json FROM generalist_run_steering
      WHERE run_id = ${input.runId} AND consumed_operation_id IS NULL AND discarded_reason IS NULL
    `
    if (pending.length >= defaultCapacity) {
      return yield* InboxFull.make({
        runId: run.runId,
        queue: "steering",
        dimension: "entries",
        limit: defaultCapacity,
      })
    }
    const encoder = new TextEncoder()
    const pendingBytes = pending.reduce((total, row) => total + encoder.encode(row.prompt_json).byteLength, 0)
    const rows = yield* sql<{ next_sequence: number | string }>`
      SELECT COALESCE(MAX(sequence), -1) + 1 AS next_sequence
      FROM generalist_run_steering WHERE run_id = ${input.runId}
    `
    const sequence = Number(rows[0]?.next_sequence ?? 0)
    const entryId = `${input.runId}:steering:${sequence}`
    const encoded = encodeJson(Prompt.Prompt, input.prompt)
    if (pendingBytes + encoder.encode(encoded).byteLength > defaultMaxPendingBytes) {
      return yield* InboxFull.make({
        runId: run.runId,
        queue: "steering",
        dimension: "bytes",
        limit: defaultMaxPendingBytes,
      })
    }
    yield* sql`
      INSERT INTO generalist_run_steering (
        entry_id, run_id, sequence, idempotency_key, digest, prompt_json, consumed_operation_id, discarded_reason
      ) VALUES (
        ${entryId}, ${input.runId}, ${sequence}, ${input.idempotencyKey}, ${input.digest}, ${encoded}, NULL, NULL
      )
    `
    yield* appendEvent(hub, run, {
      _tag: "Inbox",
      entryId,
      inboxSequence: sequence,
      idempotencyKey: input.idempotencyKey,
      digest: input.digest,
      message: input.prompt,
      policy: input.policy,
      from: input.from,
      ...(input.addressed === undefined ? undefined : { addressed: input.addressed }),
    })
    return { receipt: { entryId, sequence }, duplicate: false } satisfies SteeringAdmission
  }),
)

export const readPendingSteering = (runId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<SteeringRow>`
      SELECT * FROM generalist_run_steering
      WHERE run_id = ${runId} AND consumed_operation_id IS NULL AND discarded_reason IS NULL
      ORDER BY sequence
    `
    const inbox = new Map(
      (yield* loadEventsAfter(runId, -1))
        .filter((event): event is Inbox => event._tag === "Inbox")
        .map((event) => [event.entryId, event]),
    )
    return rows.map((row) => decode(row, inbox.get(row.entry_id)))
  })

export const readSteering = (input: ExecutionClaim) => readPendingSteering(input.runId)

type ContinuationEffect = Effect.Effect<
  ExecutionContinuation | undefined,
  RuntimeUnavailable | SqlError,
  SqlClient.SqlClient
>

export const saveCompletionContinuation: {
  (runId: string, result: ExecutionResult): ContinuationEffect
  (result: ExecutionResult): (runId: string) => ContinuationEffect
} = Function.dual(2, (runId: string, result: ExecutionResult) =>
  Effect.gen(function* () {
    if (!("session" in result)) return undefined
    const run = yield* loadRun(runId)
    if (run?.cancellationRequested === true) return undefined
    const sql = yield* SqlClient.SqlClient
    const entries = yield* readPendingSteering(runId)
    const followUp = entries.filter((entry) => entry.policy === "enqueue")
    const selected = followUp.length > 0 ? followUp : entries.filter((entry) => entry.policy !== "enqueue")
    const continuation: ExecutionContinuation | undefined =
      selected.length === 0
        ? undefined
        : {
            schemaVersion: 1,
            prompt: selected.reduce<Prompt.Prompt>(
              (prompt, entry) => Prompt.concat(prompt, entry.prompt),
              Prompt.empty,
            ),
            nextTurn: result.turns,
            steeringEntryIds: selected.map((entry) => entry.entryId),
          }
    yield* sql`
      UPDATE generalist_runs SET
        continuation_json = ${continuation === undefined ? null : encodeContinuation(continuation)},
        suspension_json = NULL
      WHERE run_id = ${runId}
    `
    return continuation
  }),
)
