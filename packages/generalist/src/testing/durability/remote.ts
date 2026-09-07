import { Clock, DateTime, Deferred, Effect, Result, Schema } from "effect"
import { make } from "../../durability/internal/journal.js"
import {
  sequenceName,
  equalBytes,
  bytes as bytesProtocol,
  type Json,
  decode,
  Envelope,
  parse,
} from "../../durability/internal/protocol.js"
import { ObjectStore, ObjectStoreFailure, type Service } from "../../durability/object-store.js"
import { atomicCreates, byteIntegrity, freshReads, listing, ObjectStoreConformanceFailure } from "./conformance.js"
import { check, failureEvidence, increment, payload } from "./remote-support.js"
import { isRunId, type Configuration } from "./remote-configuration.js"
import type { CaseEvidence, Evidence } from "./remote-evidence.js"

export { configuration, providers } from "./remote-configuration.js"
export type { Configuration, ConfigurationResult, Provider } from "./remote-configuration.js"
export { writeEvidence } from "./remote-evidence.js"
export type { CaseEvidence, Evidence } from "./remote-evidence.js"

/** Runs actual production transports and Journal, never an in-memory replacement. No I/O occurs until evaluated. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- qualification entry point takes its required config and host evidence identity directly.
export const qualify = (config: Configuration, host: { readonly runId: string; readonly runtime: string }) =>
  Effect.gen(function* () {
    yield* check(isRunId(host.runId), "namespace", "The evidence run ID must be a fresh, safe unique identifier")
    // Dynamic import keeps optional AWS dependencies out of unconfigured test discovery.
    const s3 = yield* Effect.tryPromise({
      try: () => import("../../durability/s3.js"),
      catch: () =>
        ObjectStoreConformanceFailure.make({
          check: "transport-import",
          message: "The optional production S3 transport dependencies could not be loaded",
        }),
    })
    const startedAt = yield* Clock.currentTimeMillis
    const tenant = `${config.tenant}-${config.provider}-${host.runId}`
    const namespace = `environments/${config.environment}/v1/tenants/${tenant}/`
    const created = new Set<string>()
    const requests = { read: 0, create: 0, list: 0, conflicts: 0, continuationPages: 0 }
    const payloadBytes = { fixtureSizes: [0, 1, 3, 256, 4096, 65536], attemptedWriteTotal: 0, largestAttemptedWrite: 0 }
    let stopped = false
    const guard = (key: string) =>
      key.startsWith(namespace)
        ? Effect.void
        : Effect.fail(
            ObjectStoreFailure.make({
              operation: "qualification-scope",
              key: namespace,
              reason: "invalid-response",
              message: "A test operation attempted to escape its fresh namespace",
            }),
          )
    const connect = s3.make(config.connection).pipe(
      Effect.map(
        (store): Service => ({
          capabilities: store.capabilities,
          read: (key, options) =>
            Effect.gen(function* () {
              yield* guard(key)
              requests.read += 1
              return yield* store.read(key, options)
            }),
          create: (key, bytes) =>
            Effect.gen(function* () {
              yield* guard(key)
              if (stopped)
                return yield* ObjectStoreFailure.make({
                  operation: "qualification-shutdown",
                  key,
                  reason: "invalid-response",
                  message: "A stopped qualification writer attempted a write",
                })
              requests.create += 1
              payloadBytes.attemptedWriteTotal += bytes.byteLength
              payloadBytes.largestAttemptedWrite = Math.max(payloadBytes.largestAttemptedWrite, bytes.byteLength)
              const outcome = yield* store.create(key, bytes)
              if (outcome === "created") created.add(key)
              else requests.conflicts += 1
              return outcome
            }),
          list: (prefix, cursor) =>
            Effect.gen(function* () {
              yield* guard(prefix)
              requests.list += 1
              if (cursor !== undefined) requests.continuationPages += 1
              return yield* store.list(prefix, cursor)
            }),
        }),
      ),
    )
    const maxCommitBytes = 1024 * 1024
    const open = (store: Service, partition: string, snapshotEvery = 2) =>
      make({
        environment: config.environment,
        tenant,
        partition,
        snapshotEvery,
        maxConflictRetries: 64,
        maxCommitBytes,
      }).pipe(Effect.provideService(ObjectStore, store))
    const slot = (partition: string, sequence: string) =>
      `${namespace}partitions/${partition}/commits/${sequenceName(sequence)}.json`
    const contracts = { connect, prefix: `${namespace}transport` }
    const cases: Array<CaseEvidence> = []
    let failed = false
    const runCase = <R>(
      name: string,
      scenario: Effect.Effect<unknown, import("./remote-support.js").QualificationFailure, R>,
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
          Effect.catchDefect(() =>
            Effect.fail(
              ObjectStoreConformanceFailure.make({
                check: "unexpected-defect",
                message: "The scenario failed outside its typed provider contract",
              }),
            ),
          ),
          Effect.result,
        )
        const durationMs = (yield* Clock.currentTimeMillis) - start
        if (Result.isFailure(result)) {
          failed = true
          cases.push({ name, result: "failed", durationMs, failure: failureEvidence(result.failure) })
        } else cases.push({ name, result: "passed", durationMs })
      })

    yield* runCase(
      "isolated-empty-namespace",
      Effect.gen(function* () {
        const fresh = yield* connect
        const page = yield* fresh.list(namespace)
        yield* check(
          page.keys.length === 0 && page.cursor === undefined,
          "namespace",
          "Refusing to write into a nonempty qualification namespace",
        )
      }),
    )
    yield* runCase("conditional-same-slot-independent-clients", atomicCreates(contracts))
    yield* runCase("fresh-client-visibility", freshReads(contracts))
    yield* runCase("binary-and-empty-integrity", byteIntegrity(contracts))
    yield* runCase(
      "real-provider-pagination",
      Effect.gen(function* () {
        const before = requests.continuationPages
        yield* listing({ ...contracts, count: 1003 })
        yield* check(
          requests.continuationPages > before,
          "pagination",
          "The provider did not exercise a real continuation request",
        )
      }),
    )
    yield* runCase(
      "seeded-payload-integrity",
      Effect.gen(function* () {
        for (const size of [4096, 65536]) {
          const bytes = payload(config.seed, size)
          const key = `${namespace}payloads/${size}`
          const writer = yield* connect
          yield* check(
            (yield* writer.create(key, bytes)) === "created",
            "payload",
            "A fresh payload key already existed",
          )
          const reader = yield* connect
          const stored = yield* reader.read(key, { maxBytes: bytes.byteLength })
          yield* check(
            stored !== undefined && equalBytes(stored.bytes, bytes),
            "payload",
            "Seeded binary bytes changed across fresh-client recovery",
          )
        }
      }),
    )
    yield* runCase(
      "concurrent-journal-transitions",
      Effect.gen(function* () {
        const gate = yield* Deferred.make<void>()
        let arrivals = 0
        const writers = yield* Effect.forEach(
          Array.from({ length: config.concurrency }, (_, index) => index),
          (index) =>
            Effect.gen(function* () {
              const store = yield* connect
              const synchronized: Service = {
                ...store,
                create: (key, bytes) =>
                  Effect.gen(function* () {
                    if (key === slot("concurrent", "0")) {
                      arrivals += 1
                      if (arrivals === config.concurrency) yield* Deferred.succeed(gate, undefined)
                      yield* Deferred.await(gate)
                    }
                    return yield* store.create(key, bytes)
                  }),
              }
              return { index, journal: yield* open(synchronized, "concurrent") }
            }),
        )
        const receipts = yield* Effect.forEach(
          writers,
          ({ index, journal }) =>
            journal.commit({ id: `writer-${index}`, input: index }, (state) => {
              const count = Schema.is(Schema.Finite)(state.count) ? state.count + 1 : 1
              return Effect.succeed({
                patches: [
                  { op: "set" as const, path: ["count"], value: count },
                  { op: "set" as const, path: [`writer-${index}`], value: true },
                ],
                receipt: count,
              })
            }),
          { concurrency: config.concurrency },
        )
        yield* check(
          arrivals === config.concurrency,
          "journal-contention",
          "Independent clients did not all attempt the same empty sequence slot",
        )
        yield* check(
          receipts.every(Schema.is(Schema.Finite)) &&
            [...receipts].toSorted().join(",") ===
              Array.from({ length: config.concurrency }, (_, index) => index + 1)
                .toSorted()
                .join(","),
          "journal-receipts",
          "Concurrent commands lost or duplicated an accepted counter transition",
        )
        const fresh = yield* open(yield* connect, "concurrent")
        const head = yield* fresh.read
        yield* check(
          head.sequence === String(config.concurrency - 1) && head.state.count === config.concurrency,
          "journal-recovery",
          "Fresh recovery did not include every accepted concurrent transition",
        )
        yield* check(
          Object.keys(head.state).length === config.concurrency + 1 &&
            writers.every(({ index }) => head.state[`writer-${index}`] === true),
          "journal-state",
          "Fresh state omitted a writer or invented unrelated state",
        )
        for (const { index } of writers) {
          const receipt = yield* fresh.commit({ id: `writer-${index}`, input: index }, () =>
            Effect.fail(
              ObjectStoreConformanceFailure.make({
                check: "journal-receipt-replay",
                message: "A recovered receipt reexecuted its reducer",
              }),
            ),
          )
          yield* check(
            receipt === receipts[index],
            "journal-receipt-replay",
            "An exact retry did not return its original receipt",
          )
        }
        const mismatch = yield* fresh.commit({ id: "writer-0", input: "different" }, increment).pipe(Effect.result)
        yield* check(
          Result.isFailure(mismatch) && mismatch.failure.reason === "input-conflict",
          "journal-input-conflict",
          "A reused command identity with different input was accepted",
        )
      }),
    )
    yield* runCase(
      "lost-ack-real-commit-and-restart",
      Effect.gen(function* () {
        const store = yield* connect
        let dropped = false
        const lostAck: Service = {
          ...store,
          create: (key, bytes) =>
            store.create(key, bytes).pipe(
              Effect.flatMap((outcome) => {
                if (!dropped && key === slot("lost-ack", "0") && outcome === "created") {
                  dropped = true
                  return Effect.fail(
                    ObjectStoreFailure.make({
                      operation: "create",
                      key,
                      reason: "timeout",
                      message: "Qualification discarded the acknowledgement after the real provider committed",
                    }),
                  )
                }
                return Effect.succeed(outcome)
              }),
            ),
        }
        const writer = yield* open(lostAck, "lost-ack")
        const receipt = yield* writer.commit({ id: "lost-ack", input: config.seed }, increment)
        yield* check(dropped, "lost-ack", "No acknowledged real storage write was intercepted")
        const committedReader = yield* connect
        yield* check(
          (yield* committedReader.read(slot("lost-ack", "0"), { maxBytes: maxCommitBytes })) !== undefined,
          "lost-ack",
          "The committed sequence slot was not retained",
        )
        const fresh = yield* open(yield* connect, "lost-ack")
        const replay = yield* fresh.commit({ id: "lost-ack", input: config.seed }, () =>
          Effect.fail(
            ObjectStoreConformanceFailure.make({
              check: "lost-ack-replay",
              message: "An exact retry reevaluated an already committed command",
            }),
          ),
        )
        yield* check(
          equalBytes(yield* bytesProtocol(receipt), yield* bytesProtocol(replay)),
          "lost-ack-receipt",
          "Restart did not return the original committed receipt",
        )
        const head = yield* fresh.read
        yield* check(
          head.sequence === "0" && head.state.count === 1,
          "lost-ack-state",
          "Lost acknowledgement duplicated or erased the transition",
        )
        const reader = yield* connect
        yield* check(
          (yield* reader.read(slot("lost-ack", "1"), { maxBytes: maxCommitBytes })) === undefined,
          "lost-ack-state",
          "Receipt recovery appended a duplicate sequence slot",
        )
      }),
    )
    yield* runCase(
      "snapshot-tail-and-receipt-restart",
      Effect.gen(function* () {
        const store = yield* connect
        const writer = yield* open(store, "snapshot")
        const receipts: Array<Json> = []
        for (let index = 0; index < 7; index += 1)
          receipts.push(
            yield* writer.commit({ id: `snapshot-${index}`, input: { seed: config.seed, index } }, increment),
          )
        const snapshots = yield* store.list(`${namespace}partitions/snapshot/snapshots/`)
        yield* check(
          snapshots.keys.length > 0,
          "snapshot",
          "The configured snapshot boundary never published a checkpoint",
        )
        const createsBefore = requests.create
        const fresh = yield* open(yield* connect, "snapshot", 1)
        const head = yield* fresh.read
        yield* check(
          requests.create === createsBefore,
          "readonly-recovery",
          "Opening or reading a recovered journal performed a provider write",
        )
        yield* check(
          head.sequence === "6" && head.state.count === 7 && Object.keys(head.state).length === 1,
          "snapshot-state",
          "Snapshot plus tail did not restore the independently expected state",
        )
        for (let index = 0; index < 7; index += 1) {
          const replay = yield* fresh.commit({ id: `snapshot-${index}`, input: { seed: config.seed, index } }, () =>
            Effect.fail(
              ObjectStoreConformanceFailure.make({
                check: "snapshot-receipts",
                message: "A retained receipt was reevaluated after snapshot restart",
              }),
            ),
          )
          yield* check(
            equalBytes(yield* bytesProtocol(replay), yield* bytesProtocol(receipts[index]!)),
            "snapshot-receipts",
            "Snapshot recovery changed an original receipt",
          )
        }
        yield* fresh.commit({ id: "after-restart", input: null }, increment)
        const restarted = yield* open(yield* connect, "snapshot")
        const after = yield* restarted.read
        yield* check(
          after.sequence === "7" && after.state.count === 8,
          "snapshot-extension",
          "A restarted writer failed to extend the verified snapshot tail",
        )
      }),
    )
    yield* runCase(
      "corrupt-real-object-refuses-extension",
      Effect.gen(function* () {
        const store = yield* connect
        const writer = yield* open(store, "corruption")
        yield* writer.commit({ id: "before-corruption", input: null }, increment)
        const original = yield* store.read(slot("corruption", "0"), { maxBytes: maxCommitBytes })
        if (original === undefined)
          return yield* check(false, "corruption", "The acknowledged journal object is absent")
        const envelope = yield* decode(Envelope, yield* parse(original.bytes), "corruption")
        const bytes = yield* bytesProtocol({ ...envelope, record: { ...envelope.record, receipt: "tampered" } })
        yield* check(
          (yield* store.create(slot("corruption", "1"), bytes)) === "created",
          "corruption",
          "The isolated malformed journal slot already existed",
        )
        const fresh = yield* open(yield* connect, "corruption")
        const recovered = yield* fresh.read.pipe(Effect.result)
        yield* check(
          Result.isFailure(recovered) && recovered.failure.reason === "corruption",
          "corruption",
          "Recovery accepted a record with mismatched canonical bytes and digest",
        )
        const before = requests.create
        const attempted = yield* fresh.commit({ id: "after-corruption", input: null }, increment).pipe(Effect.result)
        yield* check(
          Result.isFailure(attempted) && attempted.failure.reason === "corruption",
          "corruption",
          "A writer extended corrupt committed history",
        )
        yield* check(
          requests.create === before,
          "corruption",
          "Corrupt history triggered a provider write before rejection",
        )
      }),
    )

    // Every case owns/joins its fibers. Never delete after timeout, unresolved write, or any failed scenario.
    stopped = true
    let removedObjects = 0
    let cleanup: Evidence["cleanup"] = {
      result: "retained",
      removedObjects,
      writers: "stopped",
      reason: failed
        ? "Failed run retained for investigation; remote completion may be uncertain"
        : "Cleanup was not explicitly requested",
    }
    if (config.cleanup && !failed) {
      const cleanupResult = yield* Effect.gen(function* () {
        const maintenance = yield* s3.makeMaintenance(config.connection)
        for (const key of created) {
          yield* guard(key)
          yield* maintenance.remove(key)
          removedObjects += 1
        }
        const fresh = yield* connect
        const page = yield* fresh.list(namespace)
        yield* check(
          page.keys.length === 0 && page.cursor === undefined,
          "cleanup",
          "The retired qualification namespace is not empty after removing only acknowledged test writes",
        )
      }).pipe(Effect.result)
      if (Result.isFailure(cleanupResult)) {
        failed = true
        cleanup = {
          result: "failed",
          removedObjects,
          writers: "stopped",
          reason: "Scoped maintenance failed; no broad deletion was attempted",
        }
        cases.push({
          name: "scoped-maintenance",
          result: "failed",
          durationMs: 0,
          failure: failureEvidence(cleanupResult.failure),
        })
      } else cleanup = { result: "removed", removedObjects, writers: "stopped" }
    }
    const finishedAt = yield* Clock.currentTimeMillis
    return {
      schemaVersion: 1,
      provider: config.provider,
      runtime: host.runtime,
      runId: host.runId,
      result: failed ? "failed" : "passed",
      startedAt: DateTime.formatIso(DateTime.makeUnsafe(startedAt)),
      finishedAt: DateTime.formatIso(DateTime.makeUnsafe(finishedAt)),
      region: config.connection.region,
      regionMeaning:
        config.provider === "aws-s3" ? "configured AWS region" : "R2 signing region, not physical placement",
      namespace,
      environment: config.environment,
      tenant,
      seed: config.seed,
      concurrency: { journal: config.concurrency, conditionalCreate: 8, listingWrites: 16 },
      retries: { transportAttempts: 1, maxConflictRetries: 64 },
      payloadBytes,
      requests,
      cases,
      cleanup,
      unmetGates: [],
    } satisfies Evidence
  })
