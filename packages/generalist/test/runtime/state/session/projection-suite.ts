import "./store-suite.js"
import { expect, it } from "@effect/vitest"
import { Effect, Layer, Option, Schema, Stream } from "effect"
import { LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
import { Agent, ToolExecutor } from "../../../../src/index.js"
import { Address, RunExecutor, ExecutableResolver, Runtime, RunStore } from "../../../../src/runtime/index.js"
import { registrationsFor } from "../../execution/fixtures.js"
import { testExecutable } from "../../run/identity.js"
import { objectRuntimeLayer, objectWorkerId } from "../../execution/object.js"
import { provideScoped } from "../../execution/scoped-provide.js"
import type { Simulator } from "../../../../src/testing/durability/index.js"
import type { RunEvent } from "../../../../src/runtime/run/event.js"

import { allowAllAuthorization } from "../../../authorization.js"

export const register = ({
  makeObjectStorage,
}: {
  readonly makeObjectStorage: typeof import("../../execution/object.js").makeObjectStorage
}): void => {
  const scalePoints = [1, 5, 10, 20] as const
  const probe = Tool.make("linear_storage_probe", {
    parameters: Schema.Struct({ marker: Schema.String }),
    success: Schema.String,
  })
  const finish = Response.makePart("finish", {
    reason: "stop",
    usage: Response.Usage.make({
      inputTokens: { total: 1, uncached: 1, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 1, text: 1, reasoning: undefined },
    }),
    response: undefined,
  })

  const markersFor = (scale: number): ReadonlyArray<string> =>
    Array.from({ length: scale }, (_, turn) => `linear-semantic-${turn.toString().padStart(2, "0")}-payload`)

  const makeFixture = (scale: number) => {
    const storage: Simulator = makeObjectStorage()
    const markers = markersFor(scale)
    const agent = Agent.make({ name: "linear-storage", toolkit: Toolkit.make(probe) })
    const executable = testExecutable(agent, "linear-storage-v1")
    const address = Address.make("agent:linear-storage")
    let modelCalls = 0
    let toolCalls = 0
    const model = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
        streamText: () => {
          const turn = modelCalls++
          const marker = markers[turn]
          if (marker === undefined) return Stream.die(new Error(`unexpected model call ${turn}`))
          return Stream.fromIterable<Response.StreamPartEncoded>(
            turn + 1 < scale
              ? [
                  Response.makePart("tool-call", {
                    id: `linear-call-${turn.toString().padStart(2, "0")}`,
                    name: "linear_storage_probe",
                    params: { marker },
                    providerExecuted: false,
                  }),
                  finish,
                ]
              : [
                  Response.makePart("text-start", { id: "linear-answer" }),
                  Response.makePart("text-delta", { id: "linear-answer", delta: marker }),
                  Response.makePart("text-end", { id: "linear-answer" }),
                  finish,
                ],
          )
        },
      }),
    )
    const executor = ToolExecutor.layerTest({
      execute: (request) =>
        Schema.decodeUnknownEffect(Schema.Struct({ marker: Schema.String }))(request.call.params).pipe(
          Effect.map(({ marker }) => {
            toolCalls += 1
            return { _tag: "Success" as const, result: `observed:${marker}`, encodedResult: `observed:${marker}` }
          }),
          Effect.orDie,
        ),
    })
    const handlers = Toolkit.make(probe).toLayer({
      linear_storage_probe: () => Effect.die("ToolExecutor test layer owns execution"),
    })
    const resolverLayer = ExecutableResolver.layerStatic([
      { executable, agent: Agent.close(agent, Layer.mergeAll(allowAllAuthorization, model, executor, handlers)) },
    ]).pipe(Layer.orDie)
    const runtimeLayer = () =>
      objectRuntimeLayer(
        {
          addresses: [{ address, executable, registrations: registrationsFor(executable) }],
          scheduler: { pollInterval: "1 day" },
        },
        storage,
      ).pipe(Layer.provide(resolverLayer))
    return {
      address,
      markers,
      runtimeLayer,
      counts: () => ({ modelCalls, toolCalls }),
    }
  }

  const executeScale = (scale: number) =>
    Effect.gen(function* () {
      const fixture = makeFixture(scale)
      let runId = ""
      yield* provideScoped(
        fixture.runtimeLayer(),
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const store = yield* RunStore.RunStore
          const host = yield* RunExecutor.RunExecutor
          const receipt = yield* runtime.send({
            to: fixture.address,
            sessionId: `session:linear-storage:${scale}`,
            idempotencyKey: `linear-storage:${scale}`,
            prompt: "Generate the scripted linear storage proof.",
          })
          runId = receipt.runId
          const claim = yield* store.claimExecution({
            commandId: `runtime-state-session-store-test-claim-${scale}`,
            runId,
            ownerId: objectWorkerId,
          })
          yield* host.execute(claim)
          expect(yield* runtime.inspect(runId)).toMatchObject({ status: "succeeded" })
        }),
      )

      const counts = fixture.counts()
      expect(counts.modelCalls).toBe(scale)
      expect(counts.toolCalls).toBe(scale - 1)

      yield* provideScoped(
        fixture.runtimeLayer(),
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const store = yield* RunStore.RunStore
          expect(yield* runtime.inspect(runId)).toMatchObject({ status: "succeeded" })
          const history: Array<RunEvent> = []
          const limit = scale * 8 + 20
          let cursor = -1
          while (true) {
            const page = yield* runtime.history({ runId, cursor, limit })
            const last = page.at(-1)
            if (last === undefined) break
            expect(last.sequence).toBeGreaterThan(cursor)
            history.push(...page)
            cursor = last.sequence
            if (page.length < limit) break
          }
          const committed = history.filter((event) => event._tag === "ModelResponseCommitted")
          expect(committed).toHaveLength(scale)

          const session = yield* store.sessionReader(`session:linear-storage:${scale}`)
          if (Option.isNone(session)) return yield* Effect.die("expected durable Session")
          const path = yield* session.value.path()
          expect(path).not.toHaveLength(0)

          for (const [turn, event] of committed.entries()) {
            const marker = fixture.markers[turn]!
            const response = yield* runtime.resolveModelResponse(event)
            expect(response.content.filter((part) => JSON.stringify(part).includes(marker))).toHaveLength(1)

            const entry = yield* runtime.sessionEntry({
              sessionId: event.sessionId,
              entryId: event.sessionEntryId,
            })
            expect(entry._tag).toBe("ModelResponse")
            if (entry._tag === "ModelResponse") {
              expect(entry.content.filter((part) => JSON.stringify(part).includes(marker))).toHaveLength(1)
            }
            const operation = yield* store.getOperationByKey({ runId, operationKey: event.operationKey })
            expect(operation?.status).toBe("succeeded")
            expect(operation?.result).not.toHaveProperty("messages")
          }
        }),
      )
      return counts
    })

  it.live("persists one authoritative Session model projection per scripted turn", () =>
    Effect.gen(function* () {
      const measurements = yield* Effect.all(scalePoints.map(executeScale), { concurrency: 1 })
      expect(measurements.map((measurement) => measurement.modelCalls)).toEqual([...scalePoints])
      expect(measurements.map((measurement) => measurement.toolCalls)).toEqual(scalePoints.map((scale) => scale - 1))
    }),
  )
}
