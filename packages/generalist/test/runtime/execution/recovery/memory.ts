import { objectRuntimeLayer, objectWorkerId } from "../object.js"
import { make as makeSimulator } from "../../../../src/testing/durability/index.js"
import { expect, it } from "@effect/vitest"
import { Effect, Layer, Schema, Stream } from "effect"
import { LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
import { Agent, Memory } from "../../../../src/index.js"
import { ExecutableResolver, RunExecutor, RunStore, Runtime } from "../../../../src/runtime/index.js"
import { JournalFault } from "../../../../src/runtime/operation/journal-fault.js"
import { allowAllAuthorization } from "../../../authorization.js"
import { provideScoped } from "../scoped-provide.js"

const finish = Response.makePart("finish", {
  reason: "stop",
  usage: Response.Usage.make({
    inputTokens: { total: 1, uncached: 1, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 1, text: 1, reasoning: undefined },
  }),
  response: undefined,
})

export const memoryRecoverySuite = () => {
  for (const terminal of [false, true]) {
    for (const committed of [false, true]) {
      it.live(`reopens Agent remember terminal=${terminal} committed=${committed} without startup recall`, () =>
        Effect.gen(function* () {
          const storage = yield* makeSimulator()
          const toolkit = Toolkit.make(Tool.make("work", { parameters: Schema.Struct({}), success: Schema.String }))
          const agent = Agent.make({
            name: "remember-restart",
            toolkit,
            memory: { agent: "remember-restart", subject: "test" },
          })
          let restarting = false
          let reachedMemory = false
          let recalls = 0
          let models = 0
          let tools = 0
          const memories: Array<{ turn: number; terminal: boolean; transcript: string }> = []
          const memory = Memory.layerTest({
            forget: () => Effect.void,
            history: () => Effect.succeed([]),
            revert: () => Effect.void,
            recall: () =>
              Effect.sync(() => {
                recalls += 1
                return []
              }),
            remember: (input) =>
              Effect.gen(function* () {
                memories.push({
                  turn: input.turn,
                  terminal: input.terminal,
                  transcript: yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(input.transcript).pipe(
                    Effect.orDie,
                  ),
                })
                if (!restarting && input.turn === 3 && input.terminal === terminal) {
                  reachedMemory = true
                  if (!committed) return yield* Effect.interrupt
                }
              }),
          })
          const model = Layer.effect(
            LanguageModel.LanguageModel,
            LanguageModel.make({
              generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
              streamText: () => {
                const turn = models++
                return Stream.fromIterable<Response.StreamPartEncoded>([
                  ...(turn < (terminal ? 3 : 4)
                    ? [
                        Response.makePart("tool-call", {
                          id: `work-${turn}`,
                          name: "work",
                          params: {},
                          providerExecuted: false,
                        }),
                      ]
                    : [Response.makePart("text-delta", { id: "answer", delta: "finished" })]),
                  finish,
                ])
              },
            }),
          )
          const handlers = toolkit.toLayer({
            work: () =>
              Effect.sync(() => {
                tools += 1
                return "worked"
              }),
          })
          const resolver = ExecutableResolver.layerStatic([]).pipe(Layer.orDie)
          const fault = Layer.succeed(
            JournalFault,
            JournalFault.of({
              afterJournaledOperation: Effect.void,
              afterCompletedOperation: Effect.suspend(() =>
                reachedMemory && !restarting ? Effect.interrupt : Effect.void,
              ),
            }),
          )
          const makeLayer = () =>
            Layer.merge(
              objectRuntimeLayer({ addresses: [], scheduler: { pollInterval: "1 hour" } }, storage).pipe(
                Layer.provide(Layer.merge(resolver, fault)),
              ),
              Layer.mergeAll(model, memory, handlers, allowAllAuthorization),
            )
          const run = Effect.gen(function* () {
            const runtime = yield* Runtime.Runtime
            const executor = yield* RunExecutor.RunExecutor
            const store = yield* RunStore.RunStore
            yield* runtime.register(agent)
            const handle = yield* runtime.start(agent, "do work", {
              sessionId: "memory-test",
              idempotencyKey: "memory-test",
            })
            yield* executor.execute(
              yield* store.claimExecution({
                commandId: `runtime-execution-recovery-memory-ts-claim-${restarting ? "after" : "before"}`,
                runId: handle.runId,
                ownerId: objectWorkerId,
              }),
            )
            return {
              failures: (yield* runtime.history({ runId: handle.runId, limit: 1000 })).filter(
                (event) => event._tag === "RunFailed",
              ),
              inspection: yield* runtime.inspect(handle.runId),
              operation: yield* store.getOperationByKey({
                runId: handle.runId,
                operationKey: `${handle.runId}:memory:remember:3:${terminal ? 1 : 0}`,
              }),
            }
          })
          const first = yield* Effect.scoped(provideScoped(makeLayer(), run))
          expect(reachedMemory).toBe(true)
          expect(first.inspection.status).toBe("running")
          expect(first.operation?.status).toBe(committed ? "succeeded" : "requested")
          restarting = true
          const second = yield* Effect.scoped(provideScoped(makeLayer(), run))
          expect(second.failures).toEqual([])
          expect(second.inspection).toMatchObject({ status: "succeeded" })
          expect(second.operation?.status).toBe("succeeded")
          expect(recalls).toBe(1)
          expect(models).toBe(terminal ? 4 : 5)
          expect(tools).toBe(terminal ? 3 : 4)
          const target = memories.filter((entry) => entry.turn === 3)
          expect(target).toHaveLength(committed ? 1 : 2)
          if (!committed) expect(target[1]).toEqual(target[0])
        }),
      )
    }
  }
}
