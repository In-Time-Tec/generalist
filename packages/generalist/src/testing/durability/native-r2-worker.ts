import { Cause, Crypto, Deferred, Effect, Fiber, Layer, Result, Schema } from "effect"
import { DurabilityFailure } from "../../durability/errors.js"
import { ActionableTaggedError, errorHint } from "../../core/error-hint.js"
import {
  type Head as JournalHead,
  make as makeJournal,
  type Journal,
  type State,
} from "../../durability/internal/journal.js"
import type { Json } from "../../durability/internal/protocol.js"
import { ObjectStore, ObjectStoreFailure } from "../../durability/object-store.js"
import { type Bucket, make as makeR2 } from "../../durability/r2.js"
import type { ObjectStoreConformanceFailure } from "./conformance.js"
import { readBoundedBody } from "./native-r2-body.js"
import { transition, type QualificationTransition } from "./native-r2-transition.js"

/** The explicit qualification gate shared by the native Worker and host protocol. */
export const nativeR2Provider = "r2-native-s3-interoperability" as const
export type NativeR2Provider = typeof nativeR2Provider

const maxRequestBytes = 16 * 1024
export const maxResponseBytes = 64 * 1024
export const maxCommandCount = 8
export const maxCommitBytes = 1024 * 1024

const Identity = Schema.String.check(Schema.isPattern(/^[a-z0-9][a-z0-9_-]{0,47}$/))
const RunId = Schema.String.check(Schema.isPattern(/^[a-z0-9][a-z0-9-]{15,79}$/))
const isNumber = Schema.is(Schema.Finite)
const Partition = Schema.Literals(["native", "s3", "native-contention", "s3-contention"])
const Operation = Schema.Literals(["preflight", "commit", "recover", "contention"])
const Seed = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0), Schema.isLessThanOrEqualTo(0xffff_ffff))
const Count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1), Schema.isLessThanOrEqualTo(maxCommandCount))
const Receipt = Schema.Struct({ count: Schema.Int })
export type QualificationReceipt = typeof Receipt.Type
export const decodeReceipt = (value: Json): QualificationReceipt => Schema.decodeUnknownSync(Receipt)(value)
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
type WorkerFailure =
  | NativeR2Failure
  | ObjectStoreFailure
  | DurabilityFailure
  | ObjectStoreConformanceFailure
  | Cause.TimeoutError

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
export class NativeR2Failure extends ActionableTaggedError<NativeR2Failure>()(
  "generalist/testing/durability/NativeR2Failure",
  {
    reason: Reason,
    hint: errorHint(
      "Inspect the safe failure reason, correct the native R2 qualification configuration or request, and rerun with a fresh run ID.",
    ),
  },
) {}

export const isIdentity = Schema.is(Identity)
export const isRunId = Schema.is(RunId)
const decodeRequest = Schema.decodeUnknownEffect(NativeR2Request, { onExcessProperty: "error" })
const decodeJson = Schema.decodeEffect(Schema.fromJsonString(Schema.Json))
/** Fixed namespace owned by this host run; neither side accepts a caller-supplied prefix. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- direct native protocol constructor with three required coordinates.
export const nativeR2Namespace = (environment: string, tenant: string, runId: string): string =>
  `environments/${environment}/v1/tenants/${tenant}~${runId}/`

/** Commands are generated from bounded scalars so the Worker never accepts arbitrary journal input. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- direct native protocol constructor with three required scalars.
export const nativeR2Commands = (partition: NonNullable<NativeR2Request["partition"]>, seed: number, count: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: `${partition}-${index}`,
    input: { seed, index },
  }))

// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- direct JSON protocol comparator with two required values.
export const equal = (left: Schema.Json, right: Schema.Json): boolean =>
  Schema.encodeSync(Schema.fromJsonString(Schema.Json))(left) ===
  Schema.encodeSync(Schema.fromJsonString(Schema.Json))(right)
export const summary = (head: JournalHead) => ({
  sequence: head.sequence,
  count: isNumber(head.state.count) ? head.state.count : 0,
  stateDigest: head.stateDigest,
})

const response = (
  input: Pick<NativeR2Response, "operation" | "runId" | "environment" | "tenant" | "namespace"> &
    Partial<Pick<NativeR2Response, "partition" | "history" | "head" | "contention" | "reason">>,
  result: NativeR2Response["result"],
): NativeR2Response => {
  const base = {
    schemaVersion: 1 as const,
    result,
    operation: input.operation,
    runId: input.runId,
    environment: input.environment,
    tenant: input.tenant,
    namespace: input.namespace,
    history: input.history ?? [],
  }
  let output = NativeR2Response.make(base)
  if (input.partition !== undefined) output = NativeR2Response.make({ ...output, partition: input.partition })
  if (input.head !== undefined) output = NativeR2Response.make({ ...output, head: input.head })
  if (input.contention !== undefined) output = NativeR2Response.make({ ...output, contention: input.contention })
  if (input.reason !== undefined) output = NativeR2Response.make({ ...output, reason: input.reason })
  return output
}

export const safeFailureReason = (error: WorkerFailure): NativeR2Reason => {
  if (Schema.is(NativeR2Failure)(error)) return error.reason
  if (Schema.is(ObjectStoreFailure)(error)) {
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
  if (Schema.is(DurabilityFailure)(error)) {
    if (error.reason === "indeterminate") return "indeterminate"
    if (error.reason === "corruption") return "corruption"
    if (error.reason === "contention") return "contention"
    if (error.reason === "transport") return "transport"
  }
  return "transport"
}

const isPreflightRequest = (request: NativeR2Request): boolean =>
  request.partition === undefined &&
  request.seed === undefined &&
  request.count === undefined &&
  request.expected === undefined

const hasOperationInputs = (request: NativeR2Request): boolean =>
  request.partition !== undefined && request.seed !== undefined && request.count !== undefined

const isRecoveryExpectation = (request: NativeR2Request): boolean =>
  request.expected === undefined ||
  (request.expected.receipts.length === request.count && request.expected.receipts.length <= maxCommandCount)

const isExpectedRequest = (request: NativeR2Request): boolean => {
  if (!isRunId(request.runId)) return false
  if (request.operation === "preflight") return isPreflightRequest(request)
  if (!hasOperationInputs(request)) return false
  switch (request.operation) {
    case "commit":
      return request.partition === "native" && request.expected === undefined
    case "contention":
      return request.partition === "native-contention" && request.expected === undefined
    case "recover":
      return (request.partition === "s3" || request.partition === "s3-contention") && isRecoveryExpectation(request)
  }
}

const requestBody = (value: Schema.Json): Effect.Effect<NativeR2Request, NativeR2Failure> =>
  decodeRequest(value).pipe(
    Effect.mapError(() => NativeR2Failure.make({ reason: "invalid-request" })),
    Effect.filterOrFail(isExpectedRequest, () => NativeR2Failure.make({ reason: "invalid-request" })),
  )

const workerIdentity = (
  environment: string,
  tenant: string,
  runId: string,
): Effect.Effect<
  { readonly environment: string; readonly tenant: string; readonly namespace: string },
  NativeR2Failure
> => {
  if (!isIdentity(environment) || !isIdentity(tenant) || !isRunId(runId)) {
    return Effect.fail(NativeR2Failure.make({ reason: "configuration" }))
  }
  return Effect.succeed({
    environment,
    tenant: `${tenant}~${runId}`,
    namespace: nativeR2Namespace(environment, tenant, runId),
  })
}

const runWorkerRequest = (
  request: NativeR2Request,
  bucket: Bucket,
  environment: string,
  tenant: string,
  cryptoLayer: Layer.Layer<Crypto.Crypto>,
): Effect.Effect<NativeR2Response, NativeR2Failure> =>
  Effect.gen(function* () {
    const identity = yield* workerIdentity(environment, tenant, request.runId)
    const base = {
      operation: request.operation,
      runId: request.runId,
      environment: identity.environment,
      tenant: identity.tenant,
      namespace: identity.namespace,
    } as const
    if (request.operation === "preflight") return response(base, "ready")
    const partition = request.partition
    const seed = request.seed
    const count = request.count
    if (partition === undefined || seed === undefined || count === undefined) {
      return yield* NativeR2Failure.make({ reason: "invalid-request" })
    }
    const store = makeR2(bucket, { requestTimeoutMs: 30_000 })
    const open = (candidatePartition: string) =>
      makeJournal({
        environment: identity.environment,
        tenant: identity.tenant,
        partition: candidatePartition,
        snapshotEvery: 2,
        maxConflictRetries: 64,
        maxCommitBytes,
      }).pipe(
        Effect.provideService(ObjectStore, store),
        // oxlint-disable-next-line effecttsgo/strict-effect-provide -- this Worker request owns its caller-supplied crypto Layer.
        Effect.provide(cryptoLayer),
        Effect.mapError((error) => NativeR2Failure.make({ reason: safeFailureReason(error) })),
      )
    const read = (journal: Journal) =>
      journal.read.pipe(Effect.mapError((error) => NativeR2Failure.make({ reason: safeFailureReason(error) })))
    const commit = (
      journal: Journal,
      command: { readonly id: string; readonly input: Json },
      evaluate: (state: State) => Effect.Effect<QualificationTransition, NativeR2Failure>,
    ) =>
      journal
        .commit(command, evaluate)
        .pipe(Effect.mapError((error) => NativeR2Failure.make({ reason: safeFailureReason(error) })))
    const commands = nativeR2Commands(partition, seed, count)
    const contention = Effect.gen(function* () {
      const initial = yield* open(partition)
      const before = yield* read(initial)
      if (before.sequence !== "-1") return yield* NativeR2Failure.make({ reason: "namespace" })
      const start = yield* Deferred.make<void>()
      const journals = yield* Effect.forEach(commands, () => open(partition))
      const fibers = yield* Effect.forEach(journals, (journal, index) =>
        Deferred.await(start).pipe(
          Effect.andThen(commit(journal, commands[index]!, (state) => transition({ id: commands[index]!.id, state }))),
          Effect.map((receipt) => ({ id: commands[index]!.id, receipt: decodeReceipt(receipt) })),
          Effect.forkChild({ startImmediately: true }),
        ),
      )
      yield* Deferred.succeed(start, undefined)
      const history = yield* Effect.forEach(fibers, Fiber.join)
      const journal = yield* open(partition)
      const head = yield* read(journal)
      const counts = history.map(({ receipt }) => receipt.count).toSorted((left, right) => left - right)
      if (
        !equal(
          counts,
          Array.from({ length: count }, (_, index) => index + 1),
        )
      ) {
        return yield* NativeR2Failure.make({ reason: "contention" })
      }
      return response(
        {
          ...base,
          partition,
          history,
          head: summary(head),
          contention: { expected: count, counts },
        },
        "passed",
      )
    })
    if (request.operation === "contention") return yield* contention
    const sequential = () =>
      Effect.gen(function* () {
        const journal = yield* open(partition)
        if (request.operation === "commit") {
          const before = yield* read(journal)
          if (before.sequence !== "-1") return yield* NativeR2Failure.make({ reason: "namespace" })
        }
        const history: Array<{ readonly id: string; readonly receipt: { readonly count: number } }> = []
        for (const command of commands) {
          const receipt = yield* commit(journal, command, (state) =>
            request.operation === "recover"
              ? Effect.fail(NativeR2Failure.make({ reason: "receipt-mismatch" }))
              : transition({ id: command.id, state }),
          )
          history.push({ id: command.id, receipt: decodeReceipt(receipt) })
        }
        const head = yield* read(journal)
        const summarized = summary(head)
        if (
          request.operation === "recover" &&
          request.expected !== undefined &&
          !equal(
            history.map((entry) => entry.receipt),
            request.expected.receipts,
          )
        ) {
          return yield* NativeR2Failure.make({ reason: "receipt-mismatch" })
        }
        if (
          request.operation === "recover" &&
          request.expected !== undefined &&
          (summarized.sequence !== request.expected.sequence ||
            summarized.count !== request.expected.count ||
            summarized.stateDigest !== request.expected.stateDigest)
        )
          return yield* NativeR2Failure.make({ reason: "receipt-mismatch" })
        return response({ ...base, partition, history, head: summarized }, "passed")
      })
    return yield* sequential()
  })
interface NativeR2WorkerEnvironment {
  readonly bucket: Bucket
  readonly token: string
  readonly enabled: string
  readonly environment: string
  readonly tenant: string
}

const jsonResponse = (body: Schema.Json, status: number): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  })

const genericErrorResponse = (reason: NativeR2Reason, status: number): Response =>
  jsonResponse({ schemaVersion: 1, result: "failed", reason }, status)

const validateWorkerRequest = (request: Request, environment: NativeR2WorkerEnvironment): Response | undefined => {
  if (environment.enabled !== "1") return genericErrorResponse("configuration", 503)
  if (new URL(request.url).pathname !== "/qualification") return genericErrorResponse("invalid-request", 404)
  if (request.method !== "POST" || request.headers.get("authorization") !== `Bearer ${environment.token}`) {
    return genericErrorResponse("authentication", 401)
  }
  if (
    !Schema.is(Schema.NonEmptyString)(environment.token) ||
    !isIdentity(environment.environment) ||
    !isIdentity(environment.tenant)
  ) {
    return genericErrorResponse("configuration", 503)
  }
  const contentLength = request.headers.get("content-length")
  if (contentLength !== null && (!/^\d+$/.test(contentLength) || Number(contentLength) > maxRequestBytes)) {
    return genericErrorResponse("invalid-request", 413)
  }
  return undefined
}

const failureStatus = (reason: NativeR2Reason): number => {
  if (reason === "authentication") return 401
  if (reason === "invalid-request") return 400
  return 500
}

/**
 * Authenticated Worker entrypoint. It is intentionally exported from the test
 * qualification module so the fixture and host use one schema and one protocol.
 */
// oxlint-disable-next-line effecttsgo/async-function, effecttsgo/missing-pipeable-signature -- exported Worker fetch callback must return Promise<Response>.
export const handleNativeR2Request = async (
  request: Request,
  environment: NativeR2WorkerEnvironment,
  cryptoLayer: Layer.Layer<Crypto.Crypto>,
): Promise<Response> => {
  try {
    const rejected = validateWorkerRequest(request, environment)
    if (rejected !== undefined) return rejected
    let body: Schema.Json
    try {
      const bytes = await readBoundedBody({
        request,
        limit: maxRequestBytes,
        invalidBody: NativeR2Failure.make({ reason: "invalid-request" }),
      })
      body = await Effect.runPromise(decodeJson(new TextDecoder().decode(bytes)))
    } catch (error) {
      if (Schema.is(NativeR2Failure)(error) && error.reason === "invalid-request")
        return genericErrorResponse("invalid-request", 413)
      return genericErrorResponse("invalid-request", 400)
    }
    const decoded = await Effect.runPromise(requestBody(body).pipe(Effect.result))
    if (Result.isFailure(decoded)) return genericErrorResponse(decoded.failure.reason, 400)
    const result = await Effect.runPromise(
      runWorkerRequest(
        decoded.success,
        environment.bucket,
        environment.environment,
        environment.tenant,
        cryptoLayer,
      ).pipe(Effect.result),
    )
    if (Result.isFailure(result)) {
      const status = failureStatus(result.failure.reason)
      const identity = workerIdentity(environment.environment, environment.tenant, decoded.success.runId)
      const safe = await Effect.runPromise(identity.pipe(Effect.result))
      if (Result.isFailure(safe)) return genericErrorResponse(result.failure.reason, status)
      const failure = {
        operation: decoded.success.operation,
        runId: decoded.success.runId,
        environment: safe.success.environment,
        tenant: safe.success.tenant,
        namespace: safe.success.namespace,
        reason: result.failure.reason,
      }
      return jsonResponse(
        response(
          decoded.success.partition === undefined ? failure : { ...failure, partition: decoded.success.partition },
          "failed",
        ),
        status,
      )
    }
    return jsonResponse(
      result.success,
      result.success.result === "passed" || result.success.result === "ready" ? 200 : 500,
    )
  } catch {
    return genericErrorResponse("transport", 500)
  }
}

/** Worker fixture adapter for the narrow binding contract. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- Worker fixture adapter preserves the platform fetch callback signature.
export const nativeR2Worker = (
  request: Request,
  environment: {
    readonly bucket: Bucket
    readonly token: string
    readonly enabled: string
    readonly configuredEnvironment: string
    readonly configuredTenant: string
  },
  cryptoLayer: Layer.Layer<Crypto.Crypto>,
): Promise<Response> =>
  handleNativeR2Request(
    request,
    {
      bucket: environment.bucket,
      token: environment.token,
      enabled: environment.enabled,
      environment: environment.configuredEnvironment,
      tenant: environment.configuredTenant,
    },
    cryptoLayer,
  )
