import { BunCrypto } from "@effect/platform-bun"
/* oxlint-disable effecttsgo/strict-effect-provide -- Each trace owns its scoped BunCrypto test-host Layer. */
import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Option, Schema } from "effect"
import { Prompt, Response } from "effect/unstable/ai"
import { digest } from "../../../src/core/durable/canonical-json.js"
import { ObjectStore, type Service as ObjectStoreService } from "../../../src/durability/object-store.js"
import { activate, layerRunStore } from "../../../src/durability/index.js"
import { Cursor } from "../../../src/runtime/cursor.js"
import type { RunReceipt } from "../../../src/runtime/run.js"
import { RunStore, type ExecutionClaim } from "../../../src/runtime/run/store.js"
import { make as makeSimulator, type Client } from "../../../src/testing/durability/index.js"
import { assistantAddress, assistantRef, registrationsFor } from "../../runtime/execution/fixtures.js"

type Action = "admit" | "claim" | "operate" | "cancel" | "fork" | "rewind" | "restart" | "compact" | "project"
type Model = {
  readonly admitted: boolean
  readonly claimed: boolean
  readonly operated: boolean
  readonly cancelled: boolean
  readonly forked: boolean
  readonly rewound: boolean
  readonly restarted: boolean
  readonly compacted: boolean
  readonly projected: boolean
  readonly runCount: number
  readonly dispatches: number
  readonly incurredToolCalls: number
  readonly remainingToolCalls: number
  readonly activeEntries: ReadonlyArray<"response" | "compaction">
  readonly sourceStatus?: "running" | "queued"
  readonly forkStatus?: "queued" | "cancelled"
  readonly archiveStatus?: "cancelled"
  readonly retainedReceipt?: string
}

const seeds = [1, 7, 19, 42, 99, 257, 1024, 0x5eed] as const
const bounds = {
  traces: seeds.length,
  actionsPerTrace: 9,
  runsPerTrace: 3,
  oracleStates: 17,
  oracleStateLimit: 128,
} as const
const initial = (): Model => ({
  admitted: false,
  claimed: false,
  operated: false,
  cancelled: false,
  forked: false,
  rewound: false,
  restarted: false,
  compacted: false,
  projected: false,
  runCount: 0,
  dispatches: 0,
  incurredToolCalls: 0,
  remainingToolCalls: 3,
  activeEntries: [],
})
// oxlint-disable-next-line complexity -- The independent finite business model keeps every enabled action visible.
const enabled = (model: Model): ReadonlyArray<Action> => {
  if (!model.admitted) return ["admit"]
  const actions: Array<Action> = []
  if (!model.restarted && !model.claimed) actions.push("restart")
  if (!model.claimed && !model.compacted) actions.push("claim")
  if (model.claimed && !model.operated) actions.push("operate")
  if (model.claimed && model.operated && !model.compacted) actions.push("compact")
  if (model.compacted && !model.forked) actions.push("fork")
  if (model.forked && !model.cancelled) actions.push("cancel")
  if (model.forked && !model.rewound) actions.push("rewind")
  if (model.restarted && model.cancelled && model.rewound) actions.push("project")
  return actions
}
const step = (model: Model, action: Action, seed: number): Model => {
  switch (action) {
    case "admit":
      return { ...model, admitted: true, runCount: 1, sourceStatus: "running" }
    case "claim":
      return { ...model, claimed: true }
    case "operate":
      return {
        ...model,
        operated: true,
        dispatches: model.dispatches + 1,
        incurredToolCalls: model.incurredToolCalls + 1,
        remainingToolCalls: model.remainingToolCalls - 1,
        activeEntries: ["response"],
        retainedReceipt: `paid:${seed}`,
      }
    case "compact":
      return { ...model, claimed: false, compacted: true, activeEntries: ["response", "compaction"] }
    case "fork":
      return {
        ...model,
        forked: true,
        runCount: model.runCount + 1,
        remainingToolCalls: model.remainingToolCalls - 1,
        forkStatus: "queued",
      }
    case "cancel":
      return { ...model, cancelled: true, forkStatus: "cancelled" }
    case "rewind":
      return {
        ...model,
        rewound: true,
        runCount: model.runCount + 1,
        activeEntries: ["response"],
        sourceStatus: "queued",
        archiveStatus: "cancelled",
      }
    case "restart":
      return { ...model, restarted: true }
    case "project":
      return { ...model, projected: true }
  }
}
const random = (seed: number) => {
  let state = seed >>> 0
  return (limit: number) => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return (state >>> 0) % limit
  }
}
const traceFor = (seed: number) => {
  const next = random(seed)
  const trace: Array<Action> = []
  let model = initial()
  while (!model.projected) {
    const actions = enabled(model)
    const action = actions[next(actions.length)]!
    trace.push(action)
    model = step(model, action, seed)
  }
  return trace
}
const controlKey = (model: Model) =>
  JSON.stringify([
    model.admitted,
    model.claimed,
    model.operated,
    model.cancelled,
    model.forked,
    model.rewound,
    model.restarted,
    model.compacted,
    model.projected,
  ])

const executable = assistantRef
const address = assistantAddress
const options = {
  environment: "test",
  tenant: "domain-model",
  partition: "shared",
  addresses: [{ address, executable, registrations: registrationsFor(executable) }],
}
const admission = (seed: number) => ({
  runId: `domain:${seed}:source`,
  message: {
    id: `message:${seed}`,
    to: address,
    sessionId: `session:${seed}`,
    prompt: Prompt.make(`request:${seed}`),
    idempotencyKey: `admit:${seed}`,
    correlationId: `trace:${seed}`,
    metadata: {},
  },
  executableRef: executable.ref,
  executableManifest: executable.manifest,
  registrations: registrationsFor(executable),
  budget: { toolCalls: 3, children: 3 },
})
const openActive = (client: Client, workerId: string) =>
  Effect.gen(function* () {
    const context = yield* Layer.build(
      layerRunStore({ ...options, workerId }).pipe(Layer.provide(Layer.succeed(ObjectStore, client.store))),
    )
    yield* activate.pipe(Effect.provide(context))
    return yield* RunStore.pipe(Effect.provide(context))
  })
const openReadLayer = (store: ObjectStoreService) =>
  Effect.gen(function* () {
    const context = yield* Layer.build(
      layerRunStore({ ...options, workerId: "domain-model:read-only" }).pipe(
        Layer.provide(Layer.succeed(ObjectStore, store)),
      ),
    )
    return yield* RunStore.pipe(Effect.provide(context))
  })
const toolCall = (seed: number) =>
  Schema.decodeSync(Response.ToolCallPart("payment", Schema.Unknown))({
    type: "tool-call",
    id: `payment:${seed}`,
    name: "payment",
    params: { amount: seed },
    providerExecuted: false,
  })

describe("independent object Runtime domain model", () => {
  it("bounds deterministic traces and covers every domain action", () => {
    const states = new Set<string>()
    const coverage: Partial<Record<Action, number>> = {}
    for (const seed of seeds) {
      let model = initial()
      states.add(controlKey(model))
      const trace = traceFor(seed)
      expect(trace).toHaveLength(bounds.actionsPerTrace)
      for (const action of trace) {
        expect(enabled(model)).toContain(action)
        coverage[action] = (coverage[action] ?? 0) + 1
        model = step(model, action, seed)
        states.add(controlKey(model))
      }
      expect(model).toMatchObject({ projected: true, runCount: bounds.runsPerTrace, dispatches: 1 })
    }
    expect(states.size).toBeLessThanOrEqual(bounds.oracleStateLimit)
    expect(states.size).toBe(bounds.oracleStates)
    expect(coverage).toEqual({
      admit: bounds.traces,
      claim: bounds.traces,
      operate: bounds.traces,
      compact: bounds.traces,
      fork: bounds.traces,
      cancel: bounds.traces,
      restart: bounds.traces,
      rewind: bounds.traces,
      project: bounds.traces,
    })
  })

  for (const seed of seeds) {
    it.effect(`matches the independent business oracle across the seeded action trace ${seed}`, () =>
      // oxlint-disable-next-line complexity -- One switch ties every modeled action directly to its public Runtime command.
      Effect.gen(function* () {
        const bucket = yield* makeSimulator()
        let store = yield* openActive(bucket, `domain:${seed}:host:0`)
        let model = initial()
        let host = 0
        let workerId = `domain:${seed}:host:0`
        let claim: ExecutionClaim | undefined
        let admissionReceipt: RunReceipt | undefined
        let forkReceipt: RunReceipt | undefined
        let modelOperationId: string | undefined
        let paymentOperationId: string | undefined
        let responseSequence: number | undefined
        let observedDispatches = 0
        let sourceHistoryBeforeRewind: ReadonlyArray<unknown> | undefined
        const sourceRunId = `domain:${seed}:source`
        const forkRunId = `domain:${seed}:fork`
        const archiveRunId = `domain:${seed}:archive`
        const checkpointId = `domain:${seed}:checkpoint`
        const responseText = `response:${seed}`
        const summary = `summary:${seed}`

        for (const action of traceFor(seed)) {
          expect(enabled(model)).toContain(action)
          switch (action) {
            case "admit": {
              const input = admission(seed)
              admissionReceipt = yield* store.admitSend(input)
              expect(yield* store.admitSend(input)).toEqual(admissionReceipt)
              break
            }
            case "claim": {
              const input = { runId: sourceRunId, ownerId: workerId, commandId: `claim:${seed}` }
              claim = yield* store.claimExecution(input)
              expect(yield* store.claimExecution(input)).toEqual(claim)
              break
            }
            case "operate": {
              if (claim === undefined) return yield* Effect.die("oracle enabled operate without a claim")
              const operationKey = `domain:${seed}:model`
              const operationInput = {
                ...claim,
                operationKey,
                kind: "model" as const,
                inputDigest: `model-input:${seed}`,
                input: { request: seed },
                replayPolicy: "never" as const,
                attempt: 0,
              }
              const operation = yield* store.recordOperation(operationInput)
              modelOperationId = operation.operationId
              expect(yield* store.recordOperation(operationInput)).toEqual(operation)
              const started = yield* store.startOperation({
                ...claim,
                operationId: operation.operationId,
                commandId: `start-model:${seed}`,
              })
              expect(started.status).toBe("running")
              const content = [Response.makePart("text", { text: responseText })]
              const unsigned = {
                operationId: operationKey,
                turn: 0,
                modelCallId: `call:${seed}`,
                modelAttemptId: `attempt:${seed}`,
                attempt: 0,
                sessionParentId: null,
                replayFromHistory: false,
                content: yield* Schema.encodeEffect(Schema.Array(Response.TextPart))(content),
                finishReason: "stop" as const,
                budgetCharge: 0,
              }
              const response = { content, finishReason: "stop" as const }
              const commit = {
                ...claim,
                operationId: operation.operationId,
                outcome: { _tag: "Succeeded" as const, value: { ...unsigned, digest: digest(unsigned) } },
                event: {
                  _tag: "ModelResponseCommitted" as const,
                  turn: 0,
                  operationKey,
                  modelCallId: `call:${seed}`,
                  modelAttemptId: `attempt:${seed}`,
                  attempt: 0,
                  response,
                  budgetCharge: 0,
                  digest: digest(unsigned),
                },
              }
              const committed = yield* store.commitModelResponse(commit)
              expect(yield* store.commitModelResponse(commit)).toEqual(committed)
              responseSequence = committed.completedSequence

              const call = toolCall(seed)
              const cost = {
                ...claim,
                commandId: `cost:${seed}`,
                event: { _tag: "ToolExecutionStarted" as const, turn: 0, call },
              }
              yield* store.emitAgentEvent(cost)
              yield* store.emitAgentEvent(cost)
              const paymentInput = {
                ...claim,
                operationKey: `domain:${seed}:payment`,
                kind: "tool" as const,
                inputDigest: `payment-input:${seed}`,
                input: { amount: seed },
                replayPolicy: "never" as const,
                attempt: 0,
              }
              const payment = yield* store.recordOperation(paymentInput)
              paymentOperationId = payment.operationId
              expect(yield* store.recordOperation(paymentInput)).toEqual(payment)
              const dispatched = yield* store.startOperation({
                ...claim,
                operationId: payment.operationId,
                commandId: `dispatch:${seed}`,
              })
              observedDispatches += 1
              expect(dispatched.status).toBe("running")
              const completed = yield* store.completeOperation({
                ...claim,
                operationId: payment.operationId,
                outcome: { _tag: "Succeeded", value: { receipt: `paid:${seed}` } },
              })
              expect(
                yield* store.completeOperation({
                  ...claim,
                  operationId: payment.operationId,
                  outcome: { _tag: "Succeeded", value: { receipt: `paid:${seed}` } },
                }),
              ).toEqual(completed)
              break
            }
            case "compact": {
              if (claim === undefined || modelOperationId === undefined) {
                return yield* Effect.die("oracle enabled compaction before the response")
              }
              const writer = Option.getOrThrow(yield* store.claimedSessionStore(claim))
              const parentId = `${sourceRunId}:model-response-committed:domain:${seed}:model`
              const checkpoint = {
                id: checkpointId,
                parentId,
                projectedHistory: Prompt.make(summary),
                telemetry: [],
              }
              const appended = yield* writer.appendCheckpoint(checkpoint)
              expect(appended._tag).toBe("Appended")
              expect(yield* writer.appendCheckpoint(checkpoint)).toEqual(appended)
              yield* store.releaseExecution(claim)
              claim = undefined
              break
            }
            case "fork": {
              if (responseSequence === undefined) return yield* Effect.die("oracle enabled fork before the response")
              const input = {
                runId: sourceRunId,
                atSequence: responseSequence,
                commandId: `fork:${seed}`,
                newRunId: forkRunId,
                budget: { toolCalls: 1, children: 0 },
              }
              forkReceipt = yield* store.fork(input)
              expect(yield* store.fork(input)).toEqual(forkReceipt)
              break
            }
            case "cancel": {
              const input = { runId: forkRunId, commandId: `cancel:${seed}`, reason: `cancelled:${seed}` }
              yield* store.cancel(input)
              yield* store.cancel(input)
              break
            }
            case "rewind": {
              if (responseSequence === undefined) return yield* Effect.die("oracle enabled rewind before the response")
              sourceHistoryBeforeRewind = yield* store.history({
                runId: sourceRunId,
                cursor: Cursor.make(-1),
                limit: 200,
              })
              const input = {
                runId: sourceRunId,
                toSequence: responseSequence,
                commandId: `rewind:${seed}`,
                branchRunId: archiveRunId,
              }
              yield* store.rewind(input)
              yield* store.rewind(input)
              const after = yield* store.history({ runId: sourceRunId, cursor: Cursor.make(-1), limit: 200 })
              expect(after.slice(0, sourceHistoryBeforeRewind.length)).toEqual(sourceHistoryBeforeRewind)
              break
            }
            case "restart": {
              workerId = `domain:${seed}:host:${++host}`
              store = yield* openActive(yield* bucket.connect, workerId)
              break
            }
            case "project": {
              if (
                admissionReceipt === undefined ||
                forkReceipt === undefined ||
                modelOperationId === undefined ||
                paymentOperationId === undefined ||
                sourceHistoryBeforeRewind === undefined
              ) {
                return yield* Effect.die("oracle enabled projection before its durable evidence")
              }
              const expected = step(model, action, seed)
              const fresh = yield* bucket.connect
              let creates = 0
              const observedStore: ObjectStoreService = {
                ...fresh.store,
                create: (key, bytes) => {
                  creates += 1
                  return fresh.store.create(key, bytes)
                },
              }
              const readerStore = yield* openReadLayer(observedStore)
              const source = yield* readerStore.inspect(sourceRunId)
              const sourceSnapshot = yield* readerStore.snapshot(sourceRunId)
              const forked = yield* readerStore.inspect(forkRunId)
              const archived = yield* readerStore.inspect(archiveRunId)
              const history = yield* readerStore.history({ runId: sourceRunId, cursor: Cursor.make(-1), limit: 200 })
              const session = Option.getOrThrow(yield* readerStore.sessionReader(`session:${seed}`))
              const path = yield* session.path()
              const retainedCompaction = yield* session.entry(checkpointId)
              const payment = yield* readerStore.getOperation({ runId: sourceRunId, operationId: paymentOperationId })
              const modelOperation = yield* readerStore.getOperation({
                runId: sourceRunId,
                operationId: modelOperationId,
              })

              expect((yield* readerStore.list({ limit: 10 })).map((run) => run.runId).toSorted()).toEqual(
                [sourceRunId, forkRunId, archiveRunId].toSorted(),
              )
              expect(expected).toMatchObject({
                runCount: bounds.runsPerTrace,
                dispatches: 1,
                incurredToolCalls: 1,
                remainingToolCalls: 1,
                retainedReceipt: `paid:${seed}`,
              })
              expect(observedDispatches).toBe(expected.dispatches)
              expect(source).toMatchObject({ runId: sourceRunId, status: "queued" })
              expect(forked).toMatchObject({ runId: forkRunId, status: "cancelled" })
              expect(archived).toMatchObject({ runId: archiveRunId, status: "cancelled" })
              expect(sourceSnapshot.run).toEqual(source)
              expect(sourceSnapshot.cursor).toBe(source.lastSequence)
              expect(history.at(-1)?.sequence).toBe(sourceSnapshot.cursor)
              expect(sourceSnapshot.budget.toolCalls).toBe(expected.remainingToolCalls)
              expect(history.filter((event) => event._tag === "ToolExecutionStarted")).toHaveLength(
                expected.incurredToolCalls,
              )
              expect(history.slice(0, sourceHistoryBeforeRewind.length)).toEqual(sourceHistoryBeforeRewind)
              expect(path.map((entry) => (entry._tag === "ModelResponse" ? "response" : "compaction"))).toEqual(
                expected.activeEntries,
              )
              expect(path[0]).toMatchObject({ _tag: "ModelResponse", content: [{ type: "text", text: responseText }] })
              expect(yield* session.latestCompaction()).toBeUndefined()
              expect(retainedCompaction).toMatchObject({
                _tag: "Compaction",
                id: checkpointId,
                projectedHistory: Prompt.make(summary),
              })
              expect(payment).toMatchObject({
                status: "succeeded",
                replayPolicy: "never",
                result: { receipt: expected.retainedReceipt },
              })
              expect(modelOperation).toMatchObject({ status: "succeeded", replayPolicy: "never" })
              expect(creates).toBe(0)
              break
            }
          }
          model = step(model, action, seed)
          const runs = yield* store.list({ limit: 10 })
          expect(runs).toHaveLength(model.runCount)
          if (model.sourceStatus !== undefined) {
            expect(yield* store.inspect(sourceRunId)).toMatchObject({ status: model.sourceStatus })
            const execution = yield* store.loadExecution(sourceRunId)
            expect(execution.ownerId).toBe(model.claimed ? workerId : undefined)
            expect((yield* store.snapshot(sourceRunId)).budget.toolCalls).toBe(model.remainingToolCalls)
          }
          if (model.forkStatus !== undefined) {
            expect(yield* store.inspect(forkRunId)).toMatchObject({ status: model.forkStatus })
          }
          if (model.archiveStatus !== undefined) {
            expect(yield* store.inspect(archiveRunId)).toMatchObject({ status: model.archiveStatus })
          }
          if (model.operated) {
            const history = yield* store.history({ runId: sourceRunId, cursor: Cursor.make(-1), limit: 200 })
            expect(history.filter((event) => event._tag === "ToolExecutionStarted")).toHaveLength(
              model.incurredToolCalls,
            )
            const session = Option.getOrThrow(yield* store.sessionReader(`session:${seed}`))
            expect(
              (yield* session.path()).map((entry) => (entry._tag === "ModelResponse" ? "response" : "compaction")),
            ).toEqual(model.activeEntries)
            if (paymentOperationId !== undefined) {
              expect(yield* store.getOperation({ runId: sourceRunId, operationId: paymentOperationId })).toMatchObject({
                status: "succeeded",
                result: { receipt: model.retainedReceipt },
              })
            }
          }
        }
        expect(model.projected).toBe(true)
      }).pipe(Effect.scoped, Effect.provide(BunCrypto.layer)),
    )
  }
})
