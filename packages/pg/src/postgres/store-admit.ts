import { Effect, Function } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { AddressNotFound, IdempotencyConflict, RunIdConflict, TreePolicyInvalid } from "tenetkit/runtime/driver/errors"
import type { PinnedExecutable } from "tenetkit/runtime/driver/executable-manifest"
import { equals } from "tenetkit/runtime/driver/executable-manifest"
import type { AdmitSendInput } from "tenetkit/runtime/driver/run-store"
import { rootDigest } from "tenetkit/runtime/driver/memory/digest"
import type { RunRow } from "tenetkit/runtime/driver/sql/rows"
import { appendEvent, enqueueLane, insertRun, loadRun } from "./pg-helpers.js"
import type { EventHub } from "tenetkit/runtime/driver/sql/subscribers"
import { associateRegistrations, persistRegistrations } from "tenetkit/runtime/driver/sql/executable-registrations"
import { decodePinnedEffect, decodeStoredPinnedEffect } from "tenetkit/runtime/driver/sql/codecs"
import { normalize as normalizeTreePolicy } from "tenetkit/runtime/driver/tree-policy"

/** Exact addressed admission for the PostgreSQL store. */
export const admitSend: {
  (
    addressBindings: ReadonlyMap<string, PinnedExecutable>,
    nextId: (prefix: string) => Effect.Effect<string>,
    input: AdmitSendInput,
  ): (
    hub: EventHub,
  ) => Effect.Effect<
    { runId: string; messageId: string; acceptedSequence: number; duplicate: boolean },
    | AddressNotFound
    | IdempotencyConflict
    | RunIdConflict
    | TreePolicyInvalid
    | import("tenetkit/runtime/driver/errors").RuntimeUnavailable
    | import("effect/unstable/sql/SqlError").SqlError,
    SqlClient.SqlClient
  >
  (
    hub: EventHub,
    addressBindings: ReadonlyMap<string, PinnedExecutable>,
    nextId: (prefix: string) => Effect.Effect<string>,
    input: AdmitSendInput,
  ): Effect.Effect<
    { runId: string; messageId: string; acceptedSequence: number; duplicate: boolean },
    | AddressNotFound
    | IdempotencyConflict
    | RunIdConflict
    | TreePolicyInvalid
    | import("tenetkit/runtime/driver/errors").RuntimeUnavailable
    | import("effect/unstable/sql/SqlError").SqlError,
    SqlClient.SqlClient
  >
} = Function.dual(
  4,
  (
    hub: EventHub,
    addressBindings: ReadonlyMap<string, PinnedExecutable>,
    nextId: (prefix: string) => Effect.Effect<string>,
    input: AdmitSendInput,
  ) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const bound = addressBindings.get(input.message.to)
      if (bound === undefined) return yield* AddressNotFound.make({ address: input.message.to })
      const admitted = yield* decodePinnedEffect({
        ref: input.executableRef,
        manifest: input.executableManifest,
      })
      const binding = yield* decodePinnedEffect(bound)
      if (!equals(binding, admitted)) {
        return yield* AddressNotFound.make({ address: input.message.to })
      }
      yield* sql`SELECT pg_advisory_xact_lock(hashtext(${`admit:${input.message.to}:${input.message.sessionId}:${input.message.idempotencyKey}`}))`
      if (input.runId !== undefined) {
        yield* sql`SELECT pg_advisory_xact_lock(hashtext(${`run:${input.runId}`}))`
      }
      const treePolicy = yield* normalizeTreePolicy(input.treePolicy)
      const digest = rootDigest(input.message, treePolicy)
      const existing = yield* sql<RunRow>`
      SELECT * FROM tenetkit_runs
      WHERE address = ${input.message.to}
        AND session_id = ${input.message.sessionId}
        AND idempotency_key = ${input.message.idempotencyKey}
    `
      const prior = existing[0]
      if (prior !== undefined) {
        if (input.runId !== undefined && input.runId !== prior.run_id) {
          return yield* RunIdConflict.make({ runId: input.runId, existingRunId: prior.run_id })
        }
        const priorExecutable = yield* decodeStoredPinnedEffect(
          prior.executable_ref_json,
          prior.executable_manifest_json,
        )
        if (prior.message_digest !== digest || !equals(priorExecutable, admitted)) {
          return yield* IdempotencyConflict.make({
            address: input.message.to,
            sessionId: input.message.sessionId,
            idempotencyKey: input.message.idempotencyKey,
            existingRunId: prior.run_id,
          })
        }
        return {
          runId: prior.run_id,
          messageId: prior.message_id,
          acceptedSequence: Number(prior.accepted_sequence),
          duplicate: true,
        }
      }
      if (input.runId !== undefined) {
        const byId = yield* sql<RunRow>`SELECT * FROM tenetkit_runs WHERE run_id = ${input.runId}`
        if (byId[0] !== undefined)
          return yield* RunIdConflict.make({ runId: input.runId, existingRunId: byId[0].run_id })
      }
      const runId = input.runId ?? (yield* nextId("run"))
      const enqueued = yield* enqueueLane(input.message.to, input.message.sessionId, runId)
      yield* insertRun({
        runId,
        status: "queued",
        message: input.message,
        digest,
        executableRef: input.executableRef,
        executableManifest: input.executableManifest,
        rootRunId: runId,
        depth: 0,
        treePolicy,
        acceptedSequence: enqueued.acceptedSequence,
      })
      yield* sql`SELECT pg_advisory_xact_lock(hashtext('tenetkit:executable-registrations'))`
      yield* persistRegistrations(input.registrations)
      yield* associateRegistrations(runId, input.registrations)
      const loaded = (yield* loadRun(runId))!
      yield* appendEvent(
        hub,
        loaded,
        { _tag: "RunAccepted", messageId: input.message.id, address: input.message.to },
        "queued",
      )
      return {
        runId,
        messageId: input.message.id,
        acceptedSequence: enqueued.acceptedSequence,
        duplicate: false,
      }
    }),
)
