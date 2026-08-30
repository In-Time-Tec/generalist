import { expect, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Layer, Ref, Schema, Scope, Stream } from "effect"
import { LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
import { Agent, ToolExecutor } from "../../../../src/index.js"
import { Address, ExecutableResolver, RunExecutor, Runtime, RunStore } from "../../../../src/runtime/index.js"
import { pinnedTestExecutable as testExecutable } from "../../run/identity.js"
import { registrationsFor } from "../fixtures.js"
import { tempDbPath } from "../../sql/scenario.js"

import { Runtime as SqliteRuntime } from "../../../../src/runtime/sqlite-bun.js"
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
        : SqliteRuntime.layerSqlite({ ...options, filename: tempDbPath(`model-preview-${input.observer}`) })

    return yield* scopedWith(layer)(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const host = yield* RunExecutor.RunExecutor
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
        const committed = history.filter((event) => event._tag === "ModelResponseCommitted")
        const responses = yield* Effect.forEach(committed, (event) => runtime.resolveModelResponse(event))
        return {
          preview,
          status: snapshot.run.status,
          result: snapshot.outcome?._tag === "Succeeded" ? snapshot.outcome.result : undefined,
          tags: history.map((event) => event._tag),
          responses,
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
    expect(observed.result).toMatchObject({ text: "live answer", turns: 1 })
    expect(observed.tags).toEqual(baseline.tags)
    expect(observed.tags).not.toContain("ModelPart")
    expect(observed.tags).toContain("TurnCompleted")
    expect(disconnected.status).toBe("succeeded")
    expect(disconnected.result).toMatchObject({ text: "live answer", turns: 1 })
    expect(disconnected.tags).toEqual(baseline.tags)
  }),
)

it.effect("keeps the claim-wide preview sink open across a tool continuation", () =>
  Effect.gen(function* () {
    const releaseSecondModel = yield* Deferred.make<void>()
    const secondPreview = yield* Deferred.make<Runtime.ModelPreviewFrame>()
    const tool = Tool.make("continue", { parameters: Schema.Struct({}), success: Schema.String })
    const toolkit = Toolkit.make(tool)
    const agent = Agent.make({ name: "preview-tool-continuation", toolkit })
    const executable = testExecutable(agent, "preview-tool-continuation")
    const address = Address.make("agent:preview-tool-continuation")
    let modelCalls = 0
    const model = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
        streamText: () => {
          modelCalls += 1
          if (modelCalls === 1) {
            return Stream.fromIterable<Response.StreamPartEncoded>([
              Response.makePart("text-delta", { id: "first", delta: "first call" }),
              Response.makePart("tool-call", {
                id: "continue-1",
                name: "continue",
                params: {},
                providerExecuted: false,
              }),
              finish,
            ])
          }
          return Stream.make(Response.makePart("text-delta", { id: "second", delta: "second call" })).pipe(
            Stream.concat(
              Stream.fromEffect(Deferred.await(releaseSecondModel)).pipe(Stream.flatMap(() => Stream.make(finish))),
            ),
          )
        },
      }),
    )
    const executor = ToolExecutor.layerTest({
      execute: () => Effect.succeed({ _tag: "Success", result: "continued", encodedResult: "continued" }),
    })
    const handlers = toolkit.toLayer({ continue: () => Effect.die("ToolExecutor test layer owns execution") })
    const layer = Runtime.layerMemory({
      resolver: ExecutableResolver.makeStatic([
        { executable, agent: Agent.close(agent, Layer.mergeAll(model, executor, handlers)) },
      ]),
      addresses: [{ address, executable, registrations: registrationsFor(executable) }],
      scheduler: { pollInterval: "1 day" },
    })

    yield* scopedWith(layer)(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const host = yield* RunExecutor.RunExecutor
        const store = yield* RunStore.RunStore
        const receipt = yield* runtime.send({
          to: address,
          sessionId: "session:preview-tool-continuation",
          idempotencyKey: "preview-tool-continuation",
          prompt: "use the tool, then answer",
        })
        const subscriber = yield* runtime.previews({ runId: receipt.runId }).pipe(
          Stream.runForEach((event) =>
            event._tag === "ModelPreview" &&
            event.turn === 1 &&
            event.changes.some((change) => change.channel === "text" && change.delta === "second call")
              ? Deferred.succeed(secondPreview, event)
              : Effect.void,
          ),
          Effect.forkChild({ startImmediately: true }),
        )
        const claim = yield* store.claimExecution({ runId: receipt.runId, ownerId: "preview-test" })
        const execution = yield* host.execute(claim).pipe(Effect.forkChild({ startImmediately: true }))

        expect(yield* Deferred.await(secondPreview)).toMatchObject({
          _tag: "ModelPreview",
          attemptFence: 1,
          turn: 1,
          attempt: 0,
          sequence: 0,
          changes: [{ channel: "text", offset: 0, delta: "second call" }],
        })
        expect((yield* runtime.snapshot(receipt.runId)).run.status).toBe("running")
        expect((yield* runtime.history({ runId: receipt.runId, limit: 100 })).map((event) => event._tag)).not.toContain(
          "RunCompleted",
        )

        yield* Deferred.succeed(releaseSecondModel, undefined)
        yield* Fiber.join(execution)
        expect(modelCalls).toBe(2)
        expect(
          (yield* runtime.history({ runId: receipt.runId, limit: 100 })).filter(
            (event) => event._tag === "ModelResponseCommitted",
          ),
        ).toHaveLength(2)
        yield* Fiber.interrupt(subscriber)
      }),
    )
  }),
)

it.effect("retires the published frame when a response commits while keeping the sink open for the next attempt", () =>
  Effect.gen(function* () {
    const releaseSecondModel = yield* Deferred.make<void>()
    const tool = Tool.make("continue", { parameters: Schema.Struct({}), success: Schema.String })
    const toolkit = Toolkit.make(tool)
    const agent = Agent.make({ name: "preview-discard-commit", toolkit })
    const executable = testExecutable(agent, "preview-discard-commit")
    const address = Address.make("agent:preview-discard-commit")
    let modelCalls = 0
    const model = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
        streamText: () => {
          modelCalls += 1
          if (modelCalls === 1) {
            return Stream.fromIterable<Response.StreamPartEncoded>([
              Response.makePart("text-delta", { id: "first", delta: "first call" }),
              Response.makePart("tool-call", {
                id: "continue-1",
                name: "continue",
                params: {},
                providerExecuted: false,
              }),
              finish,
            ])
          }
          return Stream.make(Response.makePart("text-delta", { id: "second", delta: "second call" })).pipe(
            Stream.concat(
              Stream.fromEffect(Deferred.await(releaseSecondModel)).pipe(Stream.flatMap(() => Stream.make(finish))),
            ),
          )
        },
      }),
    )
    const executor = ToolExecutor.layerTest({
      execute: () => Effect.succeed({ _tag: "Success", result: "continued", encodedResult: "continued" }),
    })
    const handlers = toolkit.toLayer({ continue: () => Effect.die("ToolExecutor test layer owns execution") })
    const layer = Runtime.layerMemory({
      resolver: ExecutableResolver.makeStatic([
        { executable, agent: Agent.close(agent, Layer.mergeAll(model, executor, handlers)) },
      ]),
      addresses: [{ address, executable, registrations: registrationsFor(executable) }],
      scheduler: { pollInterval: "1 day" },
    })

    yield* scopedWith(layer)(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const host = yield* RunExecutor.RunExecutor
        const store = yield* RunStore.RunStore
        const receipt = yield* runtime.send({
          to: address,
          sessionId: "session:preview-discard-commit",
          idempotencyKey: "preview-discard-commit",
          prompt: "use the tool, then answer",
        })
        const events = yield* Ref.make<ReadonlyArray<Runtime.ModelPreviewEvent>>([])
        const secondPreview = yield* Deferred.make<Runtime.ModelPreviewFrame>()
        const subscriber = yield* runtime.previews({ runId: receipt.runId }).pipe(
          Stream.runForEach((event) =>
            Effect.all([
              Ref.update(events, (values) => [...values, event]),
              event._tag === "ModelPreview" &&
              event.changes.some((change) => change.channel === "text" && change.delta === "second call")
                ? Deferred.succeed(secondPreview, event)
                : Effect.void,
            ]),
          ),
          Effect.forkChild({ startImmediately: true }),
        )
        const claim = yield* store.claimExecution({ runId: receipt.runId, ownerId: "preview-test" })
        const execution = yield* host.execute(claim).pipe(Effect.forkChild({ startImmediately: true }))

        yield* Deferred.await(secondPreview)
        yield* Deferred.succeed(releaseSecondModel, undefined)
        yield* Fiber.join(execution)
        yield* Fiber.interrupt(subscriber)
        const observed = yield* Ref.get(events)
        const frames = observed.filter((event): event is Runtime.ModelPreviewFrame => event._tag === "ModelPreview")
        const clears = observed.filter(
          (event): event is Runtime.ModelPreviewCleared => event._tag === "ModelPreviewCleared",
        )
        expect(frames.map((frame) => frame.turn)).toContain(0)
        expect(frames.map((frame) => frame.turn)).toContain(1)
        expect(
          frames.some((frame) =>
            frame.changes.some((change) => change.channel === "text" && change.delta === "second call"),
          ),
        ).toBe(true)
        expect(clears.some((cleared) => cleared.attemptFence === 1)).toBe(true)
        expect(modelCalls).toBe(2)
      }),
    )
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
