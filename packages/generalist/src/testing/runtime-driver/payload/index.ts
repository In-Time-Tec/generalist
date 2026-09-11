import { expect, it } from "@effect/vitest"
import { Effect, Option } from "effect"
import { Prompt } from "effect/unstable/ai"
import { maximumBytes, maximumEventBytes } from "../../../runtime/execution/payload/index.js"
import type { RuntimeCapability, Services } from "../contract.js"
import type { Address } from "../../../runtime/address.js"

/** @internal */
export const registerPayload = <LayerError>(input: {
  readonly capability: RuntimeCapability
  readonly request: { readonly to: Address; readonly sessionId: string; readonly idempotencyKey: string }
  readonly provide: <A, E>(use: (services: Services) => Effect.Effect<A, E>) => Effect.Effect<A, E | LayerError>
}): void => {
  const { capability, provide } = input
  it.effect("rejects oversized durable values atomically without truncating exact outcomes", () =>
    provide((services) =>
      Effect.gen(function* () {
        const large = "x".repeat(maximumBytes + 1)
        const request = { ...input.request, prompt: large }
        expect((yield* Effect.flip(services.runtime.send(request)))._tag).toBe("generalist/runtime/PayloadTooLarge")
        const receipt = yield* services.runtime.send({ ...request, prompt: "bounded admission" })
        expect(receipt.duplicate).toBe(false)
        const claim = yield* capability.claim(services, { runId: receipt.runId, commandId: "payload-bounds" })
        const operation = {
          ...claim,
          operationKey: "bounded-operation",
          kind: "tool" as const,
          inputDigest: "bounded-input",
          input: { value: large },
          replayPolicy: "never" as const,
          attempt: 0,
        }
        expect((yield* Effect.flip(services.store.recordOperation(operation)))._tag).toBe(
          "generalist/runtime/PayloadTooLarge",
        )
        expect(
          yield* services.store.getOperationByKey({ runId: receipt.runId, operationKey: operation.operationKey }),
        ).toBeUndefined()
        const recorded = yield* services.store.recordOperation({ ...operation, input: { value: "exact" } })
        yield* services.store.startOperation({
          ...claim,
          commandId: `${claim.runId}:start:${recorded.operationId}:0`,
          operationId: recorded.operationId,
        })
        for (const outcome of [
          { _tag: "Succeeded" as const, value: large },
          { _tag: "Failed" as const, error: { _tag: "ToolFailure", detail: large } },
        ]) {
          expect(
            (yield* Effect.flip(
              services.store.completeOperation({ ...claim, operationId: recorded.operationId, outcome }),
            ))._tag,
          ).toBe("generalist/runtime/PayloadTooLarge")
          expect(
            (yield* services.store.getOperationByKey({ runId: receipt.runId, operationKey: operation.operationKey }))
              ?.status,
          ).toBe("running")
        }
        const before = yield* services.runtime.snapshot(receipt.runId)
        expect(
          (yield* Effect.flip(
            services.store.emitAgentEvent({
              ...claim,
              commandId: `${receipt.runId}:oversized-progress`,
              event: {
                _tag: "ToolProgress",
                turn: 0,
                toolCallId: "bounded-call",
                message: "x".repeat(maximumEventBytes + 1),
              },
            }),
          ))._tag,
        ).toBe("generalist/runtime/PayloadTooLarge")
        expect((yield* services.runtime.snapshot(receipt.runId)).cursor).toBe(before.cursor)
        const session = Option.getOrThrow(yield* services.store.claimedSessionStore(claim))
        const leaf = yield* session.leaf
        expect(
          (yield* Effect.flip(
            session.append(
              { _tag: "Message", message: Prompt.make(large).content[0]! },
              { commandId: "oversized-message" },
            ),
          ))._tag,
        ).toBe("generalist/core/SessionStoreError")
        expect(
          (yield* Effect.flip(
            session.append(
              {
                _tag: "Handoff",
                handoffId: "bounded-handoff",
                target: "agent:next",
                projectedHistory: Prompt.make(large),
              },
              { commandId: "oversized-handoff" },
            ),
          ))._tag,
        ).toBe("generalist/core/SessionStoreError")
        expect(
          (yield* Effect.flip(
            session.appendCheckpoint({
              id: "bounded-checkpoint",
              parentId: leaf,
              projectedHistory: Prompt.empty,
              telemetry: [],
              summary: large,
            }),
          ))._tag,
        ).toBe("generalist/core/SessionStoreError")
        expect(yield* session.leaf).toBe(leaf)
        const exact = { _tag: "ToolFailure", detail: "preserve this exact typed failure", code: 42 }
        yield* services.store.completeOperation({
          ...claim,
          operationId: recorded.operationId,
          outcome: { _tag: "Failed", error: exact },
        })
        expect(
          (yield* services.store.getOperationByKey({ runId: receipt.runId, operationKey: operation.operationKey }))
            ?.error,
        ).toEqual(exact)
      }),
    ),
  )
}
