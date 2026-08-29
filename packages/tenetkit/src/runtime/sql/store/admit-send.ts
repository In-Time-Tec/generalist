import { Clock, Effect, Function, Random } from "effect"
import { SqlClient } from "effect/unstable/sql"
import {
  AddressNotFound,
  ChildDepthExceeded,
  ChildLimitExceeded,
  ExecutableRegistrationConflict,
  IdempotencyConflict,
  RunIdConflict,
  RuntimeUnavailable,
  TreePolicyInvalid,
} from "../../errors.js"
import { decodePinned, equals, type PinnedExecutable } from "../../executable/manifest.js"
import { rootDigest } from "../../memory/digest.js"
import type { AdmitSendInput } from "../../run/store.js"
import { decodePinnedExecutable, decodeQueue, encodeQueue } from "../codec/codecs.js"
import type { DecodedRun, RunRow } from "../codec/rows.js"
import { appendEvent, insertRun, loadRun, promoteHead } from "./statements.js"
import type { EventHub } from "../subscribers.js"
import { associateRegistrations, persistRegistrations } from "../executable/registrations.js"
import type { SqlError } from "effect/unstable/sql/SqlError"
import { normalize as normalizeTreePolicy } from "../../tree/policy.js"

type AdmissionEffect = Effect.Effect<undefined, ChildDepthExceeded | ChildLimitExceeded | SqlError, SqlClient.SqlClient>

export const enforceChildAdmission: {
  (requested: number): (parent: DecodedRun) => AdmissionEffect
  (parent: DecodedRun, requested: number): AdmissionEffect
} = Function.dual(2, (parent: DecodedRun, requested: number) =>
  Effect.gen(function* () {
    const depth = parent.depth + 1
    if (depth > parent.treePolicy.maxDepth) {
      return yield* ChildDepthExceeded.make({
        parentRunId: parent.runId,
        rootRunId: parent.rootRunId,
        parentDepth: parent.depth,
        depth,
        requested: depth,
        current: parent.depth,
        limit: parent.treePolicy.maxDepth,
      })
    }
    if (parent.treePolicy.maxSubagents === 0) {
      return yield* ChildLimitExceeded.make({
        parentRunId: parent.runId,
        rootRunId: parent.rootRunId,
        parentDepth: parent.depth,
        depth,
        requested,
        current: 0,
        limit: parent.treePolicy.maxSubagents,
      })
    }
  }),
)

export const nextId = (prefix: string): Effect.Effect<string> =>
  Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis
    const random = yield* Random.nextIntBetween(0, Number.MAX_SAFE_INTEGER)
    return `${prefix}_${now.toString(36)}_${random.toString(36)}`
  })

type SendReceipt = { runId: string; messageId: string; acceptedSequence: number; duplicate: boolean }
type SendEffect = Effect.Effect<
  SendReceipt,
  | AddressNotFound
  | ExecutableRegistrationConflict
  | IdempotencyConflict
  | RunIdConflict
  | RuntimeUnavailable
  | TreePolicyInvalid
  | SqlError,
  SqlClient.SqlClient
>

const appendLane = (
  lane: { readonly accepted_sequence: number; readonly queue_json: string } | undefined,
  runId: string,
) => {
  if (lane === undefined) return { acceptedSequence: 0, queue: [runId] }
  return { acceptedSequence: lane.accepted_sequence + 1, queue: [...decodeQueue(lane.queue_json), runId] }
}

export const admitSend: {
  (
    addressBindings: ReadonlyMap<string, PinnedExecutable>,
    input: AdmitSendInput,
    options?: { readonly promote?: boolean },
  ): (hub: EventHub) => SendEffect
  (
    hub: EventHub,
    addressBindings: ReadonlyMap<string, PinnedExecutable>,
    input: AdmitSendInput,
    options?: { readonly promote?: boolean },
  ): SendEffect
} = Function.dual(
  (args) => args.length >= 3 && "publish" in args[0],
  (
    hub: EventHub,
    addressBindings: ReadonlyMap<string, PinnedExecutable>,
    input: AdmitSendInput,
    options?: { readonly promote?: boolean },
  ): SendEffect =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const bound = addressBindings.get(input.message.to)
      if (bound === undefined) return yield* AddressNotFound.make({ address: input.message.to })
      const admitted = yield* Effect.try({
        try: () => decodePinned({ ref: input.executableRef, manifest: input.executableManifest }),
        catch: (error) => RuntimeUnavailable.make({ message: String(error) }),
      })
      const binding = yield* Effect.try({
        try: () => decodePinned(bound),
        catch: (error) => RuntimeUnavailable.make({ message: String(error) }),
      })
      if (!equals(binding, admitted)) return yield* AddressNotFound.make({ address: input.message.to })
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
        const priorExecutable = yield* Effect.try({
          try: () => decodePinnedExecutable(prior.executable_ref_json, prior.executable_manifest_json),
          catch: (error) => RuntimeUnavailable.make({ message: String(error) }),
        })
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
          acceptedSequence: prior.accepted_sequence,
          duplicate: true,
        }
      }
      if (input.runId !== undefined) {
        const byId = yield* sql<RunRow>`SELECT * FROM tenetkit_runs WHERE run_id = ${input.runId}`
        if (byId[0] !== undefined)
          return yield* RunIdConflict.make({ runId: input.runId, existingRunId: byId[0].run_id })
      }
      const runId = input.runId ?? (yield* nextId("run"))
      const lanes = yield* sql<{ accepted_sequence: number; queue_json: string }>`
      SELECT accepted_sequence, queue_json FROM tenetkit_lanes
      WHERE session_id = ${input.message.sessionId}
    `
      const lane = lanes[0]
      const { acceptedSequence, queue } = appendLane(lane, runId)
      if (lane === undefined) {
        yield* sql`
        INSERT INTO tenetkit_lanes (session_id, accepted_sequence, queue_json)
        VALUES (${input.message.sessionId}, ${acceptedSequence}, ${encodeQueue(queue)})
      `
      } else {
        yield* sql`
        UPDATE tenetkit_lanes
        SET accepted_sequence = ${acceptedSequence}, queue_json = ${encodeQueue(queue)}
        WHERE session_id = ${input.message.sessionId}
      `
      }
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
        acceptedSequence,
      })
      yield* persistRegistrations(input.registrations)
      yield* associateRegistrations(runId, input.registrations)
      const run = (yield* loadRun(runId))!
      yield* appendEvent(
        hub,
        run,
        {
          _tag: "RunAccepted",
          messageId: input.message.id,
          address: input.message.to,
        },
        "queued",
      )
      if (options?.promote !== false && queue[0] === runId) {
        yield* promoteHead(hub, input.message.sessionId)
      }
      return { runId, messageId: input.message.id, acceptedSequence, duplicate: false }
    }),
)
