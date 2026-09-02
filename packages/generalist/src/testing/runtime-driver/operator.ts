import { expect, it } from "@effect/vitest"
import { Effect, Stream } from "effect"
import type { ExecutionClaim } from "../../runtime/run/store.js"
import type {
  OperatorResolveUnknownCapability,
  OperatorRetryCapability,
  OperatorScanCapability,
  Options,
  Services,
} from "./contract.js"

type Open<LayerError> = <A, E>(use: (services: Services) => Effect.Effect<A, E>) => Effect.Effect<A, E | LayerError>

const identity = (name: string, test: string) => {
  const slug = name.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()
  const prefix = `conformance:${slug}:${test}`
  return {
    sessionId: `session:${prefix}`,
    idempotencyKey: prefix,
  }
}

const startOperation = (
  services: Services,
  claim: ExecutionClaim,
  operationKey: string,
  replayPolicy: "pure" | "never",
) =>
  Effect.gen(function* () {
    const operation = yield* services.store.recordOperation({
      ...claim,
      operationKey,
      kind: "tool",
      inputDigest: operationKey,
      input: { operationKey },
      replayPolicy,
      attempt: 0,
    })
    yield* services.store.startOperation({ ...claim, operationId: operation.operationId })
    return operation
  })

const seedUnknown = (services: Services, claim: ExecutionClaim, operationKey: string) =>
  Effect.gen(function* () {
    const operation = yield* startOperation(services, claim, operationKey, "never")
    expect(yield* services.store.recoverRunningOperations(claim)).toBe("blocked")
    return operation
  })

const registerExplain = <LayerError>(options: Options<LayerError, unknown>, open: Open<LayerError>) => {
  if (options.capabilities["operator-explain"] !== true) return
  it.effect("derives and verifies recovery from the journal", () =>
    open(({ runtime }) =>
      Effect.gen(function* () {
        const id = identity(options.name, "operator-explain")
        const receipt = yield* runtime.send({
          to: options.address,
          sessionId: id.sessionId,
          idempotencyKey: id.idempotencyKey,
          prompt: "explain recovery",
        })
        const explanation = yield* runtime.operator.explain(receipt.runId)
        expect(explanation.decision).toEqual({ _tag: "Resume" })
        expect(explanation.obligations).toEqual([])
        expect(explanation.lastSequence).toBeGreaterThanOrEqual(0)
        expect(yield* runtime.operator.verify(receipt.runId)).toEqual({ ...explanation, drift: [] })
      }),
    ),
  )
}

const registerRetry = <LayerError>(
  options: Options<LayerError, unknown>,
  open: Open<LayerError>,
  capability: OperatorRetryCapability,
) => {
  it.effect("retries only the safe operation named by the recovery decision", () =>
    open((services) =>
      Effect.gen(function* () {
        const id = identity(options.name, "operator-retry")
        const receipt = yield* services.runtime.send({
          to: options.address,
          sessionId: id.sessionId,
          idempotencyKey: id.idempotencyKey,
          prompt: "retry operation",
        })
        const claim = yield* capability.claim(services, { runId: receipt.runId, workerId: "operator-retry" })
        const operation = yield* startOperation(services, claim, `${id.idempotencyKey}:operation`, "pure")
        expect((yield* services.runtime.operator.explain(receipt.runId)).decision).toEqual({
          _tag: "RetryOperation",
          operationId: operation.operationId,
          attempt: 0,
        })

        yield* services.runtime.operator.retry(receipt.runId, "operator:retry")
        expect(
          (yield* services.store.getOperation({ runId: receipt.runId, operationId: operation.operationId })).status,
        ).toBe("requested")
        expect((yield* services.runtime.operator.explain(receipt.runId)).decision).toEqual({ _tag: "Resume" })
        const [operatorAction] = (yield* services.store.recoveryJournal(receipt.runId)).actions
        expect(operatorAction?.operator).toBe("operator:retry")
        expect(operatorAction?.action).toEqual({ _tag: "Retry", operationId: operation.operationId })
        const illegal = yield* services.runtime.operator.retry(receipt.runId, "operator:retry").pipe(Effect.flip)
        expect(illegal._tag).toBe("generalist/runtime/IllegalOperatorAction")
      }),
    ),
  )
}

const registerResolveUnknown = <LayerError>(
  options: Options<LayerError, unknown>,
  open: Open<LayerError>,
  capability: OperatorResolveUnknownCapability,
) => {
  it.effect("resolves exactly one unknown outcome and rejects a second resolution", () =>
    open((services) =>
      Effect.gen(function* () {
        const id = identity(options.name, "operator-resolve-unknown")
        const receipt = yield* services.runtime.send({
          to: options.address,
          sessionId: id.sessionId,
          idempotencyKey: id.idempotencyKey,
          prompt: "resolve unknown",
        })
        const claim = yield* capability.claim(services, {
          runId: receipt.runId,
          workerId: "operator-resolve-unknown",
        })
        const operation = yield* seedUnknown(services, claim, `${id.idempotencyKey}:operation`)
        expect((yield* services.runtime.operator.explain(receipt.runId)).decision._tag).toBe("Unknown")

        yield* services.runtime.operator.resolveUnknown(
          receipt.runId,
          operation.operationId,
          { outcome: "succeeded", result: "already completed" },
          "operator:resolve",
        )
        expect(
          yield* services.store.getOperation({ runId: receipt.runId, operationId: operation.operationId }),
        ).toMatchObject({ status: "succeeded", result: "already completed" })
        const [operatorAction] = (yield* services.store.recoveryJournal(receipt.runId)).actions
        expect(operatorAction?.operator).toBe("operator:resolve")
        expect(operatorAction?.action).toMatchObject({
          _tag: "ResolveUnknown",
          operationId: operation.operationId,
        })
        const illegal = yield* services.runtime.operator
          .resolveUnknown(
            receipt.runId,
            operation.operationId,
            { outcome: "failed", error: "different answer" },
            "operator:resolve",
          )
          .pipe(Effect.flip)
        expect(illegal._tag).toBe("generalist/runtime/IllegalOperatorAction")
      }),
    ),
  )
}

const registerScan = <LayerError>(
  options: Options<LayerError, unknown>,
  open: Open<LayerError>,
  capability: OperatorScanCapability,
) => {
  it.effect("scans outstanding recovery obligations across the store", () =>
    open((services) =>
      Effect.gen(function* () {
        const id = identity(options.name, "operator-scan")
        const receipt = yield* services.runtime.send({
          to: options.address,
          sessionId: id.sessionId,
          idempotencyKey: id.idempotencyKey,
          prompt: "scan obligations",
        })
        const claim = yield* capability.claim(services, { runId: receipt.runId, workerId: "operator-scan" })
        const operation = yield* seedUnknown(services, claim, `${id.idempotencyKey}:operation`)
        const obligations = Array.from(
          yield* services.runtime.operator.scanObligations().pipe(
            Stream.filter((obligation) => obligation.runId === receipt.runId),
            Stream.take(1),
            Stream.runCollect,
          ),
        )
        expect(obligations).toHaveLength(1)
        expect(obligations[0]?.runId).toBe(receipt.runId)
        expect(obligations[0]?.decision).toMatchObject({
          _tag: "Unknown",
          operationId: operation.operationId,
        })
      }),
    ),
  )
}

/** Register the recovery-operator expectations selected by this driver. */
export const registerOperator = <LayerError, ClaimsLayerError>(input: {
  readonly options: Options<LayerError, ClaimsLayerError>
  readonly open: Open<LayerError>
}): void => {
  const { open, options } = input
  registerExplain(options, open)
  const retry = options.capabilities["operator-retry"]
  if (retry !== undefined) registerRetry(options, open, retry)
  const resolveUnknown = options.capabilities["operator-resolve-unknown"]
  if (resolveUnknown !== undefined) registerResolveUnknown(options, open, resolveUnknown)
  const scan = options.capabilities["operator-scan"]
  if (scan !== undefined) registerScan(options, open, scan)
}
