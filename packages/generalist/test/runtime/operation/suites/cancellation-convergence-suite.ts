import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { Errors, Runtime, RunStore } from "../../../../src/runtime/index.js"
import type { ExecutionClaim, WorkerMutationError } from "../../../../src/runtime/run/store.js"
import { assistantAddress, textPrompt } from "../../execution/fixtures.js"
import { provideScoped } from "../../execution/scoped-provide.js"

export interface CancellationConvergenceSuiteOptions<StoreError, Extra = never> {
  readonly name: string
  readonly storeLayer: Layer.Layer<Runtime.Runtime | RunStore.RunStore | Extra, StoreError>
  readonly claim?: (
    runId: string,
    ownerId: string,
  ) => Effect.Effect<ExecutionClaim, WorkerMutationError, RunStore.RunStore | Extra>
  readonly skip?: boolean
}

export const cancellationConvergenceSuite = <StoreError, Extra = never>(
  options: CancellationConvergenceSuiteOptions<StoreError, Extra>,
) => {
  const describeBackend = options.skip === true ? describe.skip : describe
  const claimExecution = (runId: string, ownerId: string) =>
    options.claim === undefined
      ? Effect.flatMap(RunStore.RunStore, (store) => store.claimExecution({ runId, ownerId }))
      : options.claim(runId, ownerId)
  const provide = <A, E>(effect: Effect.Effect<A, E, Runtime.Runtime | RunStore.RunStore | Extra>) =>
    provideScoped(options.storeLayer, effect)

  describeBackend(`${options.name} unknown operation cancellation`, () => {
    const runningOperation = (label: string) =>
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        const receipt = yield* runtime.send({
          to: assistantAddress,
          sessionId: `session:unknown-cancel:${options.name}:${label}`,
          idempotencyKey: label,
          prompt: textPrompt(label),
        })
        const executionClaim = yield* claimExecution(receipt.runId, `owner:${label}`)
        const operation = yield* store.recordOperation({
          ...executionClaim,
          operationKey: `never:${label}`,
          kind: "send",
          inputDigest: label,
          input: { label },
          replayPolicy: "never",
          attempt: 1,
        })
        yield* store.startOperation({ ...executionClaim, operationId: operation.operationId })
        return { runtime, store, receipt, claim: executionClaim, operation }
      })

    it.effect("keeps unknown unresolved when cancellation wins before expiration", () =>
      provide(
        Effect.gen(function* () {
          const { runtime, store, receipt, claim, operation } = yield* runningOperation("cancel-first")
          yield* runtime.cancel({ runId: receipt.runId, reason: "cancel first" })
          const expired = yield* store.expireRunningOperation({ ...claim, operationId: operation.operationId })
          expect(expired.outcome).toBe("unknown")
          expect((yield* runtime.inspect(receipt.runId)).status).toBe("needs-resolution")
          yield* store.fail({ ...claim, error: Errors.AgentExecutionFailure.make({ message: "interrupted" }) })
          expect((yield* runtime.inspect(receipt.runId)).status).toBe("needs-resolution")
          expect((yield* store.getOperation({ runId: receipt.runId, operationId: operation.operationId })).status).toBe(
            "unknown",
          )
          expect(
            (yield* runtime.history({ runId: receipt.runId, limit: 100 })).map((event) => event._tag),
          ).not.toContain("RunCancelled")
        }),
      ),
    )

    it.effect("keeps a finalizer Unknown truthful when cancellation is already requested", () =>
      provide(
        Effect.gen(function* () {
          const { runtime, store, receipt, claim, operation } = yield* runningOperation("complete-cancel-first")
          yield* runtime.cancel({ runId: receipt.runId, reason: "cancel first" })
          const completed = yield* store.completeOperation({
            ...claim,
            operationId: operation.operationId,
            outcome: { _tag: "Unknown" },
          })
          expect(completed.status).toBe("unknown")
          expect((yield* runtime.inspect(receipt.runId)).status).toBe("needs-resolution")
          yield* store.fail({ ...claim, error: Errors.AgentExecutionFailure.make({ message: "interrupted" }) })
          expect((yield* runtime.inspect(receipt.runId)).status).toBe("needs-resolution")
        }),
      ),
    )

    it.effect("does not let cancellation settle an Unknown committed by a finalizer first", () =>
      provide(
        Effect.gen(function* () {
          const { runtime, store, receipt, claim, operation } = yield* runningOperation("complete-unknown-first")
          const completed = yield* store.completeOperation({
            ...claim,
            operationId: operation.operationId,
            outcome: { _tag: "Unknown" },
          })
          expect(completed.status).toBe("unknown")
          expect((yield* runtime.inspect(receipt.runId)).status).toBe("needs-resolution")
          yield* runtime.cancel({ runId: receipt.runId, reason: "cancel unknown" })
          expect((yield* runtime.inspect(receipt.runId)).status).toBe("needs-resolution")
        }),
      ),
    )

    it.effect("terminally settles cancellation only after the unknown operation is resolved", () =>
      provide(
        Effect.gen(function* () {
          const { runtime, store, receipt, claim, operation } = yield* runningOperation("unknown-first")
          const expired = yield* store.expireRunningOperation({ ...claim, operationId: operation.operationId })
          expect(expired.outcome).toBe("unknown")
          expect((yield* runtime.inspect(receipt.runId)).status).toBe("needs-resolution")
          yield* runtime.cancel({ runId: receipt.runId, reason: "cancel unknown" })
          expect((yield* runtime.inspect(receipt.runId)).status).toBe("needs-resolution")
          yield* runtime.resolveOperation({
            runId: receipt.runId,
            operationId: operation.operationId,
            idempotencyKey: "resolve unknown cancellation",
            resolution: { _tag: "Succeeded", value: { reconciled: true } },
          })
          expect((yield* runtime.inspect(receipt.runId)).status).toBe("cancelled")
          expect((yield* store.getOperation({ runId: receipt.runId, operationId: operation.operationId })).status).toBe(
            "succeeded",
          )
        }),
      ),
    )
  })
}
