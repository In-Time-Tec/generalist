import { Crypto, Deferred, Effect, Fiber, Layer, Result, Schema } from "effect"
import { DurabilityFailure } from "../../durability/errors.js"
import * as Journal from "../../durability/internal/journal.js"
import type * as Protocol from "../../durability/internal/protocol.js"
import { ObjectStore, ObjectStoreFailure } from "../../durability/object-store.js"
import * as R2 from "../../durability/r2.js"

/** The explicit qualification gate shared by the native Worker and host protocol. */
export const nativeR2Provider = "r2-native-s3-interoperability" as const
export type NativeR2Provider = typeof nativeR2Provider

const identityPattern = /^[a-z0-9][a-z0-9_-]{0,47}$/
const runIdPattern = /^[a-z0-9][a-z0-9-]{15,79}$/
const maxRequestBytes = 16 * 1024
export const maxResponseBytes = 64 * 1024
export const maxCommandCount = 8
export const maxCommitBytes = 1024 * 1024

const Identity = Schema.String.check(Schema.isPattern(identityPattern))
const RunId = Schema.String.check(Schema.isPattern(runIdPattern))
const Partition = Schema.Literals(["native", "s3", "native-contention", "s3-contention"])
const Operation = Schema.Literals(["preflight", "commit", "recover", "contention"])
const Seed = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0), Schema.isLessThanOrEqualTo(0xffff_ffff))
const Count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1), Schema.isLessThanOrEqualTo(maxCommandCount))
const Receipt = Schema.Struct({ count: Schema.Int })
export type QualificationReceipt = typeof Receipt.Type
export const decodeReceipt = (value: Protocol.Json): QualificationReceipt => Schema.decodeUnknownSync(Receipt)(value)
const Expected = Schema.Struct({
  receipts: Schema.Array(Receipt),
  sequence: Schema.String,
  count: Schema.Int,
  stateDigest: Schema.String,
})

/** Wire request accepted by the qualification Worker. It intentionally contains no object key. */
export const NativeR2Request = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  operation: Operation,
  runId: RunId,
  partition: Schema.optionalKey(Partition),
  seed: Schema.optionalKey(Seed),
  count: Schema.optionalKey(Count),
  expected: Schema.optionalKey(Expected),
})
export type NativeR2Request = typeof NativeR2Request.Type

const Reason = Schema.Literals([
  "authentication",
  "configuration",
  "invalid-request",
  "invalid-response",
  "transport",
  "timeout",
  "unavailable",
  "contention",
  "corruption",
  "indeterminate",
  "receipt-mismatch",
  "namespace",
])
export const isNativeR2Reason = Schema.is(Reason)
export type NativeR2Reason = typeof Reason.Type

const Head = Schema.Struct({ sequence: Schema.String, count: Schema.Int, stateDigest: Schema.String })
const HistoryEntry = Schema.Struct({ id: Schema.String, receipt: Receipt })
const Contention = Schema.Struct({ expected: Schema.Int, counts: Schema.Array(Schema.Int) })

/** Typed non-secret response. Error messages and provider response bodies are deliberately absent. */
export const NativeR2Response = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  result: Schema.Literals(["ready", "passed", "failed"]),
  operation: Operation,
  runId: RunId,
  environment: Identity,
  tenant: Schema.String.check(Schema.isPattern(/^[a-z0-9][a-z0-9_-]{0,47}~[a-z0-9][a-z0-9-]{15,79}$/)),
  partition: Schema.optionalKey(Partition),
  namespace: Schema.String,
  history: Schema.Array(HistoryEntry),
  head: Schema.optionalKey(Head),
  contention: Schema.optionalKey(Contention),
  reason: Schema.optionalKey(Reason),
})
export type NativeR2Response = typeof NativeR2Response.Type

export class NativeR2Failure extends Schema.TaggedError<NativeR2Failure>()(
  "generalist/testing/durability/NativeR2Failure",
  { reason: Reason },
) {}

export const isIdentity = Schema.is(Identity)
export const isRunId = Schema.is(RunId)
const decodeRequest = Schema.decodeUnknownEffect(NativeR2Request, { onExcessProperty: "error" })
export const decodeResponse = Schema.decodeUnknownEffect(NativeR2Response, { onExcessProperty: "error" })
/** Fixed namespace owned by this host run; neither side accepts a caller-supplied prefix. */
export const nativeR2Namespace = (environment: string, tenant: string, runId: string): string =>
  `environments/${environment}/v1/tenants/${tenant}~${runId}/`

/** Commands are generated from bounded scalars so the Worker never accepts arbitrary journal input. */
export const nativeR2Commands = (partition: NonNullable<NativeR2Request["partition"]>, seed: number, count: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: `${partition}-${index}`,
    input: { seed, index },
  }))

export type QualificationTransition = {
  readonly patches: ReadonlyArray<Protocol.Patch>
  readonly receipt: Protocol.Json
}
export const transition = (id: string, state: Journal.State): Effect.Effect<QualificationTransition> => {
  const count = typeof state.count === "number" ? state.count + 1 : 1
  return Effect.succeed({
    patches: [
      { op: "set" as const, path: ["count"], value: count },
      { op: "set" as const, path: ["commands", id], value: true },
    ],
    receipt: { count },
  })
}

export const equal = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right)
export const summary = (head: Journal.Head) => ({
  sequence: head.sequence,
  count: typeof head.state.count === "number" ? head.state.count : 0,
  stateDigest: head.stateDigest,
})

const response = (
  input: Pick<NativeR2Response, "operation" | "runId" | "environment" | "tenant" | "namespace"> &
    Partial<Pick<NativeR2Response, "partition" | "history" | "head" | "contention" | "reason">>,
  result: NativeR2Response["result"],
): NativeR2Response => ({
  schemaVersion: 1,
  result,
  operation: input.operation,
  runId: input.runId,
  environment: input.environment,
  tenant: input.tenant,
  namespace: input.namespace,
  history: input.history ?? [],
  ...(input.partition === undefined ? {} : { partition: input.partition }),
  ...(input.head === undefined ? {} : { head: input.head }),
  ...(input.contention === undefined ? {} : { contention: input.contention }),
  ...(input.reason === undefined ? {} : { reason: input.reason }),
})

export const safeFailureReason = (error: unknown): NativeR2Reason => {
  if (error instanceof NativeR2Failure) return error.reason
  if (error instanceof ObjectStoreFailure) {
    switch (error.reason) {
      case "timeout":
        return "timeout"
      case "authentication":
        return "authentication"
      case "invalid-response":
        return "invalid-response"
      case "rate-limit":
        return "unavailable"
      case "limit":
        return "invalid-response"
      case "unavailable":
        return "unavailable"
    }
  }
  if (error instanceof DurabilityFailure) {
    if (error.reason === "indeterminate") return "indeterminate"
    if (error.reason === "corruption") return "corruption"
    if (error.reason === "contention") return "contention"
    if (error.reason === "transport") return "transport"
  }
  return "transport"
}


const requestBody = (value: unknown): Effect.Effect<NativeR2Request, NativeR2Failure> =>
  decodeRequest(value).pipe(
    Effect.mapError(() => new NativeR2Failure({ reason: "invalid-request" })),
    Effect.flatMap((request) => {
      if (!isRunId(request.runId)) return Effect.fail(new NativeR2Failure({ reason: "invalid-request" }))
      if (request.operation === "preflight") {
        return request.partition === undefined && request.seed === undefined && request.count === undefined && request.expected === undefined
          ? Effect.succeed(request)
          : Effect.fail(new NativeR2Failure({ reason: "invalid-request" }))
      }
      if (request.partition === undefined || request.seed === undefined || request.count === undefined) {
        return Effect.fail(new NativeR2Failure({ reason: "invalid-request" }))
      }
      if (
        (request.operation === "commit" && request.partition !== "native") ||
        (request.operation === "contention" && request.partition !== "native-contention") ||
        (request.operation === "recover" && request.partition !== "s3" && request.partition !== "s3-contention")
      ) return Effect.fail(new NativeR2Failure({ reason: "invalid-request" }))
      if (request.operation !== "recover" && request.expected !== undefined) {
        return Effect.fail(new NativeR2Failure({ reason: "invalid-request" }))
      }
      if (request.operation === "recover" && request.expected !== undefined && (
        request.expected.receipts.length !== request.count ||
        request.expected.receipts.length > maxCommandCount
      )) {
        return Effect.fail(new NativeR2Failure({ reason: "invalid-request" }))
      }
      return Effect.succeed(request)
    }),
  )

const workerIdentity = (environment: string, tenant: string, runId: string): Effect.Effect<
  { readonly environment: string; readonly tenant: string; readonly namespace: string },
  NativeR2Failure
> => {
  if (!isIdentity(environment) || !isIdentity(tenant) || !isRunId(runId)) {
    return Effect.fail(new NativeR2Failure({ reason: "configuration" }))
  }
  return Effect.succeed({ environment, tenant: `${tenant}~${runId}`, namespace: nativeR2Namespace(environment, tenant, runId) })
}

const runWorkerRequest = (
  request: NativeR2Request,
  bucket: R2.Bucket,
  environment: string,
  tenant: string,
  cryptoLayer: Layer.Layer<Crypto.Crypto>,
): Effect.Effect<NativeR2Response, NativeR2Failure> => Effect.gen(function* () {
  const identity = yield* workerIdentity(environment, tenant, request.runId)
  const base = {
    operation: request.operation,
    runId: request.runId,
    environment: identity.environment,
    tenant: identity.tenant,
    namespace: identity.namespace,
  } as const
  if (request.operation === "preflight") return response(base, "ready")
  if (request.partition === undefined || request.seed === undefined || request.count === undefined) {
    return yield* new NativeR2Failure({ reason: "invalid-request" })
  }
  const store = R2.make(bucket, { requestTimeoutMs: 30_000 })
  const open = (partition: string) => Journal.make({
    environment: identity.environment,
    tenant: identity.tenant,
    partition,
    snapshotEvery: 2,
    maxConflictRetries: 64,
    maxCommitBytes,
  }).pipe(
    Effect.provideService(ObjectStore, store),
    Effect.provide(cryptoLayer),
    Effect.mapError((error) => new NativeR2Failure({ reason: safeFailureReason(error) })),
  )
  const read = (journal: Journal.Journal) => journal.read.pipe(
    Effect.mapError((error) => new NativeR2Failure({ reason: safeFailureReason(error) })),
  )
  const commit = (
    journal: Journal.Journal,
    command: { readonly id: string; readonly input: Protocol.Json },
    evaluate: (state: Journal.State) => Effect.Effect<QualificationTransition, NativeR2Failure>,
  ) =>
    journal.commit(command, evaluate).pipe(
      Effect.mapError((error) => new NativeR2Failure({ reason: safeFailureReason(error) })),
    )
  const commands = nativeR2Commands(request.partition, request.seed, request.count)
  if (request.operation === "contention") {
    const initial = yield* open(request.partition)
    const before = yield* read(initial)
    if (before.sequence !== "-1") return yield* new NativeR2Failure({ reason: "namespace" })
    const start = yield* Deferred.make<void>()
    const journals = yield* Effect.forEach(commands, () => open(request.partition!))
    const fibers = yield* Effect.forEach(journals, (journal, index) =>
      Deferred.await(start).pipe(
        Effect.andThen(commit(journal, commands[index]!, (state) => transition(commands[index]!.id, state))),
        Effect.map((receipt) => ({ id: commands[index]!.id, receipt: decodeReceipt(receipt) })),
        Effect.forkChild({ startImmediately: true }),
      ),
    )
    yield* Deferred.succeed(start, undefined)
    const history = yield* Effect.forEach(fibers, Fiber.join)
    const journal = yield* open(request.partition)
    const head = yield* read(journal)
    const counts = history.map(({ receipt }) => receipt.count).sort((left, right) => left - right)
    if (!equal(counts, Array.from({ length: request.count }, (_, index) => index + 1))) {
      return yield* new NativeR2Failure({ reason: "contention" })
    }
    return response({ ...base, partition: request.partition, history, head: summary(head), contention: { expected: request.count, counts } }, "passed")
  }
  const journal = yield* open(request.partition)
  if (request.operation === "commit") {
    const before = yield* read(journal)
    if (before.sequence !== "-1") return yield* new NativeR2Failure({ reason: "namespace" })
  }
  const history: Array<{ readonly id: string; readonly receipt: { readonly count: number } }> = []
  for (const command of commands) {
    const receipt = yield* commit(journal, command, (state) =>
      request.operation === "recover"
        ? Effect.fail(new NativeR2Failure({ reason: "receipt-mismatch" }))
        : transition(command.id, state),
    )
    history.push({ id: command.id, receipt: decodeReceipt(receipt) })
  }
  const head = yield* read(journal)
  const summarized = summary(head)
  if (request.operation === "recover" && request.expected !== undefined && !equal(history.map((entry) => entry.receipt), request.expected.receipts)) {
    return yield* new NativeR2Failure({ reason: "receipt-mismatch" })
  }
  if (request.operation === "recover" && request.expected !== undefined && (
    summarized.sequence !== request.expected.sequence ||
    summarized.count !== request.expected.count ||
    summarized.stateDigest !== request.expected.stateDigest
  )) return yield* new NativeR2Failure({ reason: "receipt-mismatch" })
  return response({ ...base, partition: request.partition, history, head: summarized }, "passed")
})
interface NativeR2WorkerEnvironment {
  readonly bucket: R2.Bucket
  readonly token: string
  readonly enabled: string
  readonly environment: string
  readonly tenant: string
}

const jsonResponse = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } })

export const readBoundedStream = async (
  body: ReadableStream<Uint8Array> | null,
  limit: number,
  reason: NativeR2Reason,
): Promise<Uint8Array> => {
  if (body === null) return new Uint8Array()
  const reader = body.getReader()
  const chunks: Array<Uint8Array> = []
  let length = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      if (!(next.value instanceof Uint8Array) || next.value.byteLength > limit - length) {
        throw new NativeR2Failure({ reason })
      }
      if (next.value.byteLength > 0) chunks.push(next.value)
      length += next.value.byteLength
    }
    const bytes = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return bytes
  } catch (error) {
    await reader.cancel(error).catch(() => {})
    throw error
  } finally {
    reader.releaseLock()
  }
}
const readBoundedBody = (request: Request): Promise<Uint8Array> =>
  readBoundedStream(request.body, maxRequestBytes, "invalid-request")
const genericErrorResponse = (reason: NativeR2Reason, status: number): Response =>
  jsonResponse({ schemaVersion: 1, result: "failed", reason }, status)

/**
 * Authenticated Worker entrypoint. It is intentionally exported from the test
 * qualification module so the fixture and host use one schema and one protocol.
 */
export const handleNativeR2Request = async (
  request: Request,
  environment: NativeR2WorkerEnvironment,
  cryptoLayer: Layer.Layer<Crypto.Crypto>,
): Promise<Response> => {
  try {
  if (environment.enabled !== "1") return genericErrorResponse("configuration", 503)
  const authorization = request.headers.get("authorization")
  if (new URL(request.url).pathname !== "/qualification") return genericErrorResponse("invalid-request", 404)
  if (request.method !== "POST" || authorization !== `Bearer ${environment.token}`) {
    return genericErrorResponse("authentication", 401)
  }
  if (
    typeof environment.token !== "string" ||
    environment.token.length === 0 ||
    !isIdentity(environment.environment) ||
    !isIdentity(environment.tenant)
  ) {
    return genericErrorResponse("configuration", 503)
  }
  const contentLength = request.headers.get("content-length")
  if (contentLength !== null && (!/^\d+$/.test(contentLength) || Number(contentLength) > maxRequestBytes)) {
    return genericErrorResponse("invalid-request", 413)
  }
  let body: unknown
  try {
    const bytes = await readBoundedBody(request)
    body = JSON.parse(new TextDecoder().decode(bytes))
  } catch (error) {
    if (error instanceof NativeR2Failure && error.reason === "invalid-request") return genericErrorResponse("invalid-request", 413)
    return genericErrorResponse("invalid-request", 400)
  }
  const decoded = await Effect.runPromise(requestBody(body).pipe(Effect.result))
  if (Result.isFailure(decoded)) return genericErrorResponse(decoded.failure.reason, 400)
  const result = await Effect.runPromise(runWorkerRequest(decoded.success, environment.bucket, environment.environment, environment.tenant, cryptoLayer).pipe(Effect.result))
  if (Result.isFailure(result)) {
    const status = result.failure.reason === "authentication" ? 401 : result.failure.reason === "invalid-request" ? 400 : 500
    const identity = workerIdentity(environment.environment, environment.tenant, decoded.success.runId)
    const safe = await Effect.runPromise(identity.pipe(Effect.result))
    if (Result.isFailure(safe)) return genericErrorResponse(result.failure.reason, status)
    return jsonResponse(response({
      operation: decoded.success.operation,
      runId: decoded.success.runId,
      environment: safe.success.environment,
      tenant: safe.success.tenant,
      namespace: safe.success.namespace,
      ...(decoded.success.partition === undefined ? {} : { partition: decoded.success.partition }),
      reason: result.failure.reason,
    }, "failed"), status)
  }
  return jsonResponse(result.success, result.success.result === "passed" || result.success.result === "ready" ? 200 : 500)
  } catch {
    return genericErrorResponse("transport", 500)
  }
}

/** Worker fixture adapter for the narrow binding contract. */
export const nativeR2Worker = (
  request: Request,
  environment: {
    readonly bucket: R2.Bucket
    readonly token: string
    readonly enabled: string
    readonly configuredEnvironment: string
    readonly configuredTenant: string
  },
  cryptoLayer: Layer.Layer<Crypto.Crypto>,
): Promise<Response> => handleNativeR2Request(request, {
  bucket: environment.bucket,
  token: environment.token,
  enabled: environment.enabled,
  environment: environment.configuredEnvironment,
  tenant: environment.configuredTenant,
}, cryptoLayer)
