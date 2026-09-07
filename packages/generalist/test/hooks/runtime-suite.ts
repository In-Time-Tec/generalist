import { expect, it } from "@effect/vitest"
import { Effect, Layer, Schema, Stream } from "effect"
import { LanguageModel, Prompt, Response } from "effect/unstable/ai"
import { Agent, Approvals, Hooks, Permissions } from "../../src/index.js"
import { ExecutableResolver, Runtime, RunExecutor, RunStore } from "../../src/runtime/index.js"
import { JournalFault } from "../../src/runtime/operation/journal-fault.js"
import { objectRuntimeLayer } from "../runtime/execution/object.js"

export const register = ({
  makeObjectStorage,
}: {
  readonly makeObjectStorage: typeof import("../runtime/execution/object.js").makeObjectStorage
}): void => {
  const scopedWith =
    <R, E>(layer: Layer.Layer<R, E>) =>
    <A, E2>(effect: Effect.Effect<A, E2, R>) =>
      Effect.scoped(Layer.build(layer).pipe(Effect.flatMap((context) => effect.pipe(Effect.provideContext(context)))))
  const promptText = Schema.encodeSync(Schema.fromJsonString(Prompt.Prompt))

  it.effect("reopens an accepted terminal hook without redispatching the hook or the completed model", () =>
    Effect.gen(function* () {
      const storage = makeObjectStorage()
      const agent = Agent.make({ name: "terminal-hook-reopen" })
      const resolver = ExecutableResolver.layerStatic([]).pipe(Layer.orDie)
      let calls = 0
      const hooks = Hooks.layer([
        Hooks.onRunEnd({
          key: "terminal-effect",
          version: "1",
          replayPolicy: "never",
          hook: () =>
            Effect.sync(() => {
              calls += 1
              return Hooks.Replace("terminal hook output")
            }),
        }),
      ])
      const authorization = Layer.mergeAll(Permissions.layerAllowAll, Approvals.layerAutoApprove, hooks)
      const firstModel = Layer.effect(
        LanguageModel.LanguageModel,
        LanguageModel.make({
          generateText: () => Effect.die("unused"),
          streamText: () =>
            Stream.make(
              Response.makePart("text-delta", { id: "done", delta: "model output" }),
              Response.makePart("finish", {
                reason: "stop",
                response: undefined,
                usage: Response.Usage.make({
                  inputTokens: { total: 1, uncached: 1, cacheRead: undefined, cacheWrite: undefined },
                  outputTokens: { total: 1, text: 1, reasoning: undefined },
                }),
              }),
            ),
        }),
      )
      const first = Layer.mergeAll(
        objectRuntimeLayer({ addresses: [], workerId: "terminal-first" }, storage).pipe(
          Layer.provide(
            Layer.merge(
              resolver,
              Layer.succeed(JournalFault, {
                afterJournaledOperation: Effect.void,
                afterCompletedOperation: Effect.suspend(() => (calls > 0 ? Effect.interrupt : Effect.void)),
              }),
            ),
          ),
        ),
        authorization,
        firstModel,
      )
      const runId = yield* scopedWith(first)(
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const executor = yield* RunExecutor.RunExecutor
          const store = yield* RunStore.RunStore
          yield* runtime.register(agent)
          const handle = yield* runtime.start(agent, "input", { idempotencyKey: "terminal-hook" })
          yield* executor.execute(
            yield* store.claimExecution({ runId: handle.runId, ownerId: "terminal-first", commandId: "first" }),
          )
          expect((yield* store.loadExecution(handle.runId)).checkpoint).toMatchObject({
            state: { pending: { kind: "memory", completed: true, input: { terminal: true } } },
          })
          return handle.runId
        }),
      )
      const recovered = Layer.mergeAll(
        objectRuntimeLayer({ addresses: [], workerId: "terminal-second" }, storage).pipe(Layer.provide(resolver)),
        authorization,
        Layer.effect(
          LanguageModel.LanguageModel,
          LanguageModel.make({
            generateText: () => Effect.die("unused"),
            streamText: () => Stream.die("Completed model must not redispatch"),
          }),
        ),
      )
      yield* scopedWith(recovered)(
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const executor = yield* RunExecutor.RunExecutor
          const store = yield* RunStore.RunStore
          yield* runtime.register(agent)
          yield* executor.execute(
            yield* store.claimExecution({ runId, ownerId: "terminal-second", commandId: "second" }),
          )
          expect((yield* runtime.inspect(runId)).status).toBe("succeeded")
          expect(
            (yield* runtime.history({ runId, limit: 100 })).find((event) => event._tag === "RunCompleted"),
          ).toMatchObject({ result: { output: "terminal hook output" } })
          expect(calls).toBe(1)
        }),
      )
    }),
  )

  it.effect("reopens an accepted hook operation before its decision checkpoint without repeating the callback", () =>
    Effect.gen(function* () {
      const storage = makeObjectStorage()
      const agent = Agent.make({ name: "hook-operation-reopen" })
      const resolver = ExecutableResolver.layerStatic([]).pipe(Layer.orDie)
      let calls = 0
      let operationKey = ""
      const hooks = Hooks.layer([
        Hooks.onRunStart({
          key: "external-audit",
          version: "1",
          replayPolicy: "never",
          hook: (_, context) =>
            Effect.sync(() => {
              calls += 1
              operationKey = context.operationKey
              return Hooks.AddContext("accepted hook context")
            }),
        }),
      ])
      const authorization = Layer.mergeAll(Permissions.layerAllowAll, Approvals.layerAutoApprove, hooks)
      const firstModel = Layer.effect(
        LanguageModel.LanguageModel,
        LanguageModel.make({
          generateText: () => Effect.die("unused"),
          streamText: () => Stream.die("The fault must occur before model dispatch"),
        }),
      )
      const first = Layer.mergeAll(
        objectRuntimeLayer({ addresses: [], workerId: "hook-first" }, storage).pipe(
          Layer.provide(
            Layer.merge(
              resolver,
              Layer.succeed(JournalFault, {
                afterJournaledOperation: Effect.void,
                afterCompletedOperation: Effect.suspend(() => (calls > 0 ? Effect.interrupt : Effect.void)),
              }),
            ),
          ),
        ),
        authorization,
        firstModel,
      )
      const runId = yield* scopedWith(first)(
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const executor = yield* RunExecutor.RunExecutor
          const store = yield* RunStore.RunStore
          yield* runtime.register(agent)
          const handle = yield* runtime.start(agent, "input", { idempotencyKey: "hook-reopen" })
          yield* executor.execute(
            yield* store.claimExecution({ runId: handle.runId, ownerId: "hook-first", commandId: "first" }),
          )
          const execution = yield* store.loadExecution(handle.runId)
          expect(execution.checkpoint).toMatchObject({ state: { hooks: [{ complete: false, decisions: [] }] } })
          expect(yield* store.getOperationByKey({ runId: handle.runId, operationKey })).toMatchObject({
            kind: "hook",
            status: "succeeded",
          })
          const active = execution.executableManifest.entries.find(
            (entry) => entry.pin === execution.executableRef.active,
          )
          expect(active?._tag).toBe("Agent")
          if (active?._tag !== "Agent") return yield* Effect.die("Agent manifest missing")
          expect(active.manifest.services.some((service) => service.name === "hooks")).toBe(true)
          return handle.runId
        }),
      )
      let prompt = ""
      const recoveredModel = Layer.effect(
        LanguageModel.LanguageModel,
        LanguageModel.make({
          generateText: () => Effect.die("unused"),
          streamText: (request) => {
            prompt = promptText(request.prompt)
            return Stream.make(
              Response.makePart("text-delta", { id: "done", delta: "recovered" }),
              Response.makePart("finish", {
                reason: "stop",
                response: undefined,
                usage: Response.Usage.make({
                  inputTokens: { total: 1, uncached: 1, cacheRead: undefined, cacheWrite: undefined },
                  outputTokens: { total: 1, text: 1, reasoning: undefined },
                }),
              }),
            )
          },
        }),
      )
      const recovered = Layer.mergeAll(
        objectRuntimeLayer({ addresses: [], workerId: "hook-second" }, storage).pipe(Layer.provide(resolver)),
        authorization,
        recoveredModel,
      )
      yield* scopedWith(recovered)(
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const executor = yield* RunExecutor.RunExecutor
          const store = yield* RunStore.RunStore
          yield* runtime.register(agent)
          yield* executor.execute(yield* store.claimExecution({ runId, ownerId: "hook-second", commandId: "second" }))
          expect((yield* runtime.inspect(runId)).status).toBe("succeeded")
          expect(prompt).toContain("accepted hook context")
          expect(calls).toBe(1)
        }),
      )
    }),
  )
}
