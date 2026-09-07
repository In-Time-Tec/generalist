import { Cause, Clock, Crypto, DateTime, Deferred, Effect, Fiber, Result, Schema } from "effect"
import { DurabilityFailure } from "../../durability/errors.js"
import * as Journal from "../../durability/internal/journal.js"
import { ObjectStore, ObjectStoreFailure, type Service } from "../../durability/object-store.js"
import * as S3 from "../../durability/s3.js"
import { HttpClient } from "effect/unstable/http"
import { nativeRequest } from "./native-r2-request.js"
import { ObjectStoreConformanceFailure } from "./index.js"
import {
  decodeReceipt,
  equal,
  isRunId,
  maxCommitBytes,
  nativeR2Namespace,
  nativeR2Commands,
  nativeR2Provider,
  NativeR2Failure,
  safeFailureReason,
  summary,
  transition,
  type NativeR2Request,
  type NativeR2Response,
  type NativeR2Provider,
  type QualificationReceipt,
} from "./native-r2-worker.js"
import type { CaseEvidence } from "./remote.js"
import type { NativeR2Configuration } from "./native-r2-configuration.js"

export type NativeR2WriterState = "stopped" | "uncertain"
export const nativeR2WriterState = (acknowledged: boolean): NativeR2WriterState =>
  acknowledged ? "stopped" : "uncertain"
type QualificationFailure =
  | NativeR2Failure
  | ObjectStoreFailure
  | DurabilityFailure
  | ObjectStoreConformanceFailure
  | Cause.TimeoutError
const safeFailureEvidence = (error: QualificationFailure): NonNullable<CaseEvidence["failure"]> => {
  const reason = Schema.is(ObjectStoreConformanceFailure)(error) ? "invalid-response" : safeFailureReason(error)
  return { tag: Schema.is(NativeR2Failure)(error) ? error._tag : "native-r2-failure", reason }
}

const check = (condition: boolean, name: string, message: string) =>
  condition ? Effect.void : Effect.fail(ObjectStoreConformanceFailure.make({ check: name, message }))

/** Runs native and S3 Journal instances over the same fixed namespace. */
export const qualifyNativeR2 = Effect.fn("qualifyNativeR2")(
  (
    configuration: NativeR2Configuration,
    host: { readonly runId: string; readonly runtime: string },
  ): Effect.Effect<
    NativeR2Evidence,
    NativeR2Failure | ObjectStoreFailure | DurabilityFailure | ObjectStoreConformanceFailure,
    Crypto.Crypto | HttpClient.HttpClient
  > =>
    Effect.gen(function* () {
      if (!isRunId(host.runId)) return yield* NativeR2Failure.make({ reason: "invalid-request" })
      const startedAt = yield* Clock.currentTimeMillis
      const namespace = nativeR2Namespace(configuration.environment, configuration.tenant, host.runId)
      const identity = { environment: configuration.environment, tenant: `${configuration.tenant}~${host.runId}` }
      const requests = { worker: 0, read: 0, create: 0, list: 0, conflicts: 0, continuationPages: 0 }
      const raw = yield* S3.make(configuration.connection)
      const store: Service = {
        capabilities: raw.capabilities,
        read: (key, options) =>
          Effect.gen(function* () {
            if (!key.startsWith(namespace))
              return yield* ObjectStoreFailure.make({
                operation: "qualification-scope",
                key,
                reason: "invalid-response",
                message: "Qualification key escaped its fixed namespace",
              })
            requests.read += 1
            return yield* raw.read(key, options)
          }),
        create: (key, bytes) =>
          Effect.gen(function* () {
            if (!key.startsWith(namespace))
              return yield* ObjectStoreFailure.make({
                operation: "qualification-scope",
                key,
                reason: "invalid-response",
                message: "Qualification key escaped its fixed namespace",
              })
            requests.create += 1
            const outcome = yield* raw.create(key, bytes)
            if (outcome !== "created") requests.conflicts += 1
            return outcome
          }),
        list: (prefix, cursor) =>
          Effect.gen(function* () {
            if (!prefix.startsWith(namespace))
              return yield* ObjectStoreFailure.make({
                operation: "qualification-scope",
                key: prefix,
                reason: "invalid-response",
                message: "Qualification prefix escaped its fixed namespace",
              })
            requests.list += 1
            if (cursor !== undefined) requests.continuationPages += 1
            return yield* raw.list(prefix, cursor)
          }),
      }
      const expectedNamespace = nativeR2Namespace(configuration.environment, configuration.tenant, host.runId)
      const preflightRequest: NativeR2Request = { schemaVersion: 1, operation: "preflight", runId: host.runId }
      requests.worker += 1
      const preflight = yield* nativeRequest(configuration)(preflightRequest)
      yield* check(
        preflight.result === "ready" &&
          preflight.environment === identity.environment &&
          preflight.tenant === identity.tenant &&
          preflight.namespace === expectedNamespace,
        "native-preflight",
        "The authenticated Worker did not report the configured fixed qualification identity",
      )
      const firstPage = yield* store.list(namespace)
      yield* check(
        firstPage.keys.length === 0 && firstPage.cursor === undefined,
        "namespace",
        "The fixed qualification namespace is not empty",
      )
      const open = (partition: string) =>
        Journal.make({
          environment: identity.environment,
          tenant: identity.tenant,
          partition,
          snapshotEvery: 2,
          maxConflictRetries: 64,
          maxCommitBytes,
        }).pipe(Effect.provideService(ObjectStore, store))
      const cases: Array<CaseEvidence> = []
      let failed = false
      let writerState: NativeR2WriterState = nativeR2WriterState(true)
      const runCase = (
        name: string,
        scenario: Effect.Effect<unknown, QualificationFailure, Crypto.Crypto | HttpClient.HttpClient>,
      ) =>
        Effect.gen(function* () {
          if (failed) {
            cases.push({ name, result: "not-run", durationMs: 0 })
            return
          }
          const start = yield* Clock.currentTimeMillis
          const result = yield* scenario.pipe(
            Effect.scoped,
            Effect.timeout("5 minutes"),
            Effect.catchDefect(() => Effect.fail(NativeR2Failure.make({ reason: "transport" }))),
            Effect.result,
          )
          const durationMs = (yield* Clock.currentTimeMillis) - start
          if (Result.isFailure(result)) {
            failed = true
            writerState = nativeR2WriterState(false)
            cases.push({ name, result: "failed", durationMs, failure: safeFailureEvidence(result.failure) })
          } else cases.push({ name, result: "passed", durationMs })
        })
      const recoverContentionThroughS3 = (native: NativeR2Response) =>
        Effect.gen(function* () {
          if (native.head === undefined) return yield* NativeR2Failure.make({ reason: "invalid-response" })
          const journal = yield* open("native-contention")
          const receipts: Array<{ readonly count: number }> = []
          for (const entry of native.history) {
            const command = {
              id: entry.id,
              input: { seed: configuration.seed, index: Number(entry.id.split("-").at(-1)) },
            }
            const receipt = yield* journal.commit(command, () =>
              Effect.fail(NativeR2Failure.make({ reason: "receipt-mismatch" })),
            )
            receipts.push(decodeReceipt(receipt))
          }
          const head = yield* journal.read
          yield* check(
            equal(
              receipts,
              native.history.map((entry) => entry.receipt),
            ),
            "native-contention-receipts",
            "S3 recovery changed a native contention receipt",
          )
          yield* check(
            head.sequence === native.head.sequence && head.stateDigest === native.head.stateDigest,
            "native-contention-history",
            "S3 recovery changed native contention history",
          )
        })
      const commitAndRead = (partition: "native" | "s3", count: number) =>
        Effect.gen(function* () {
          const commands = nativeR2Commands(partition, configuration.seed, count)
          const journal = yield* open(partition)
          const receipts: Array<{ readonly id: string; readonly receipt: QualificationReceipt }> = []
          for (const command of commands) {
            const receipt = yield* journal.commit(command, (state) => transition(command.id, state))
            receipts.push({ id: command.id, receipt: decodeReceipt(receipt) })
          }
          return { journal, commands, receipts, head: yield* journal.read }
        })
      const recoverThroughS3 = (native: NativeR2Response) =>
        Effect.gen(function* () {
          if (native.head === undefined) return yield* NativeR2Failure.make({ reason: "invalid-response" })
          const journal = yield* open("native")
          const receipts: Array<{ readonly count: number }> = []
          for (const entry of native.history) {
            const command = {
              id: entry.id,
              input: { seed: configuration.seed, index: Number(entry.id.split("-").at(-1)) },
            }
            const receipt = yield* journal.commit(command, () =>
              Effect.fail(NativeR2Failure.make({ reason: "receipt-mismatch" })),
            )
            receipts.push(decodeReceipt(receipt))
          }
          const head = yield* journal.read
          yield* check(
            equal(
              receipts,
              native.history.map((entry) => entry.receipt),
            ),
            "native-s3-receipts",
            "S3 recovery changed a native receipt",
          )
          yield* check(
            head.sequence === native.head.sequence &&
              head.stateDigest === native.head.stateDigest &&
              summary(head).count === native.head.count,
            "native-s3-history",
            "S3 recovery changed native journal history",
          )
        })
      yield* runCase(
        "native-commits-recover-through-s3",
        Effect.gen(function* () {
          const count = 3
          requests.worker += 1
          const native = yield* nativeRequest(configuration)({
            schemaVersion: 1,
            operation: "commit",
            runId: host.runId,
            partition: "native",
            seed: configuration.seed,
            count,
          })
          yield* check(
            native.result === "passed" && native.head !== undefined && native.history.length === count,
            "native-commit",
            "Native Worker did not return the complete committed history",
          )
          yield* recoverThroughS3(native)
        }),
      )
      const recoverThroughNative = (
        partition: "s3" | "s3-contention",
        expected: {
          readonly receipts: ReadonlyArray<{ readonly id: string; readonly receipt: { readonly count: number } }>
          readonly head: Journal.Head
        },
        seed: number,
      ) =>
        Effect.gen(function* () {
          const expectedHead = summary(expected.head)
          requests.worker += 1
          const recovered = yield* nativeRequest(configuration)({
            schemaVersion: 1,
            operation: "recover",
            runId: host.runId,
            partition,
            seed,
            count: expected.receipts.length,
            expected: { receipts: expected.receipts.map(({ receipt }) => receipt), ...expectedHead },
          })
          yield* check(
            recovered.result === "passed" && recovered.head !== undefined,
            "native-recovery",
            "Native recovery did not return the committed S3 history",
          )
          yield* check(
            equal(recovered.history, expected.receipts),
            "native-receipts",
            "Native recovery changed an S3 receipt",
          )
        })
      yield* runCase(
        "s3-commits-recover-through-native",
        Effect.gen(function* () {
          const committed = yield* commitAndRead("s3", 3)
          yield* recoverThroughNative("s3", committed, configuration.seed)
        }),
      )
      yield* runCase(
        "native-contention-has-independent-winners",
        Effect.gen(function* () {
          requests.worker += 1
          const native = yield* nativeRequest(configuration)({
            schemaVersion: 1,
            operation: "contention",
            runId: host.runId,
            partition: "native-contention",
            seed: configuration.seed,
            count: configuration.concurrency,
          })
          if (native.contention === undefined) return yield* NativeR2Failure.make({ reason: "invalid-response" })
          yield* check(
            native.result === "passed" && native.history.length === configuration.concurrency,
            "native-contention",
            "Native contention did not return bounded independent outcomes",
          )
          yield* check(
            equal(
              native.contention.counts,
              Array.from({ length: configuration.concurrency }, (_, index) => index + 1),
            ),
            "native-contention",
            "Native contention lost or duplicated a winner",
          )
          yield* recoverContentionThroughS3(native)
        }),
      )
      yield* runCase(
        "s3-contention-recovers-through-native",
        Effect.gen(function* () {
          const commands = nativeR2Commands("s3-contention", configuration.seed, configuration.concurrency)
          const start = yield* Deferred.make<void>()
          const journals = yield* Effect.forEach(commands, () => open("s3-contention"))
          const fibers = yield* Effect.forEach(journals, (journal, index) =>
            Deferred.await(start).pipe(
              Effect.andThen(journal.commit(commands[index]!, (state) => transition(commands[index]!.id, state))),
              Effect.map((receipt) => ({ id: commands[index]!.id, receipt: decodeReceipt(receipt) })),
              Effect.forkChild({ startImmediately: true }),
            ),
          )
          yield* Deferred.succeed(start, undefined)
          const receipts = yield* Effect.forEach(fibers, Fiber.join)
          const counts = receipts.map(({ receipt }) => receipt.count).toSorted((left, right) => left - right)
          yield* check(
            equal(
              counts,
              Array.from({ length: configuration.concurrency }, (_, index) => index + 1),
            ),
            "s3-contention",
            "S3 contention lost or duplicated a winner",
          )
          const head = yield* open("s3-contention").pipe(Effect.flatMap((journal) => journal.read))
          yield* recoverThroughNative("s3-contention", { receipts, head }, configuration.seed)
        }),
      )
      const finishedAt = yield* Clock.currentTimeMillis
      const cleanup = {
        result: "retained" as const,
        removedObjects: 0,
        writers: writerState,
        reason:
          writerState === "uncertain"
            ? "Completion was not positively acknowledged; retained namespace may contain in-flight native writes"
            : "Cleanup is disabled for native qualification evidence",
      }
      return {
        schemaVersion: 1,
        provider: nativeR2Provider,
        runtime: host.runtime,
        runId: host.runId,
        result: failed ? "failed" : "passed",
        startedAt: DateTime.formatIso(DateTime.makeUnsafe(startedAt)),
        finishedAt: DateTime.formatIso(DateTime.makeUnsafe(finishedAt)),
        namespace,
        environment: configuration.environment,
        tenant: identity.tenant,
        seed: configuration.seed,
        concurrency: { journal: configuration.concurrency, contention: configuration.concurrency },
        requests,
        cases,
        cleanup,
        unmetGates: [],
      } satisfies NativeR2Evidence
    }),
)

/** Machine-readable native interoperability evidence; endpoint credentials never appear here. */
export interface NativeR2Evidence {
  readonly schemaVersion: 1
  readonly provider: NativeR2Provider
  readonly runtime: string
  readonly runId: string
  readonly result: "passed" | "failed"
  readonly startedAt: string
  readonly finishedAt: string
  readonly namespace: string
  readonly environment: string
  readonly tenant: string
  readonly seed: number
  readonly concurrency: { readonly journal: number; readonly contention: number }
  readonly requests: {
    readonly worker: number
    readonly read: number
    readonly create: number
    readonly list: number
    readonly conflicts: number
    readonly continuationPages: number
  }
  readonly cases: ReadonlyArray<CaseEvidence>
  readonly cleanup: {
    readonly result: "retained"
    readonly removedObjects: number
    readonly writers: NativeR2WriterState
    readonly reason: string
  }
  readonly unmetGates: ReadonlyArray<string>
}
