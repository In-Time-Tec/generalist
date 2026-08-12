import { expect, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Layer, Scope, Stream } from "effect"
import { LanguageModel, Response } from "effect/unstable/ai"
import { Agent } from "@batonfx/core"
import { Address, ExecutableResolver, ExecutionHost, Runtime, RunStore } from "../src/index.js"
import { testExecutable } from "./identity.js"
import { registrationsFor } from "./helpers.js"
import { tempDbPath } from "./sqlite-helpers.js"

const finish = Response.makePart("finish", {
  reason: "stop",
  usage: Response.Usage.make({
    inputTokens: { total: 1, uncached: 1, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 1, text: 1, reasoning: 0 },
  }),
  response: undefined,
})

const scopedWith =
  <A, E>(layer: Layer.Layer<A, E>) =>
  <B, E2, R extends A | Scope.Scope>(effect: Effect.Effect<B, E2, R>) =>
    Effect.scoped(Effect.flatMap(Layer.build(layer), (context) => effect.pipe(Effect.provideContext(context))))

const execute = (input: {
  readonly observer: "absent" | "slow" | "disconnected"
  readonly backend: "memory" | "sqlite"
  readonly chunks?: number
}) =>
  Effect.gen(function* () {
    const releaseModel = yield* Deferred.make<void>()
    const previewSeen = yield* Deferred.make<Runtime.ModelPreviewEvent>()
    const agent = Agent.make({ name: `preview-${input.backend}-${input.observer}` })
    const executable = testExecutable(agent, `preview-${input.backend}-${input.observer}`)
    const address = Address.make(`agent:preview-${input.backend}-${input.observer}`)
    const model = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
        streamText: () => {
          const chunks = input.chunks ?? 1
          const deltas =
            chunks === 1
              ? ["live answer"]
              : Array.from({ length: chunks }, (_, index) => (index % 2 === 0 ? "" : "live answer"[(index - 1) / 2]!))
          return Stream.fromIterable(
            deltas.map((delta) => Response.makePart("text-delta", { id: "answer", delta })),
          ).pipe(
            Stream.concat(
              Stream.fromEffect(Deferred.await(releaseModel)).pipe(Stream.flatMap(() => Stream.make(finish))),
            ),
          )
        },
      }),
    )
    const resolver = ExecutableResolver.makeStatic([{ executable, agent: Agent.close(agent, model) }])
    const options = {
      resolver,
      addresses: [{ address, executable, registrations: registrationsFor(executable) }],
      scheduler: { pollInterval: "1 day" as const },
    }
    const layer =
      input.backend === "memory"
        ? Runtime.layerMemory(options)
        : Runtime.layerSqlite({ ...options, filename: tempDbPath(`model-preview-${input.observer}`) })

    return yield* scopedWith(layer)(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const host = yield* ExecutionHost.ExecutionHost
        const store = yield* RunStore.RunStore
        const receipt = yield* runtime.send({
          to: address,
          sessionId: `session:${input.backend}:${input.observer}`,
          idempotencyKey: `preview:${input.backend}:${input.observer}`,
          prompt: "answer",
        })
        const subscriber =
          input.observer === "absent"
            ? undefined
            : yield* runtime.previews({ runId: receipt.runId }).pipe(
                Stream.runForEach((preview) =>
                  Deferred.succeed(previewSeen, preview).pipe(Effect.andThen(Effect.never)),
                ),
                Effect.forkChild({ startImmediately: true }),
              )
        const claim = yield* store.claimExecution({ runId: receipt.runId, ownerId: "preview-test" })
        const execution = yield* host.execute(claim).pipe(Effect.forkChild({ startImmediately: true }))
        const preview = input.observer === "absent" ? undefined : yield* Deferred.await(previewSeen)
        if (input.observer === "disconnected" && subscriber !== undefined) yield* Fiber.interrupt(subscriber)
        yield* Deferred.succeed(releaseModel, undefined)
        yield* Fiber.join(execution)
        const history = yield* runtime.history({ runId: receipt.runId, limit: 100 })
        const snapshot = yield* runtime.snapshot(receipt.runId)
        return {
          preview,
          status: snapshot.run.status,
          result: snapshot.outcome?._tag === "Succeeded" ? snapshot.outcome.result : undefined,
          tags: history.map((event) => event._tag),
          responses: history.flatMap((event) => (event._tag === "ModelResponseCommitted" ? [event.response] : [])),
        }
      }),
    )
  })

it.effect("publishes live preview without allowing a blocked subscriber to affect execution", () =>
  Effect.gen(function* () {
    const baseline = yield* execute({ backend: "memory", observer: "absent" })
    const observed = yield* execute({ backend: "memory", observer: "slow" })
    const disconnected = yield* execute({ backend: "memory", observer: "disconnected" })

    expect(observed.preview).toMatchObject({
      _tag: "ModelPreview",
      attemptFence: 1,
      turn: 0,
      attempt: 0,
      sequence: 0,
      changes: [{ channel: "text", offset: 0, delta: "live answer" }],
    })
    expect(observed.status).toBe("succeeded")
    expect(observed.result).toEqual(baseline.result)
    expect(observed.tags).toEqual(baseline.tags)
    expect(observed.tags).not.toContain("ModelPart")
    expect(observed.tags).toContain("TurnCompleted")
    expect(disconnected.status).toBe("succeeded")
    expect(disconnected.result).toEqual(baseline.result)
    expect(disconnected.tags).toEqual(baseline.tags)
  }),
)

it.effect("never writes Core ModelPart events to SQLite history", () =>
  Effect.gen(function* () {
    const completed = yield* execute({ backend: "sqlite", observer: "absent" })
    expect(completed.status).toBe("succeeded")
    expect(completed.result).toMatchObject({ text: "live answer", turns: 1 })
    expect(completed.tags).not.toContain("ModelPart")
    expect(completed.tags).toContain("TurnCompleted")
    expect(completed.tags).toContain("RunCompleted")
  }),
)

it.effect("commits one chunk-independent semantic model response to memory and SQLite", () =>
  Effect.gen(function* () {
    for (const backend of ["memory", "sqlite"] as const) {
      const whole = yield* execute({ backend, observer: "absent", chunks: 1 })
      const fragmented = yield* execute({ backend, observer: "absent", chunks: 23 })
      expect(whole.responses).toHaveLength(1)
      expect(fragmented.responses).toHaveLength(1)
      expect(fragmented.responses).toEqual(whole.responses)
      const text = fragmented.responses[0]?.content.filter((part) => part.type === "text")
      expect(text).toHaveLength(1)
      expect(text?.[0]).toMatchObject({ type: "text", text: "live answer" })
      expect(fragmented.tags.filter((tag) => tag === "ModelResponseCommitted")).toHaveLength(1)
      expect(fragmented.tags).not.toContain("ModelPart")
    }
  }),
)
