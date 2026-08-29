import { expect, layer } from "@effect/vitest"
import { Effect } from "effect"
import { Errors, Runtime, RunStore } from "../../../../src/runtime/index.js"
import { assistantAddress, parentRelativeOptions, textPrompt } from "../../execution/fixtures.js"
import { tempDbPath } from "../../sql/scenario.js"

import { Runtime as SqliteRuntime } from "../../../../src/runtime/sqlite-bun.js"
const layers = [
  ["memory", Runtime.layerMemory({ ...parentRelativeOptions, scheduler: { pollInterval: "1 day" } })],
  [
    "sqlite",
    SqliteRuntime.layerSqlite({
      ...parentRelativeOptions,
      filename: tempDbPath("operation-cancellation-convergence"),
      scheduler: { pollInterval: "1 day" },
    }),
  ],
] as const

for (const [backend, runtimeLayer] of layers) {
  layer(runtimeLayer)(`${backend} unknown operation cancellation`, (it) => {
    const runningOperation = (label: string) =>
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        const receipt = yield* runtime.send({
          to: assistantAddress,
          sessionId: `session:unknown-cancel:${backend}:${label}`,
          idempotencyKey: label,
          prompt: textPrompt(label),
        })
        const claim = yield* store.claimExecution({ runId: receipt.runId, ownerId: `owner:${label}` })
        const operation = yield* store.recordOperation({
          ...claim,
          operationKey: `never:${label}`,
          kind: "send",
          inputDigest: label,
          input: { label },
          replayPolicy: "never",
          attempt: 1,
        })
        yield* store.startOperation({ ...claim, operationId: operation.operationId })
        return { runtime, store, receipt, claim, operation }
      })

    it.effect("keeps unknown unresolved when cancellation wins before expiration", () =>
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
        expect((yield* runtime.history({ runId: receipt.runId, limit: 100 })).map((event) => event._tag)).not.toContain(
          "RunCancelled",
        )
      }),
    )

    it.effect("keeps a finalizer Unknown truthful when cancellation is already requested", () =>
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
    )

    it.effect("does not let cancellation settle an Unknown committed by a finalizer first", () =>
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
    )

    it.effect("terminally settles cancellation only after the unknown operation is resolved", () =>
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
    )
  })
}
