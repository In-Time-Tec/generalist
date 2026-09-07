import { Clock, Crypto, Deferred, Effect, Fiber, Result } from "effect"
import { DurabilityFailure } from "../../durability/errors.js"
import * as Journal from "../../durability/internal/journal.js"
import type * as Protocol from "../../durability/internal/protocol.js"
import { ObjectStore, ObjectStoreFailure, type Service } from "../../durability/object-store.js"
import * as S3 from "../../durability/s3.js"
import { ObjectStoreConformanceFailure } from "./index.js"
import {
  decodeReceipt,
  decodeResponse,
  equal,
  isRunId,
  isNativeR2Reason,
  maxCommandCount,
  maxCommitBytes,
  maxResponseBytes,
  readBoundedStream,
  nativeR2Namespace,
  nativeR2Commands,
  nativeR2Provider,
  NativeR2Failure,
  safeFailureReason,
  summary,
  transition,
  type NativeR2Reason,
  type NativeR2Request,
  type NativeR2Response,
  type NativeR2Provider,
  type QualificationReceipt,
} from "./native-r2-worker.js"
import {
  configuration as s3Configuration,
  type CaseEvidence,
  type Configuration as S3Configuration,
} from "./remote.js"


const endpointPattern = /^https:\/\//
/** Native qualification host configuration. S3 credentials are reused for the exact same bucket. */
export interface NativeR2Configuration {
  readonly provider: NativeR2Provider
  readonly connection: S3.ConnectionOptions
  readonly endpoint: string
  readonly token: string
  readonly environment: string
  readonly tenant: string
  readonly seed: number
  readonly concurrency: number
  readonly cleanup: boolean
  readonly s3: S3Configuration
}

export type NativeR2ConfigurationResult =
  | { readonly status: "configured"; readonly configuration: NativeR2Configuration }
  | { readonly status: "unmet"; readonly provider: NativeR2Provider; readonly reasons: ReadonlyArray<string> }

const required = (env: Readonly<Record<string, string | undefined>>, name: string, reasons: Array<string>): string => {
  const value = env[name]
  if (value === undefined || value.trim() === "") reasons.push(`${name} is required`)
  return value ?? ""
}

const boundedNumber = (
  env: Readonly<Record<string, string | undefined>>,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
  reasons: Array<string>,
): number => {
  const raw = env[name]
  const value = raw === undefined ? fallback : Number(raw)
  if (raw === "" || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    reasons.push(`${name} must be an integer between ${minimum} and ${maximum}`)
  }
  return value
}

/**
 * Configuration is intentionally stricter than a generic HTTP client: only a TLS
 * origin and an explicitly supplied bearer token can authorize the Worker.
 */
export const nativeR2Configuration = (
  env: Readonly<Record<string, string | undefined>>,
): NativeR2ConfigurationResult => {
  const reasons: Array<string> = []
  const s3 = s3Configuration("r2-s3", env)
  if (s3.status === "unmet") reasons.push(...s3.reasons.map((reason) => `r2-s3: ${reason}`))
  const endpoint = required(env, "GENERALIST_DURABILITY_NATIVE_R2_ENDPOINT", reasons)
  const token = required(env, "GENERALIST_DURABILITY_NATIVE_R2_TOKEN", reasons)
  if (endpoint !== "") {
    try {
      const url = new URL(endpoint)
      if (
        !endpointPattern.test(endpoint) ||
        url.protocol !== "https:" ||
        url.username !== "" ||
        url.password !== "" ||
        url.port !== "" ||
        url.pathname !== "/" ||
        url.search !== "" ||
        url.hash !== ""
      ) {
        reasons.push("GENERALIST_DURABILITY_NATIVE_R2_ENDPOINT must be an HTTPS Worker origin without credentials, a path, query, or fragment")
      }
    } catch {
      reasons.push("GENERALIST_DURABILITY_NATIVE_R2_ENDPOINT must be a valid HTTPS Worker origin")
    }
  }
  if (token !== "" && (token.length > 512 || /[\r\n]/.test(token))) {
    reasons.push("GENERALIST_DURABILITY_NATIVE_R2_TOKEN must be at most 512 characters without line breaks")
  }
  const seed = boundedNumber(env, "GENERALIST_DURABILITY_SEED", 1, 0, 0xffff_ffff, reasons)
  const concurrency = boundedNumber(env, "GENERALIST_DURABILITY_CONCURRENCY", 4, 2, maxCommandCount, reasons)
  if (
    env.GENERALIST_DURABILITY_CLEANUP !== undefined &&
    env.GENERALIST_DURABILITY_CLEANUP !== "0" &&
    env.GENERALIST_DURABILITY_CLEANUP !== "1"
  ) {
    reasons.push("GENERALIST_DURABILITY_CLEANUP must be 0 or 1")
  }
  if (s3.status === "unmet" || reasons.length > 0) return { status: "unmet", provider: nativeR2Provider, reasons }
  const configuration = s3.configuration
  return {
    status: "configured",
    configuration: {
      provider: nativeR2Provider,
      connection: configuration.connection,
      endpoint,
      token,
      environment: configuration.environment,
      tenant: configuration.tenant,
      seed,
      concurrency,
      cleanup: configuration.cleanup,
      s3: configuration,
    },
  }
}



export type NativeR2WriterState = "stopped" | "uncertain"
export const nativeR2WriterState = (acknowledged: boolean): NativeR2WriterState =>
  acknowledged ? "stopped" : "uncertain"
const safeFailureEvidence = (error: unknown): CaseEvidence["failure"] => {
  const reason = error instanceof ObjectStoreConformanceFailure ? "invalid-response" : safeFailureReason(error)
  return { tag: error instanceof NativeR2Failure ? error._tag : "native-r2-failure", reason }
}
const nativeRequest = (
  configuration: NativeR2Configuration,
  request: NativeR2Request,
): Effect.Effect<NativeR2Response, NativeR2Failure> => Effect.tryPromise({
  try: async (interruption) => {
    interruption.throwIfAborted()
    const controller = new AbortController()
    let timedOut = false
    const interrupt = () => controller.abort(interruption.reason)
    interruption.addEventListener("abort", interrupt, { once: true })
    const timeout = setTimeout(() => {
      timedOut = true
      controller.abort(new DOMException("Native R2 qualification request timed out", "TimeoutError"))
    }, 60_000)
    try {
      const endpoint = new URL("/qualification", configuration.endpoint).toString()
      const response = await fetch(endpoint, {
        method: "POST",
        redirect: "error",
        signal: controller.signal,
        headers: { authorization: `Bearer ${configuration.token}`, "content-type": "application/json" },
        body: JSON.stringify(request),
      })
      const length = response.headers.get("content-length")
      if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxResponseBytes)) {
        throw new NativeR2Failure({ reason: "invalid-response" })
      }
      const bytes = await readBoundedStream(response.body, maxResponseBytes, "invalid-response")
      if (!response.ok) {
        let reason: NativeR2Reason = response.status === 401 || response.status === 403 ? "authentication" : "transport"
        try {
          const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes))
          const candidate = parsed !== null && typeof parsed === "object" && "reason" in parsed ? parsed.reason : undefined
          if (isNativeR2Reason(candidate)) reason = candidate
        } catch {
          // Never expose a response body; retain the bounded transport reason.
        }
        throw new NativeR2Failure({ reason })
      }
      let parsed: unknown
      try {
        parsed = JSON.parse(new TextDecoder().decode(bytes))
      } catch {
        throw new NativeR2Failure({ reason: "invalid-response" })
      }
      const decoded = await Effect.runPromise(decodeResponse(parsed).pipe(Effect.result))
      if (Result.isFailure(decoded)) throw new NativeR2Failure({ reason: "invalid-response" })
      return decoded.success
    } catch (error) {
      if (error instanceof NativeR2Failure) throw error
      if (timedOut || (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError"))) {
        throw new NativeR2Failure({ reason: "timeout" })
      }
      throw new NativeR2Failure({ reason: "transport" })
    } finally {
      clearTimeout(timeout)
      interruption.removeEventListener("abort", interrupt)
      controller.abort()
    }
  },
  catch: (cause) => cause instanceof NativeR2Failure ? cause : new NativeR2Failure({ reason: "transport" }),
})

const check = (condition: boolean, name: string, message: string) => condition
  ? Effect.void
  : Effect.fail(new ObjectStoreConformanceFailure({ check: name, message }))

/** Runs native and S3 Journal instances over the same fixed namespace. */
export const qualifyNativeR2 = (
  configuration: NativeR2Configuration,
  host: { readonly runId: string; readonly runtime: string },
): Effect.Effect<
  NativeR2Evidence,
  NativeR2Failure | ObjectStoreFailure | DurabilityFailure | ObjectStoreConformanceFailure,
  Crypto.Crypto
> => Effect.gen(function* () {
  if (!isRunId(host.runId)) return yield* new NativeR2Failure({ reason: "invalid-request" })
  const startedAt = yield* Clock.currentTimeMillis
  const namespace = nativeR2Namespace(configuration.environment, configuration.tenant, host.runId)
  const identity = { environment: configuration.environment, tenant: `${configuration.tenant}~${host.runId}` }
  const requests = { worker: 0, read: 0, create: 0, list: 0, conflicts: 0, continuationPages: 0 }
  const raw = yield* S3.make(configuration.connection)
  const store: Service = {
    capabilities: raw.capabilities,
    read: (key, options) => Effect.gen(function* () {
      if (!key.startsWith(namespace)) return yield* new ObjectStoreFailure({ operation: "qualification-scope", key, reason: "invalid-response", message: "Qualification key escaped its fixed namespace" })
      requests.read += 1
      return yield* raw.read(key, options)
    }),
    create: (key, bytes) => Effect.gen(function* () {
      if (!key.startsWith(namespace)) return yield* new ObjectStoreFailure({ operation: "qualification-scope", key, reason: "invalid-response", message: "Qualification key escaped its fixed namespace" })
      requests.create += 1
      const outcome = yield* raw.create(key, bytes)
      if (outcome !== "created") requests.conflicts += 1
      return outcome
    }),
    list: (prefix, cursor) => Effect.gen(function* () {
      if (!prefix.startsWith(namespace)) return yield* new ObjectStoreFailure({ operation: "qualification-scope", key: prefix, reason: "invalid-response", message: "Qualification prefix escaped its fixed namespace" })
      requests.list += 1
      if (cursor !== undefined) requests.continuationPages += 1
      return yield* raw.list(prefix, cursor)
    }),
  }
  const expectedNamespace = nativeR2Namespace(configuration.environment, configuration.tenant, host.runId)
  const preflightRequest: NativeR2Request = { schemaVersion: 1, operation: "preflight", runId: host.runId }
  requests.worker += 1
  const preflight = yield* nativeRequest(configuration, preflightRequest)
  yield* check(
    preflight.result === "ready" &&
      preflight.environment === identity.environment &&
      preflight.tenant === identity.tenant &&
      preflight.namespace === expectedNamespace,
    "native-preflight",
    "The authenticated Worker did not report the configured fixed qualification identity",
  )
  const firstPage = yield* store.list(namespace)
  yield* check(firstPage.keys.length === 0 && firstPage.cursor === undefined, "namespace", "The fixed qualification namespace is not empty")
  const open = (partition: string) => Journal.make({
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
  const runCase = <E>(name: string, scenario: Effect.Effect<unknown, E, Crypto.Crypto>) => Effect.gen(function* () {
    if (failed) {
      cases.push({ name, result: "not-run", durationMs: 0 })
      return
    }
    const start = yield* Clock.currentTimeMillis
    const result = yield* scenario.pipe(Effect.scoped, Effect.timeout("5 minutes"), Effect.catchDefect(() => Effect.fail(new NativeR2Failure({ reason: "transport" }))), Effect.result)
    const durationMs = (yield* Clock.currentTimeMillis) - start
    if (Result.isFailure(result)) {
      failed = true
      writerState = nativeR2WriterState(false)
    } else cases.push({ name, result: "passed", durationMs })
  })
  const recoverContentionThroughS3 = (native: NativeR2Response) => Effect.gen(function* () {
    if (native.head === undefined) return yield* new NativeR2Failure({ reason: "invalid-response" })
    const journal = yield* open("native-contention")
    const receipts: Array<{ readonly count: number }> = []
    for (const entry of native.history) {
      const command = { id: entry.id, input: { seed: configuration.seed, index: Number(entry.id.split("-").at(-1)) } }
      const receipt = yield* journal.commit(command, () => Effect.fail(new NativeR2Failure({ reason: "receipt-mismatch" })))
      receipts.push(decodeReceipt(receipt))
    }
    const head = yield* journal.read
    yield* check(equal(receipts, native.history.map((entry) => entry.receipt)), "native-contention-receipts", "S3 recovery changed a native contention receipt")
    yield* check(head.sequence === native.head.sequence && head.stateDigest === native.head.stateDigest, "native-contention-history", "S3 recovery changed native contention history")
  })
  const commitAndRead = (partition: "native" | "s3", count: number) => Effect.gen(function* () {
    const commands = nativeR2Commands(partition, configuration.seed, count)
    const journal = yield* open(partition)
    const receipts: Array<{ readonly id: string; readonly receipt: QualificationReceipt }> = []
    for (const command of commands) {
      const receipt = yield* journal.commit(command, (state) => transition(command.id, state))
      receipts.push({ id: command.id, receipt: decodeReceipt(receipt) })
    }
    return { journal, commands, receipts, head: yield* journal.read }
  })
  const recoverThroughS3 = (native: NativeR2Response) => Effect.gen(function* () {
    if (native.head === undefined) return yield* new NativeR2Failure({ reason: "invalid-response" })
    const journal = yield* open("native")
    const receipts: Array<{ readonly count: number }> = []
    for (const entry of native.history) {
      const command = { id: entry.id, input: { seed: configuration.seed, index: Number(entry.id.split("-").at(-1)) } }
      const receipt = yield* journal.commit(command, () => Effect.fail(new NativeR2Failure({ reason: "receipt-mismatch" })))
      receipts.push(decodeReceipt(receipt))
    }
    const head = yield* journal.read
    yield* check(equal(receipts, native.history.map((entry) => entry.receipt)), "native-s3-receipts", "S3 recovery changed a native receipt")
    yield* check(head.sequence === native.head.sequence && head.stateDigest === native.head.stateDigest && summary(head).count === native.head.count, "native-s3-history", "S3 recovery changed native journal history")
  })
  yield* runCase("native-commits-recover-through-s3", Effect.gen(function* () {
    const count = 3
    requests.worker += 1
    const native = yield* nativeRequest(configuration, { schemaVersion: 1, operation: "commit", runId: host.runId, partition: "native", seed: configuration.seed, count })
    yield* check(native.result === "passed" && native.head !== undefined && native.history.length === count, "native-commit", "Native Worker did not return the complete committed history")
    yield* recoverThroughS3(native)
  }))
  const recoverThroughNative = (partition: "s3" | "s3-contention", expected: { readonly receipts: ReadonlyArray<{ readonly id: string; readonly receipt: { readonly count: number } }>; readonly head: Journal.Head }, seed: number) => Effect.gen(function* () {
    const expectedHead = summary(expected.head)
    requests.worker += 1
    const recovered = yield* nativeRequest(configuration, {
      schemaVersion: 1,
      operation: "recover",
      runId: host.runId,
      partition,
      seed,
      count: expected.receipts.length,
      expected: { receipts: expected.receipts.map(({ receipt }) => receipt), ...expectedHead },
    })
    yield* check(recovered.result === "passed" && recovered.head !== undefined, "native-recovery", "Native recovery did not return the committed S3 history")
    yield* check(equal(recovered.history, expected.receipts), "native-receipts", "Native recovery changed an S3 receipt")
  })
  yield* runCase("s3-commits-recover-through-native", Effect.gen(function* () {
    const committed = yield* commitAndRead("s3", 3)
    yield* recoverThroughNative("s3", committed, configuration.seed)
  }))
  yield* runCase("native-contention-has-independent-winners", Effect.gen(function* () {
    requests.worker += 1
    const native = yield* nativeRequest(configuration, { schemaVersion: 1, operation: "contention", runId: host.runId, partition: "native-contention", seed: configuration.seed, count: configuration.concurrency })
    if (native.contention === undefined) return yield* new NativeR2Failure({ reason: "invalid-response" })
    yield* check(native.result === "passed" && native.history.length === configuration.concurrency, "native-contention", "Native contention did not return bounded independent outcomes")
    yield* check(equal(native.contention.counts, Array.from({ length: configuration.concurrency }, (_, index) => index + 1)), "native-contention", "Native contention lost or duplicated a winner")
    yield* recoverContentionThroughS3(native)
  }))
  yield* runCase("s3-contention-recovers-through-native", Effect.gen(function* () {
    const commands = nativeR2Commands("s3-contention", configuration.seed, configuration.concurrency)
    const start = yield* Deferred.make<void>()
    const journals = yield* Effect.forEach(commands, () => open("s3-contention"))
    const fibers = yield* Effect.forEach(journals, (journal, index) => Deferred.await(start).pipe(
      Effect.andThen(journal.commit(commands[index]!, (state) => transition(commands[index]!.id, state))),
      Effect.map((receipt) => ({ id: commands[index]!.id, receipt: decodeReceipt(receipt) })),
      Effect.forkChild({ startImmediately: true }),
    ))
    yield* Deferred.succeed(start, undefined)
    const receipts = yield* Effect.forEach(fibers, Fiber.join)
    const counts = receipts.map(({ receipt }) => receipt.count).sort((left, right) => left - right)
    yield* check(equal(counts, Array.from({ length: configuration.concurrency }, (_, index) => index + 1)), "s3-contention", "S3 contention lost or duplicated a winner")
    const head = yield* open("s3-contention").pipe(Effect.flatMap((journal) => journal.read))
    yield* recoverThroughNative("s3-contention", { receipts, head }, configuration.seed)
  }))
  const finishedAt = yield* Clock.currentTimeMillis
  const cleanup = { result: "retained" as const, removedObjects: 0, writers: writerState, reason: writerState === "uncertain" ? "Completion was not positively acknowledged; retained namespace may contain in-flight native writes" : "Cleanup is disabled for native qualification evidence" }
  return {
    schemaVersion: 1,
    provider: nativeR2Provider,
    runtime: host.runtime,
    runId: host.runId,
    result: failed ? "failed" : "passed",
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date(finishedAt).toISOString(),
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
})

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
  readonly requests: { readonly worker: number; readonly read: number; readonly create: number; readonly list: number; readonly conflicts: number; readonly continuationPages: number }
  readonly cases: ReadonlyArray<CaseEvidence>
  readonly cleanup: { readonly result: "retained"; readonly removedObjects: number; readonly writers: NativeR2WriterState; readonly reason: string }
  readonly unmetGates: ReadonlyArray<string>
}

