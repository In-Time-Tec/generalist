import { describe, expect, it } from "@effect/vitest"
import { Context, Effect, Layer, Option, Schema } from "effect"
import { Prompt, Response } from "effect/unstable/ai"
import { digest as pinDigest } from "../../../core/durable/pin.js"
import type { Address } from "../../../runtime/address.js"
import { RunStore } from "../../../runtime/run/store.js"
import { Runtime } from "../../../runtime/engine.js"
import type { ClaimExecution, Services } from "../contract.js"

/** The atomic projection has one publication boundary, not independently durable statement stages. */
export const modelResponseFaultBoundaries = [
  "before-publication",
  "after-publication-lost-ack",
  "before-publication-unreadable",
  "after-publication-unreadable",
] as const

export type ModelResponseFaultBoundary = (typeof modelResponseFaultBoundaries)[number]

export interface ModelResponseFaultOptions<LayerError = never> {
  readonly name: string
  readonly address: Address
  readonly layer: Layer.Layer<Runtime | RunStore, LayerError, never>
  /** A genuinely fresh, read-only host over the same objects. */
  readonly readLayer: Layer.Layer<Runtime | RunStore, LayerError, never>
  readonly claim: ClaimExecution
  readonly install: (services: Services, boundary: ModelResponseFaultBoundary) => Effect.Effect<void>
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
  const digest = pinDigest(jsonValue(unsigned))
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

const open = <A, E, LE>(layer: Layer.Layer<Runtime | RunStore, LE>, use: (services: Services) => Effect.Effect<A, E>) =>
  Effect.scoped(
    Effect.flatMap(Layer.build(layer), (context) =>
      use({
        runtime: Context.get(context, Runtime),
        store: Context.get(context, RunStore),
      }),
    ),
  )

/** Retains Session, outcome, checkpoint, run-event and tree-index atomicity through real transport faults. */
export const modelResponseFaultConformance = <LayerError>(options: ModelResponseFaultOptions<LayerError>): void => {
  const suite = options.skip === true ? describe.skip : describe
  suite(`${options.name} completed model response fault conformance`, () => {
    for (const boundary of modelResponseFaultBoundaries) {
      it.effect(`recovers one atomic model projection at ${boundary}`, () =>
        Effect.gen(function* () {
          const seeded = yield* open(options.layer, (services) =>
            Effect.gen(function* () {
              const { runtime, store } = services
              const identity = `fault:${options.name}:${boundary}`
              const sessionId = `session:${identity}`
              const receipt = yield* runtime.send({
                to: options.address,
                sessionId,
                idempotencyKey: identity,
                prompt: "fault conformance",
              })
              const claim = yield* options.claim(services, { runId: receipt.runId, commandId: identity })
              const operationKey = `${receipt.runId}:model:0`
              const operation = yield* store.recordOperation({
                ...claim,
                operationKey,
                kind: "model",
                inputDigest: pinDigest({ turn: 0 }),
                input: { turn: 0 },
                replayPolicy: "never",
                attempt: 0,
              })
              yield* store.startOperation({
                ...claim,
                commandId: `${identity}:start:0`,
                operationId: operation.operationId,
              })
              const session = Option.getOrThrow(yield* store.claimedSessionStore(claim))
              const prefix = yield* session.append(
                { _tag: "Message", message: Prompt.make("durable model input").content[0]! },
                { commandId: "model-input" },
              )
              const exact = completion(operationKey, prefix.id)
              const checkpoint = { _tag: "Program" as const, version: "1" as const }
              const continuation = {
                schemaVersion: 1 as const,
                prompt: Prompt.make("continue after durable response"),
                nextTurn: 1,
                steeringEntryIds: [],
                queue: "steering" as const,
              }
              const commit = { ...claim, operationId: operation.operationId, ...exact, checkpoint, continuation }
              const observe = (host: Services) =>
                Effect.gen(function* () {
                  const reader = Option.getOrThrow(yield* host.store.sessionReader(sessionId))
                  const execution = yield* host.store.loadExecution(receipt.runId)
                  const history = yield* host.runtime.history({ runId: receipt.runId, limit: 100 })
                  const responseEvent = history.find(
                    (event): event is Extract<(typeof history)[number], { readonly _tag: "ModelResponseCommitted" }> =>
                      event._tag === "ModelResponseCommitted",
                  )
                  const response =
                    responseEvent === undefined ? undefined : yield* host.runtime.resolveModelResponse(responseEvent)
                  const entry =
                    responseEvent === undefined
                      ? undefined
                      : yield* host.runtime.sessionEntry({
                          sessionId: responseEvent.sessionId,
                          entryId: responseEvent.sessionEntryId,
                        })
                  return {
                    history,
                    operation: yield* host.store.getOperation({
                      runId: receipt.runId,
                      operationId: operation.operationId,
                    }),
                    path: yield* reader.path(),
                    leaf: yield* reader.leaf,
                    checkpoint: execution.checkpoint,
                    continuation: execution.continuation,
                    response,
                    entry,
                    tree: yield* host.store.treeReplay({ rootRunId: receipt.runId, position: -1, limit: 100 }),
                  }
                })
              const before = yield* observe(services)
              yield* options.install(services, boundary)
              const result = yield* Effect.result(store.commitModelResponse(commit))
              if (boundary === "after-publication-lost-ack") {
                expect(result._tag).toBe("Success")
              } else {
                expect(result._tag).toBe("Failure")
                if (result._tag === "Failure") expect(result.failure).toMatchObject({ reason: "indeterminate" })
              }
              // Reconstruct before retry: neither the live materialization nor its notification cache is evidence.
              const recovered = yield* open(options.readLayer, observe)
              if (boundary.startsWith("before-")) {
                expect(recovered).toEqual(before)
              } else {
                expect(recovered.operation.status).toBe("succeeded")
                expect(recovered.response).toEqual(exact.event.response)
                expect(recovered.entry).toEqual(recovered.path[1])
                expect(recovered.entry).toMatchObject({
                  _tag: "ModelResponse",
                  parentId: prefix.id,
                  content: exact.event.response.content,
                })
                expect(recovered.history.find((event) => event._tag === "ModelResponseCommitted")).toMatchObject({
                  _tag: "ModelResponseCommitted",
                  sessionId,
                  sessionParentId: prefix.id,
                  sessionEntryId: recovered.entry?.id,
                })
                expect(recovered.path).toHaveLength(2)
                expect(recovered.path[1]).toMatchObject({ parentId: prefix.id, _tag: "ModelResponse" })
                expect(recovered.leaf).toBe(recovered.path[1]!.id)
                expect(recovered.checkpoint).toEqual(checkpoint)
                expect(recovered.continuation).toEqual(continuation)
                expect(recovered.history.filter((event) => event._tag === "ModelResponseCommitted")).toHaveLength(1)
                expect(
                  recovered.tree.events.filter(({ event }) => event._tag === "ModelResponseCommitted"),
                ).toHaveLength(1)
              }
              const committed = yield* store.commitModelResponse(commit)
              expect(yield* store.commitModelResponse(commit)).toEqual(committed)
              const after = yield* observe(services)
              expect(after.operation.status).toBe("succeeded")
              expect(after.response).toEqual(exact.event.response)
              expect(after.entry).toEqual(after.path[1])
              expect(after.entry).toMatchObject({
                _tag: "ModelResponse",
                parentId: prefix.id,
                content: exact.event.response.content,
              })
              expect(after.history.find((event) => event._tag === "ModelResponseCommitted")).toMatchObject({
                _tag: "ModelResponseCommitted",
                sessionId,
                sessionParentId: prefix.id,
                sessionEntryId: after.entry?.id,
              })
              expect(after.path).toHaveLength(2)
              expect(after.path[1]).toMatchObject({ parentId: prefix.id, _tag: "ModelResponse" })
              expect(after.leaf).toBe(after.path[1]!.id)
              expect(after.checkpoint).toEqual(checkpoint)
              expect(after.continuation).toEqual(continuation)
              expect(after.history.filter((event) => event._tag === "ModelResponseCommitted")).toHaveLength(1)
              expect(after.tree.events.filter(({ event }) => event._tag === "ModelResponseCommitted")).toHaveLength(1)
              return { observe, after, commit, committed }
            }),
          )
          yield* open(options.readLayer, (services) =>
            Effect.gen(function* () {
              expect(yield* seeded.observe(services)).toEqual(seeded.after)
              // The exact durable receipt survives host retirement, including its old execution fence.
              expect(yield* services.store.commitModelResponse(seeded.commit)).toEqual(seeded.committed)
              expect(yield* seeded.observe(services)).toEqual(seeded.after)
            }),
          )
        }),
      )
    }
  })
}
