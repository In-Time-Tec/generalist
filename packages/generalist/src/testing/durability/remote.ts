import { Clock, Deferred, Effect, FileSystem, Result, Schema } from "effect"
import { DurabilityFailure } from "../../durability/errors.js"
import * as Journal from "../../durability/internal/journal.js"
import * as Protocol from "../../durability/internal/protocol.js"
import { ObjectStore, ObjectStoreFailure } from "../../durability/object-store.js"
import type { Service } from "../../durability/object-store.js"
import type * as S3 from "../../durability/s3.js"
import { atomicCreates, byteIntegrity, freshReads, listing, ObjectStoreConformanceFailure } from "./index.js"

export const providers = ["aws-s3", "r2-s3"] as const
export type Provider = (typeof providers)[number]

const Identity = Schema.String.check(Schema.isPattern(/^[a-z0-9][a-z0-9_-]{0,47}$/))
const RunId = Schema.String.check(Schema.isPattern(/^[a-z0-9][a-z0-9-]{15,79}$/))
const isIdentity = Schema.is(Identity)
const isRunId = Schema.is(RunId)

export interface Configuration {
  readonly provider: Provider
  readonly connection: S3.ConnectionOptions
  readonly environment: string
  readonly tenant: string
  readonly seed: number
  readonly concurrency: number
  readonly cleanup: boolean
}

export type ConfigurationResult =
  | { readonly status: "configured"; readonly configuration: Configuration }
  | { readonly status: "unmet"; readonly provider: Provider; readonly reasons: ReadonlyArray<string> }

/** Explicit credentials only: never reads the AWS default chain, profiles, or ambient endpoints. */
export const configuration = (provider: Provider, env: Readonly<Record<string, string | undefined>>): ConfigurationResult => {
  const reasons: Array<string> = []
  const required = (name: string) => {
    const value = env[name]
    if (value === undefined || value.trim() === "") reasons.push(`${name} is required`)
    return value ?? ""
  }
  if (env.GENERALIST_DURABILITY_REMOTE !== "1") reasons.push("GENERALIST_DURABILITY_REMOTE=1 is required to authorize remote test writes")
  const environment = required("GENERALIST_DURABILITY_ENVIRONMENT")
  const tenant = required("GENERALIST_DURABILITY_TENANT")
  for (const [name, value] of [["GENERALIST_DURABILITY_ENVIRONMENT", environment], ["GENERALIST_DURABILITY_TENANT", tenant]]) {
    if (value !== "" && !isIdentity(value)) reasons.push(`${name} must match [a-z0-9][a-z0-9_-]{0,47}`)
  }
  const prefix = provider === "aws-s3" ? "GENERALIST_DURABILITY_AWS" : "GENERALIST_DURABILITY_R2"
  const bucket = required(`${prefix}_BUCKET`)
  const accessKeyId = required(`${prefix}_ACCESS_KEY_ID`)
  const secretAccessKey = required(`${prefix}_SECRET_ACCESS_KEY`)
  const sessionToken = env[`${prefix}_SESSION_TOKEN`]
  const region = provider === "aws-s3" ? required(`${prefix}_REGION`) : "auto"
  const endpoint = provider === "r2-s3" ? required(`${prefix}_ENDPOINT`) : undefined
  if (endpoint !== undefined && endpoint !== "") {
    try {
      const url = new URL(endpoint)
      if (
        url.protocol !== "https:" || !/^[a-f0-9]{32}(?:\.(?:eu|fedramp))?\.r2\.cloudflarestorage\.com$/.test(url.hostname) ||
        url.port !== "" || url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "" || url.pathname !== "/"
      ) reasons.push("GENERALIST_DURABILITY_R2_ENDPOINT must be the HTTPS Cloudflare account S3 API origin, not a cached public or custom endpoint")
    } catch {
      reasons.push("GENERALIST_DURABILITY_R2_ENDPOINT must be a valid HTTPS Cloudflare account S3 API origin")
    }
  }
  const number = (name: string, fallback: number, minimum: number, maximum: number) => {
    const raw = env[name]
    const value = raw === undefined ? fallback : Number(raw)
    if (raw === "" || !Number.isSafeInteger(value) || value < minimum || value > maximum) reasons.push(`${name} must be an integer between ${minimum} and ${maximum}`)
    return value
  }
  const seed = number("GENERALIST_DURABILITY_SEED", 1, 0, 0xffff_ffff)
  const concurrency = number("GENERALIST_DURABILITY_CONCURRENCY", 4, 2, 16)
  if (env.GENERALIST_DURABILITY_CLEANUP !== undefined && env.GENERALIST_DURABILITY_CLEANUP !== "0" && env.GENERALIST_DURABILITY_CLEANUP !== "1") {
    reasons.push("GENERALIST_DURABILITY_CLEANUP must be 0 or 1")
  }
  if (reasons.length > 0) return { status: "unmet", provider, reasons }
  return {
    status: "configured",
    configuration: {
      provider, environment, tenant, seed, concurrency,
      cleanup: env.GENERALIST_DURABILITY_CLEANUP === "1",
      connection: {
        bucket, region,
        credentials: { accessKeyId, secretAccessKey, ...(sessionToken === undefined ? {} : { sessionToken }) },
        requestTimeoutMs: 30_000,
        ...(endpoint === undefined ? {} : {
          endpoint, forcePathStyle: true,
          capabilities: { conditionalCreate: true, strongReadAfterWrite: true, consistentListing: true },
        }),
      },
    },
  }
}

interface FailureEvidence {
  readonly tag: string
  readonly reason?: string
  readonly check?: string
}

export interface CaseEvidence {
  readonly name: string
  readonly result: "passed" | "failed" | "not-run"
  readonly durationMs: number
  readonly failure?: FailureEvidence
}

export interface Evidence {
  readonly schemaVersion: 1
  readonly provider: Provider
  readonly runtime: string
  readonly runId: string
  readonly result: "passed" | "failed"
  readonly startedAt: string
  readonly finishedAt: string
  readonly region: string
  readonly regionMeaning: "configured AWS region" | "R2 signing region, not physical placement"
  readonly namespace: string
  readonly environment: string
  readonly tenant: string
  readonly seed: number
  readonly concurrency: { readonly journal: number; readonly conditionalCreate: 8; readonly listingWrites: 16 }
  readonly retries: { readonly transportAttempts: 1; readonly maxConflictRetries: 64 }
  readonly payloadBytes: { readonly fixtureSizes: ReadonlyArray<number>; readonly attemptedWriteTotal: number; readonly largestAttemptedWrite: number }
  readonly requests: { readonly read: number; readonly create: number; readonly list: number; readonly conflicts: number; readonly continuationPages: number }
  readonly cases: ReadonlyArray<CaseEvidence>
  readonly cleanup: { readonly result: "retained" | "removed" | "failed"; readonly removedObjects: number; readonly writers: "stopped"; readonly reason?: string }
  readonly unmetGates: ReadonlyArray<string>
}

const check = (condition: boolean, name: string, message: string) => condition
  ? Effect.void
  : Effect.fail(new ObjectStoreConformanceFailure({ check: name, message }))

// Never serialize provider messages, endpoint URLs, request headers, credentials, or arbitrary error causes.
const failureEvidence = (error: unknown): FailureEvidence => {
  if (error instanceof ObjectStoreConformanceFailure) return { tag: error._tag, check: error.check }
  if (error instanceof ObjectStoreFailure || error instanceof DurabilityFailure) return { tag: error._tag, reason: error.reason }
  return { tag: "unclassified-failure" }
}

const increment = (state: Journal.State) => {
  const count = typeof state.count === "number" ? state.count + 1 : 1
  return Effect.succeed({ patches: [{ op: "set" as const, path: ["count"], value: count }], receipt: { count } })
}

const payload = (seed: number, size: number) => {
  let state = seed >>> 0
  return Uint8Array.from({ length: size }, () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state >>> 24
  })
}

/** Runs actual production transports and Journal, never an in-memory replacement. No I/O occurs until evaluated. */
export const qualify = (config: Configuration, host: { readonly runId: string; readonly runtime: string }) => Effect.gen(function* () {
  yield* check(isRunId(host.runId), "namespace", "The evidence run ID must be a fresh, safe unique identifier")
  // Dynamic import keeps optional AWS dependencies out of unconfigured test discovery.
  const s3 = yield* Effect.tryPromise({
    try: () => import("../../durability/s3.js"),
    catch: () => new ObjectStoreConformanceFailure({ check: "transport-import", message: "The optional production S3 transport dependencies could not be loaded" }),
  })
  const startedAt = yield* Clock.currentTimeMillis
  const tenant = `${config.tenant}-${config.provider}-${host.runId}`
  const namespace = `environments/${config.environment}/v1/tenants/${tenant}/`
  const created = new Set<string>()
  const requests = { read: 0, create: 0, list: 0, conflicts: 0, continuationPages: 0 }
  const payloadBytes = { fixtureSizes: [0, 1, 3, 256, 4096, 65536], attemptedWriteTotal: 0, largestAttemptedWrite: 0 }
  let stopped = false
  const guard = (key: string) => key.startsWith(namespace)
    ? Effect.void
    : Effect.fail(new ObjectStoreFailure({ operation: "qualification-scope", key: namespace, reason: "invalid-response", message: "A test operation attempted to escape its fresh namespace" }))
  const connect = s3.make(config.connection).pipe(Effect.map((store): Service => ({
    capabilities: store.capabilities,
    read: (key, options) => Effect.gen(function* () {
      yield* guard(key)
      requests.read += 1
      return yield* store.read(key, options)
    }),
    create: (key, bytes) => Effect.gen(function* () {
      yield* guard(key)
      if (stopped) return yield* Effect.fail(new ObjectStoreFailure({ operation: "qualification-shutdown", key, reason: "invalid-response", message: "A stopped qualification writer attempted a write" }))
      requests.create += 1
      payloadBytes.attemptedWriteTotal += bytes.byteLength
      payloadBytes.largestAttemptedWrite = Math.max(payloadBytes.largestAttemptedWrite, bytes.byteLength)
      const outcome = yield* store.create(key, bytes)
      if (outcome === "created") created.add(key)
      else requests.conflicts += 1
      return outcome
    }),
    list: (prefix, cursor) => Effect.gen(function* () {
      yield* guard(prefix)
      requests.list += 1
      if (cursor !== undefined) requests.continuationPages += 1
      return yield* store.list(prefix, cursor)
    }),
  })))
  const maxCommitBytes = 1024 * 1024
  const open = (store: Service, partition: string, snapshotEvery = 2) => Journal.make({
    environment: config.environment, tenant, partition, snapshotEvery, maxConflictRetries: 64, maxCommitBytes,
  }).pipe(Effect.provideService(ObjectStore, store))
  const slot = (partition: string, sequence: string) => `${namespace}partitions/${partition}/commits/${Protocol.sequenceName(sequence)}.json`
  const contracts = { connect, prefix: `${namespace}transport` }
  const cases: Array<CaseEvidence> = []
  let failed = false
  const runCase = <E, R>(name: string, scenario: Effect.Effect<unknown, E, R>) => Effect.gen(function* () {
    if (failed) {
      cases.push({ name, result: "not-run", durationMs: 0 })
      return
    }
    const start = yield* Clock.currentTimeMillis
    const result = yield* scenario.pipe(
      Effect.scoped,
      Effect.timeout("5 minutes"),
      Effect.catchDefect(() => Effect.fail(new ObjectStoreConformanceFailure({ check: "unexpected-defect", message: "The scenario failed outside its typed provider contract" }))),
      Effect.result,
    )
    const durationMs = (yield* Clock.currentTimeMillis) - start
    if (Result.isFailure(result)) {
      failed = true
      cases.push({ name, result: "failed", durationMs, failure: failureEvidence(result.failure) })
    } else cases.push({ name, result: "passed", durationMs })
  })

  yield* runCase("isolated-empty-namespace", Effect.gen(function* () {
    const fresh = yield* connect
    const page = yield* fresh.list(namespace)
    yield* check(page.keys.length === 0 && page.cursor === undefined, "namespace", "Refusing to write into a nonempty qualification namespace")
  }))
  yield* runCase("conditional-same-slot-independent-clients", atomicCreates(contracts))
  yield* runCase("fresh-client-visibility", freshReads(contracts))
  yield* runCase("binary-and-empty-integrity", byteIntegrity(contracts))
  yield* runCase("real-provider-pagination", Effect.gen(function* () {
    const before = requests.continuationPages
    yield* listing({ ...contracts, count: 1003 })
    yield* check(requests.continuationPages > before, "pagination", "The provider did not exercise a real continuation request")
  }))
  yield* runCase("seeded-payload-integrity", Effect.gen(function* () {
    for (const size of [4096, 65536]) {
      const bytes = payload(config.seed, size)
      const key = `${namespace}payloads/${size}`
      const writer = yield* connect
      yield* check((yield* writer.create(key, bytes)) === "created", "payload", "A fresh payload key already existed")
      const reader = yield* connect
      const stored = yield* reader.read(key, { maxBytes: bytes.byteLength })
      yield* check(stored !== undefined && Protocol.equalBytes(stored.bytes, bytes), "payload", "Seeded binary bytes changed across fresh-client recovery")
    }
  }))
  yield* runCase("concurrent-journal-transitions", Effect.gen(function* () {
    const gate = yield* Deferred.make<void>()
    let arrivals = 0
    const writers = yield* Effect.forEach(Array.from({ length: config.concurrency }, (_, index) => index), (index) => Effect.gen(function* () {
      const store = yield* connect
      const synchronized: Service = {
        ...store,
        create: (key, bytes) => Effect.gen(function* () {
          if (key === slot("concurrent", "0")) {
            arrivals += 1
            if (arrivals === config.concurrency) yield* Deferred.succeed(gate, undefined)
            yield* Deferred.await(gate)
          }
          return yield* store.create(key, bytes)
        }),
      }
      return { index, journal: yield* open(synchronized, "concurrent") }
    }))
    const receipts = yield* Effect.forEach(writers, ({ index, journal }) => journal.commit({ id: `writer-${index}`, input: index }, (state) => {
      const count = typeof state.count === "number" ? state.count + 1 : 1
      return Effect.succeed({
        patches: [{ op: "set" as const, path: ["count"], value: count }, { op: "set" as const, path: [`writer-${index}`], value: true }],
        receipt: count,
      })
    }), { concurrency: config.concurrency })
    yield* check(arrivals === config.concurrency, "journal-contention", "Independent clients did not all attempt the same empty sequence slot")
    yield* check(receipts.every((receipt) => typeof receipt === "number") && [...receipts].sort().join(",") === Array.from({ length: config.concurrency }, (_, index) => index + 1).sort().join(","), "journal-receipts", "Concurrent commands lost or duplicated an accepted counter transition")
    const fresh = yield* open(yield* connect, "concurrent")
    const head = yield* fresh.read
    yield* check(head.sequence === String(config.concurrency - 1) && head.state.count === config.concurrency, "journal-recovery", "Fresh recovery did not include every accepted concurrent transition")
    yield* check(Object.keys(head.state).length === config.concurrency + 1 && writers.every(({ index }) => head.state[`writer-${index}`] === true), "journal-state", "Fresh state omitted a writer or invented unrelated state")
    for (const { index } of writers) {
      const receipt = yield* fresh.commit({ id: `writer-${index}`, input: index }, () => Effect.fail(new ObjectStoreConformanceFailure({ check: "journal-receipt-replay", message: "A recovered receipt reexecuted its reducer" })))
      yield* check(receipt === receipts[index], "journal-receipt-replay", "An exact retry did not return its original receipt")
    }
    const mismatch = yield* fresh.commit({ id: "writer-0", input: "different" }, increment).pipe(Effect.result)
    yield* check(Result.isFailure(mismatch) && mismatch.failure.reason === "input-conflict", "journal-input-conflict", "A reused command identity with different input was accepted")
  }))
  yield* runCase("lost-ack-real-commit-and-restart", Effect.gen(function* () {
    const store = yield* connect
    let dropped = false
    const lostAck: Service = {
      ...store,
      create: (key, bytes) => store.create(key, bytes).pipe(Effect.flatMap((outcome) => {
        if (!dropped && key === slot("lost-ack", "0") && outcome === "created") {
          dropped = true
          return Effect.fail(new ObjectStoreFailure({ operation: "create", key, reason: "timeout", message: "Qualification discarded the acknowledgement after the real provider committed" }))
        }
        return Effect.succeed(outcome)
      })),
    }
    const writer = yield* open(lostAck, "lost-ack")
    const receipt = yield* writer.commit({ id: "lost-ack", input: config.seed }, increment)
    yield* check(dropped, "lost-ack", "No acknowledged real storage write was intercepted")
    const committedReader = yield* connect
    yield* check((yield* committedReader.read(slot("lost-ack", "0"), { maxBytes: maxCommitBytes })) !== undefined, "lost-ack", "The committed sequence slot was not retained")
    const fresh = yield* open(yield* connect, "lost-ack")
    const replay = yield* fresh.commit({ id: "lost-ack", input: config.seed }, () => Effect.fail(new ObjectStoreConformanceFailure({ check: "lost-ack-replay", message: "An exact retry reevaluated an already committed command" })))
    yield* check(Protocol.equalBytes(yield* Protocol.bytes(receipt), yield* Protocol.bytes(replay)), "lost-ack-receipt", "Restart did not return the original committed receipt")
    const head = yield* fresh.read
    yield* check(head.sequence === "0" && head.state.count === 1, "lost-ack-state", "Lost acknowledgement duplicated or erased the transition")
    const reader = yield* connect
    yield* check((yield* reader.read(slot("lost-ack", "1"), { maxBytes: maxCommitBytes })) === undefined, "lost-ack-state", "Receipt recovery appended a duplicate sequence slot")
  }))
  yield* runCase("snapshot-tail-and-receipt-restart", Effect.gen(function* () {
    const store = yield* connect
    const writer = yield* open(store, "snapshot")
    const receipts: Array<Protocol.Json> = []
    for (let index = 0; index < 7; index += 1) receipts.push(yield* writer.commit({ id: `snapshot-${index}`, input: { seed: config.seed, index } }, increment))
    const snapshots = yield* store.list(`${namespace}partitions/snapshot/snapshots/`)
    yield* check(snapshots.keys.length > 0, "snapshot", "The configured snapshot boundary never published a checkpoint")
    const createsBefore = requests.create
    const fresh = yield* open(yield* connect, "snapshot", 1)
    const head = yield* fresh.read
    yield* check(requests.create === createsBefore, "readonly-recovery", "Opening or reading a recovered journal performed a provider write")
    yield* check(head.sequence === "6" && head.state.count === 7 && Object.keys(head.state).length === 1, "snapshot-state", "Snapshot plus tail did not restore the independently expected state")
    for (let index = 0; index < 7; index += 1) {
      const replay = yield* fresh.commit({ id: `snapshot-${index}`, input: { seed: config.seed, index } }, () => Effect.fail(new ObjectStoreConformanceFailure({ check: "snapshot-receipts", message: "A retained receipt was reevaluated after snapshot restart" })))
      yield* check(Protocol.equalBytes(yield* Protocol.bytes(replay), yield* Protocol.bytes(receipts[index]!)), "snapshot-receipts", "Snapshot recovery changed an original receipt")
    }
    yield* fresh.commit({ id: "after-restart", input: null }, increment)
    const restarted = yield* open(yield* connect, "snapshot")
    const after = yield* restarted.read
    yield* check(after.sequence === "7" && after.state.count === 8, "snapshot-extension", "A restarted writer failed to extend the verified snapshot tail")
  }))
  yield* runCase("corrupt-real-object-refuses-extension", Effect.gen(function* () {
    const store = yield* connect
    const writer = yield* open(store, "corruption")
    yield* writer.commit({ id: "before-corruption", input: null }, increment)
    const original = yield* store.read(slot("corruption", "0"), { maxBytes: maxCommitBytes })
    if (original === undefined) return yield* check(false, "corruption", "The acknowledged journal object is absent")
    const envelope = yield* Protocol.decode(Protocol.Envelope, yield* Protocol.parse(original.bytes), "corruption")
    const bytes = yield* Protocol.bytes({ ...envelope, record: { ...envelope.record, receipt: "tampered" } })
    yield* check((yield* store.create(slot("corruption", "1"), bytes)) === "created", "corruption", "The isolated malformed journal slot already existed")
    const fresh = yield* open(yield* connect, "corruption")
    const recovered = yield* fresh.read.pipe(Effect.result)
    yield* check(Result.isFailure(recovered) && recovered.failure.reason === "corruption", "corruption", "Recovery accepted a record with mismatched canonical bytes and digest")
    const before = requests.create
    const attempted = yield* fresh.commit({ id: "after-corruption", input: null }, increment).pipe(Effect.result)
    yield* check(Result.isFailure(attempted) && attempted.failure.reason === "corruption", "corruption", "A writer extended corrupt committed history")
    yield* check(requests.create === before, "corruption", "Corrupt history triggered a provider write before rejection")
  }))

  // Every case owns/joins its fibers. Never delete after timeout, unresolved write, or any failed scenario.
  stopped = true
  let removedObjects = 0
  let cleanup: Evidence["cleanup"] = { result: "retained", removedObjects, writers: "stopped", reason: failed ? "Failed run retained for investigation; remote completion may be uncertain" : "Cleanup was not explicitly requested" }
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
      yield* check(page.keys.length === 0 && page.cursor === undefined, "cleanup", "The retired qualification namespace is not empty after removing only acknowledged test writes")
    }).pipe(Effect.result)
    if (Result.isFailure(cleanupResult)) {
      failed = true
      cleanup = { result: "failed", removedObjects, writers: "stopped", reason: "Scoped maintenance failed; no broad deletion was attempted" }
      cases.push({ name: "scoped-maintenance", result: "failed", durationMs: 0, failure: failureEvidence(cleanupResult.failure) })
    } else cleanup = { result: "removed", removedObjects, writers: "stopped" }
  }
  const finishedAt = yield* Clock.currentTimeMillis
  return {
    schemaVersion: 1, provider: config.provider, runtime: host.runtime, runId: host.runId,
    result: failed ? "failed" : "passed", startedAt: new Date(startedAt).toISOString(), finishedAt: new Date(finishedAt).toISOString(),
    region: config.connection.region,
    regionMeaning: config.provider === "aws-s3" ? "configured AWS region" : "R2 signing region, not physical placement",
    namespace, environment: config.environment, tenant, seed: config.seed,
    concurrency: { journal: config.concurrency, conditionalCreate: 8, listingWrites: 16 },
    retries: { transportAttempts: 1, maxConflictRetries: 64 }, payloadBytes, requests, cases, cleanup,
    unmetGates: [],
  } satisfies Evidence
})

/** Evidence output is a host boundary; it contains only explicit, non-secret qualification fields. */
export const writeEvidence = (directory: string, runId: string, evidence: unknown) => Effect.gen(function* () {
  yield* check(isRunId(runId), "evidence-path", "Evidence requires a safe unique run ID")
  const decoded = yield* Schema.decodeUnknownEffect(Schema.Json)(evidence)
  const fileSystem = yield* FileSystem.FileSystem
  yield* fileSystem.makeDirectory(directory, { recursive: true })
  const path = `${directory}/${runId}.json`
  yield* fileSystem.writeFileString(path, `${JSON.stringify(decoded, null, 2)}\n`)
  return path
})
