import { Effect, Encoding, Queue, Schema, Stream, SynchronizedRef } from "effect"
import { SqlClient } from "effect/unstable/sql"
import type { SqlError } from "effect/unstable/sql/SqlError"
import {
  ArtifactCrdtMismatch,
  ArtifactNotFound,
  ArtifactSubscriberLagged,
  ArtifactVersionConflict,
  ArtifactVersionNotFound,
  Attribution,
  RangeOperation,
  type ArtifactAppend,
  type ArtifactFork,
  type ArtifactHead,
  type ArtifactUpdate,
} from "../../../../core/artifact.js"
import { Ref as MediaRef } from "../../../../media/ref.js"
import { RunNotFound, RuntimeUnavailable } from "../../../errors.js"
import type { Service as RunStoreService } from "../../../run/store.js"
import { decodeJson, decodeSqlInteger, encodeJson } from "../../codec/codecs.js"
import type { WithoutSqlError } from "../../effect.js"
import type { SqlStoreLocks, SqlStoreRun } from "../driver/protocol.js"

const branchId = (branch?: string): string => branch ?? ""
const publicBranch = (branch: string): { readonly branch: string } | undefined =>
  branch === "" ? undefined : { branch }
const missing = (artifact: string) => ArtifactNotFound.make({ artifact })

const HeadRow = Schema.Struct({
  artifact_name: Schema.String,
  branch_id: Schema.String,
  crdt: Schema.String,
  base_version: Schema.Union([Schema.Finite, Schema.String, Schema.BigInt]),
  base_snapshot_json: Schema.String,
  version: Schema.Union([Schema.Finite, Schema.String, Schema.BigInt]),
  snapshot_json: Schema.String,
})
type HeadRow = typeof HeadRow.Type

const OperationRow = Schema.Struct({
  artifact_name: Schema.String,
  branch_id: Schema.String,
  base: Schema.Union([Schema.Finite, Schema.String, Schema.BigInt]),
  result: Schema.Union([Schema.Finite, Schema.String, Schema.BigInt]),
  operation_json: Schema.String,
  attribution_json: Schema.String,
  update_base64: Schema.String,
  snapshot_json: Schema.String,
})
type OperationRow = typeof OperationRow.Type

const decodeHead = (row: HeadRow): ArtifactHead => ({
  artifact: row.artifact_name,
  crdt: row.crdt,
  version: decodeSqlInteger(row.version),
  snapshot: decodeJson(MediaRef, row.snapshot_json),
  ...publicBranch(row.branch_id),
})

const decodeUpdate = (row: OperationRow): ArtifactUpdate => ({
  artifact: row.artifact_name,
  base: decodeSqlInteger(row.base),
  result: decodeSqlInteger(row.result),
  operation: decodeJson(RangeOperation, row.operation_json),
  attribution: decodeJson(Attribution, row.attribution_json),
  update: Schema.decodeSync(Schema.Uint8ArrayFromBase64)(row.update_base64),
  snapshot: decodeJson(MediaRef, row.snapshot_json),
  ...publicBranch(row.branch_id),
})

const loadHeadRow = (artifact: string, branch?: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql`
      SELECT artifact_name, branch_id, crdt, base_version, base_snapshot_json, version, snapshot_json
      FROM generalist_artifacts
      WHERE artifact_name = ${artifact} AND branch_id = ${branchId(branch)}
    `
    return (yield* Schema.decodeUnknownEffect(Schema.Array(HeadRow))(rows).pipe(Effect.orDie))[0]
  })

const loadHead = (artifact: string, branch?: string) =>
  Effect.gen(function* () {
    const row = yield* loadHeadRow(artifact, branch)
    return row === undefined ? yield* missing(artifact) : decodeHead(row)
  })

const ensureArtifact = (input: { readonly artifact: string; readonly crdt: string; readonly snapshot: MediaRef }) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const existing = yield* loadHeadRow(input.artifact)
    if (existing !== undefined) {
      if (existing.crdt !== input.crdt) {
        return yield* ArtifactCrdtMismatch.make({
          artifact: input.artifact,
          expected: existing.crdt,
          actual: input.crdt,
        })
      }
      return decodeHead(existing)
    }
    const encoded = encodeJson(MediaRef, input.snapshot)
    yield* sql`
      INSERT INTO generalist_artifacts
        (artifact_name, branch_id, crdt, base_version, base_snapshot_json, version, snapshot_json)
      VALUES (${input.artifact}, '', ${input.crdt}, 0, ${encoded}, 0, ${encoded})
    `
    return { artifact: input.artifact, crdt: input.crdt, version: 0, snapshot: input.snapshot }
  })

const loadSnapshot = (input: { readonly artifact: string; readonly version: number; readonly branch?: string }) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const head = yield* loadHeadRow(input.artifact, input.branch)
    if (head === undefined) return yield* missing(input.artifact)
    if (decodeSqlInteger(head.base_version) === input.version) {
      return { ...decodeHead(head), version: input.version, snapshot: decodeJson(MediaRef, head.base_snapshot_json) }
    }
    const rows = yield* sql`
      SELECT artifact_name, branch_id, base, result, operation_json, attribution_json, update_base64, snapshot_json
      FROM generalist_artifact_operations
      WHERE artifact_name = ${input.artifact}
        AND branch_id = ${branchId(input.branch)}
        AND result = ${input.version}
    `
    const row = (yield* Schema.decodeUnknownEffect(Schema.Array(OperationRow))(rows).pipe(Effect.orDie))[0]
    if (row === undefined) {
      return yield* ArtifactVersionNotFound.make({
        artifact: input.artifact,
        version: input.version,
        ...(input.branch === undefined ? undefined : { branch: input.branch }),
      })
    }
    const update = decodeUpdate(row)
    return { ...decodeHead(head), version: update.result, snapshot: update.snapshot }
  })

const ensureBranch = (input: ArtifactAppend | ArtifactFork) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const existing = yield* loadHeadRow(input.artifact, input.branch)
    if (existing !== undefined) return existing
    if (input.branch === undefined || input.source === undefined) return yield* missing(input.artifact)
    const source = yield* loadSnapshot({
      artifact: input.artifact,
      version: input.source.version,
      ...(input.source.branch === undefined ? undefined : { branch: input.source.branch }),
    })
    if (source.snapshot.sha256 !== input.source.snapshot.sha256) {
      return yield* ArtifactVersionConflict.make({
        artifact: input.artifact,
        expected: input.source.version,
        actual: source.version,
        branch: input.branch,
      })
    }
    const snapshot = encodeJson(MediaRef, source.snapshot)
    yield* sql`
      INSERT INTO generalist_artifacts
        (artifact_name, branch_id, crdt, base_version, base_snapshot_json, version, snapshot_json)
      VALUES (${input.artifact}, ${input.branch}, ${input.crdt}, ${source.version}, ${snapshot},
        ${source.version}, ${snapshot})
    `
    return (yield* loadHeadRow(input.artifact, input.branch))!
  })

const forkArtifact = (input: ArtifactFork) =>
  Effect.gen(function* () {
    const main = yield* loadHead(input.artifact)
    if (main.crdt !== input.crdt) {
      return yield* ArtifactCrdtMismatch.make({
        artifact: input.artifact,
        expected: main.crdt,
        actual: input.crdt,
      })
    }
    return decodeHead(yield* ensureBranch(input))
  })

const append = (input: ArtifactAppend) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const main = yield* loadHead(input.artifact)
    if (main.crdt !== input.crdt) {
      return yield* ArtifactCrdtMismatch.make({
        artifact: input.artifact,
        expected: main.crdt,
        actual: input.crdt,
      })
    }
    const head = yield* ensureBranch(input)
    const actual = decodeSqlInteger(head.version)
    if (actual !== input.expected) {
      return yield* ArtifactVersionConflict.make({
        artifact: input.artifact,
        expected: input.expected,
        actual,
        ...(input.branch === undefined ? undefined : { branch: input.branch }),
      })
    }
    const result = input.expected + 1
    const snapshot = encodeJson(MediaRef, input.snapshot)
    yield* sql`
      INSERT INTO generalist_artifact_operations
        (artifact_name, branch_id, result, base, operation_json, attribution_json, update_base64, snapshot_json)
      VALUES (${input.artifact}, ${branchId(input.branch)}, ${result}, ${input.base},
        ${encodeJson(RangeOperation, input.operation)}, ${encodeJson(Attribution, input.attribution)},
        ${Encoding.encodeBase64(input.update)}, ${snapshot})
    `
    yield* sql`
      UPDATE generalist_artifacts SET version = ${result}, snapshot_json = ${snapshot}
      WHERE artifact_name = ${input.artifact} AND branch_id = ${branchId(input.branch)}
    `
    return {
      artifact: input.artifact,
      base: input.base,
      result,
      operation: input.operation,
      attribution: input.attribution,
      update: input.update,
      snapshot: input.snapshot,
      ...(input.branch === undefined ? undefined : { branch: input.branch }),
    } satisfies ArtifactUpdate
  })

const loadUpdates = (input: { readonly artifact: string; readonly version: number; readonly branch?: string }) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const head = yield* loadHeadRow(input.artifact, input.branch)
    if (head === undefined) return yield* missing(input.artifact)
    const earliest = decodeSqlInteger(head.base_version)
    const latest = decodeSqlInteger(head.version)
    if (input.version < earliest || input.version > latest) {
      return yield* ArtifactVersionNotFound.make({
        artifact: input.artifact,
        version: input.version,
        ...(input.branch === undefined ? undefined : { branch: input.branch }),
      })
    }
    const rows = yield* sql`
      SELECT artifact_name, branch_id, base, result, operation_json, attribution_json, update_base64, snapshot_json
      FROM generalist_artifact_operations
      WHERE artifact_name = ${input.artifact}
        AND branch_id = ${branchId(input.branch)}
        AND result > ${input.version}
      ORDER BY result
    `
    return {
      replay: (yield* Schema.decodeUnknownEffect(Schema.Array(OperationRow))(rows).pipe(Effect.orDie)).map(
        decodeUpdate,
      ),
      latest,
    }
  })

interface HubState {
  readonly nextId: number
  readonly subscribers: ReadonlyMap<string, ReadonlyMap<number, Queue.Queue<ArtifactUpdate, ArtifactSubscriberLagged>>>
}

const makeHub = (capacity: number) =>
  Effect.gen(function* () {
    const stateRef = yield* SynchronizedRef.make<HubState>({ nextId: 1, subscribers: new Map() })
    const publish = (update: ArtifactUpdate) =>
      SynchronizedRef.modifyEffect(stateRef, (state) =>
        Effect.gen(function* () {
          const key = `${update.artifact}\0${update.branch ?? ""}`
          const current = state.subscribers.get(key)
          if (current === undefined) return [undefined, state] as const
          const retained = new Map(current)
          for (const [id, queue] of current) {
            if (yield* Queue.offer(queue, update)) continue
            yield* Queue.fail(
              queue,
              ArtifactSubscriberLagged.make({
                artifact: update.artifact,
                lastDeliveredVersion: update.result - 1,
                ...(update.branch === undefined ? undefined : { branch: update.branch }),
              }),
            )
            retained.delete(id)
          }
          const subscribers = new Map(state.subscribers)
          if (retained.size === 0) subscribers.delete(key)
          else subscribers.set(key, retained)
          return [undefined, { ...state, subscribers }] as const
        }),
      )
    const subscribe = (
      input: { readonly artifact: string; readonly version: number; readonly branch?: string },
      replay: Effect.Effect<
        { readonly replay: ReadonlyArray<ArtifactUpdate>; readonly latest: number },
        ArtifactNotFound | ArtifactVersionNotFound | RuntimeUnavailable
      >,
    ) =>
      Stream.unwrap(
        Effect.gen(function* () {
          const queue = yield* Queue.dropping<ArtifactUpdate, ArtifactSubscriberLagged>(capacity)
          const key = `${input.artifact}\0${input.branch ?? ""}`
          const id = yield* SynchronizedRef.modify(stateRef, (state) => {
            const subscriberId = state.nextId
            const current = new Map(state.subscribers.get(key) ?? []).set(subscriberId, queue)
            return [
              subscriberId,
              { nextId: subscriberId + 1, subscribers: new Map(state.subscribers).set(key, current) },
            ] as const
          })
          yield* Effect.addFinalizer(() =>
            SynchronizedRef.update(stateRef, (state) => {
              const current = state.subscribers.get(key)
              if (current === undefined) return state
              const next = new Map(current)
              next.delete(id)
              const subscribers = new Map(state.subscribers)
              if (next.size === 0) subscribers.delete(key)
              else subscribers.set(key, next)
              return { ...state, subscribers }
            }).pipe(Effect.andThen(Queue.shutdown(queue)), Effect.asVoid),
          )
          const loaded = yield* replay
          return Stream.concat(
            Stream.fromIterable(loaded.replay),
            Stream.fromQueue(queue).pipe(Stream.filter((update) => update.result > loaded.latest)),
          )
        }),
      )
    return { publish, subscribe }
  })

type Locked = <A, E>(
  lock: Effect.Effect<void, SqlError, SqlClient.SqlClient>,
  effect: Effect.Effect<A, E, SqlClient.SqlClient>,
) => Effect.Effect<A, WithoutSqlError<E | SqlError> | RuntimeUnavailable>

export const make = (input: {
  readonly locks: SqlStoreLocks
  readonly locked: Locked
  readonly runNoTransaction: SqlStoreRun
  readonly capacity: number
}) =>
  Effect.gen(function* () {
    const hub = yield* makeHub(input.capacity)
    // JSON keeps the two names unambiguous without a NUL separator, which PostgreSQL rejects in text parameters.
    const lock = (artifact: string, branch?: string) =>
      input.locks.mailbox(`artifact:${JSON.stringify([artifact, branch ?? ""])}`)
    return {
      ensureArtifact: (request) => input.locked(lock(request.artifact), ensureArtifact(request)),
      artifactHead: (request) => input.runNoTransaction(loadHead(request.artifact, request.branch)),
      artifactSnapshot: (request) => input.runNoTransaction(loadSnapshot(request)),
      forkArtifact: (request) => input.locked(lock(request.artifact, request.branch), forkArtifact(request)),
      appendArtifact: (request) =>
        input.locked(lock(request.artifact, request.branch), append(request)).pipe(Effect.tap(hub.publish)),
      artifactUpdates: (request) => hub.subscribe(request, input.runNoTransaction(loadUpdates(request))),
      artifactRunIsFork: (runId) =>
        input.runNoTransaction(
          Effect.gen(function* () {
            const sql = yield* SqlClient.SqlClient
            const rows = yield* sql<{ readonly forked_from: string | null }>`
              SELECT forked_from FROM generalist_runs WHERE run_id = ${runId}
            `
            const row = rows[0]
            return row === undefined ? yield* RunNotFound.make({ runId }) : row.forked_from !== null
          }),
        ),
    } satisfies Pick<
      RunStoreService,
      | "ensureArtifact"
      | "artifactHead"
      | "artifactSnapshot"
      | "forkArtifact"
      | "appendArtifact"
      | "artifactUpdates"
      | "artifactRunIsFork"
    >
  })
