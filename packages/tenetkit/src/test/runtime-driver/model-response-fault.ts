import { describe, expect, it } from "@effect/vitest"
import { Context, Effect, Layer, Option, Schema } from "effect"
import { Prompt, Response } from "effect/unstable/ai"
import { Pins } from "../../core/index.js"
import type { Address } from "../../runtime/address.js"
import { RunStore, type ExecutionClaim } from "../../runtime/run/store.js"
import { Runtime } from "../../runtime/service.js"
import { RunClaims, type Service as RunClaimsService } from "../../runtime/sql/run/claims.js"

/** A failure point after each durable statement in the completed-model-response projection. */
export const modelResponseFaultBoundaries = [
  "after-claim-validation",
  "after-session-entry",
  "after-session-leaf",
  "after-operation",
  "after-checkpoint",
  "after-event",
  "after-tree-position",
  "after-tree-index",
  "before-commit",
] as const

export type ModelResponseFaultBoundary = (typeof modelResponseFaultBoundaries)[number]

export interface ModelResponseFaultOptions<LayerError = never> {
  readonly name: string
  readonly address: Address
  readonly layer: Layer.Layer<Runtime | RunStore, LayerError, never>
  readonly claim: (input: {
    readonly store: RunStore["Service"]
    readonly claims?: RunClaimsService
    readonly runId: string
    readonly workerId: string
  }) => Effect.Effect<ExecutionClaim>
  readonly install: (input: {
    readonly boundary: ModelResponseFaultBoundary
    readonly runId: string
    readonly sessionId: string
  }) => Effect.Effect<void>
  readonly remove: (boundary: ModelResponseFaultBoundary) => Effect.Effect<void>
  readonly skip?: boolean
}

const jsonValue = Schema.decodeUnknownSync(Schema.Json)

const completion = (operationKey: string, sessionParentId: string | null) => {
  const response = { content: [Response.makePart("text", { text: "semantic answer" })], finishReason: "stop" as const }
  const unsigned = {
    operationId: operationKey,
    turn: 0,
    modelCallId: "model-call:fault-conformance",
    modelAttemptId: "model-attempt:fault-conformance",
    attempt: 0,
    sessionParentId,
    replayFromHistory: false,
    content: Schema.encodeSync(Schema.Array(Response.TextPart))(response.content),
    finishReason: "stop" as const,
    budgetCharge: 0,
  }
  const digest = Pins.digest(jsonValue(unsigned))
  return {
    outcome: { _tag: "Succeeded" as const, value: { ...unsigned, digest } },
    event: {
      _tag: "ModelResponseCommitted" as const,
      turn: 0,
      operationKey,
      modelCallId: "model-call:fault-conformance",
      modelAttemptId: "model-attempt:fault-conformance",
      attempt: 0,
      response,
      budgetCharge: 0,
      digest,
    },
  }
}

const slug = (value: string): string => value.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()

/** Register one reusable atomic-projection fault matrix for a physical SQL driver. */
export const modelResponseFaultConformance = <LayerError>(options: ModelResponseFaultOptions<LayerError>): void => {
  const suite = options.skip === true ? describe.skip : describe
  suite(`${options.name} completed model response fault conformance`, () => {
    for (const boundary of modelResponseFaultBoundaries) {
      it.effect(`rolls back ${boundary}`, () =>
        Effect.scoped(
          Effect.flatMap(Layer.build(options.layer), (context) =>
            Effect.gen(function* () {
              const runtime = Context.get(context, Runtime)
              const store = Context.get(context, RunStore)
              const optionalClaims = Context.getOption(context, RunClaims)
              const identity = `fault:${slug(options.name)}:${boundary}`
              const sessionId = `session:${identity}`
              const receipt = yield* runtime.send({
                to: options.address,
                sessionId,
                idempotencyKey: identity,
                prompt: "fault conformance",
              })
              const claim = yield* options.claim({
                store,
                ...(Option.isSome(optionalClaims) ? { claims: optionalClaims.value } : undefined),
                runId: receipt.runId,
                workerId: identity,
              })
              const operationKey = `${receipt.runId}:model:0`
              const operation = yield* store.recordOperation({
                ...claim,
                operationKey,
                kind: "model",
                inputDigest: Pins.digest({ turn: 0 }),
                input: { turn: 0 },
                replayPolicy: "never",
                attempt: 0,
              })
              yield* store.startOperation({ ...claim, operationId: operation.operationId })
              const claimedSession = yield* store.claimedSessionStore(claim)
              if (Option.isNone(claimedSession)) return yield* Effect.die("fault conformance Session is missing")
              const prefix = yield* claimedSession.value.append({
                _tag: "Message",
                message: Prompt.make("durable model input").content[0]!,
              })
              const exact = completion(operationKey, prefix.id)
              const checkpoint = { _tag: "Program" as const, version: "1" as const }
              const beforeHistory = yield* runtime.history({ runId: receipt.runId, limit: 100 })
              const beforeExecution = yield* store.loadExecution(receipt.runId)

              const failed = yield* Effect.acquireUseRelease(
                options.install({ boundary, runId: receipt.runId, sessionId }),
                () =>
                  Effect.exit(
                    store.commitModelResponse({
                      ...claim,
                      operationId: operation.operationId,
                      ...exact,
                      checkpoint,
                    }),
                  ),
                () => options.remove(boundary).pipe(Effect.orDie),
              )
              expect(failed._tag, boundary).toBe("Failure")
              expect(yield* runtime.history({ runId: receipt.runId, limit: 100 }), boundary).toEqual(beforeHistory)
              expect(
                (yield* store.getOperation({ runId: receipt.runId, operationId: operation.operationId })).status,
              ).toBe("running")
              const reader = yield* store.sessionReader(sessionId)
              if (Option.isNone(reader)) return yield* Effect.die("fault conformance Session reader is missing")
              expect(yield* reader.value.path(), boundary).toHaveLength(1)
              expect((yield* store.loadExecution(receipt.runId)).checkpoint, boundary).toEqual(
                beforeExecution.checkpoint,
              )

              yield* store.commitModelResponse({
                ...claim,
                operationId: operation.operationId,
                ...exact,
                checkpoint,
              })
              expect(yield* reader.value.path(), boundary).toHaveLength(2)
              expect((yield* store.loadExecution(receipt.runId)).checkpoint, boundary).toEqual(checkpoint)
              expect(
                (yield* runtime.history({ runId: receipt.runId, limit: 100 })).filter(
                  (event) => event._tag === "ModelResponseCommitted",
                ),
                boundary,
              ).toHaveLength(1)
            }),
          ),
        ),
      )
    }
  })
}
