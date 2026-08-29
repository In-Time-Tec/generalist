import { describe, expect, it } from "@effect/vitest"
import { Config, Deferred, Effect, Fiber, Layer, Option, Redacted, Schema, Stream } from "effect"
import { LanguageModel, Prompt, Response, Tool, Toolkit } from "effect/unstable/ai"
import { HttpClient, HttpClientResponse } from "effect/unstable/http"
import { Agent, Session, ToolContext, ToolExecutor } from "../../../../src/index.js"
import { layer } from "../../../../src/ai/provider/openrouter.js"
import { Address, ExecutionHost, ExecutableResolver, Runtime, RunStore } from "../../../../src/runtime/index.js"
import { layer as activeExecutionsLayer } from "../../../../src/runtime/execution/active-executions.js"
import { make as makeExecutionHost } from "../../../../src/runtime/execution/host.js"
import type { ExecutionClaim, WorkerMutationError } from "../../../../src/runtime/run/store.js"
import { assistant, assistantRef, registrationsFor, textPrompt } from "../../execution/fixtures.js"
import { closedTestAgent, testExecutable } from "../../run/identity.js"
import { provideScoped } from "../../execution/scoped-provide.js"

export interface OperationRecoverySuiteOptions<StoreError, Extra = never> {
  readonly name: string
  readonly makeLayer: (
    options: Runtime.LayerOptions,
  ) => Layer.Layer<Runtime.Runtime | RunStore.RunStore | ExecutionHost.ExecutionHost | Extra, StoreError>
  readonly claim?: (
    runId: string,
    ownerId: string,
  ) => Effect.Effect<ExecutionClaim, WorkerMutationError, RunStore.RunStore | Extra>
  readonly expireClaim?: (runId: string) => Effect.Effect<void, WorkerMutationError, Extra>
  readonly skip?: boolean
}

const finish = Response.makePart("finish", {
  reason: "stop",
  usage: Response.Usage.make({
    inputTokens: { total: 1, uncached: 1, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 1, text: 1, reasoning: undefined },
  }),
  response: undefined,
})
const stringify = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))

const openRouterChunk = (delta: { readonly reasoning?: string; readonly content?: string }): string =>
  JSON.stringify({
    id: "generation-1",
    choices: [{ delta, index: 0 }],
    created: 1,
    model: "router-test",
    object: "chat.completion.chunk",
  })

const terminalDecodeResponse = [
  openRouterChunk({ reasoning: "thinking" }),
  openRouterChunk({ content: "partial answer" }),
  JSON.stringify({
    id: "generation-1",
    choices: "invalid",
    created: 1,
    model: "router-test",
    object: "chat.completion.chunk",
  }),
]
  .map((data) => `data: ${data}\n\n`)
  .join("")

export const operationRecoverySuite = <StoreError, Extra = never>(
  options: OperationRecoverySuiteOptions<StoreError, Extra>,
) => {
  const describeBackend = options.skip === true ? describe.skip : describe
  const claim = (runId: string, ownerId: string) =>
    options.claim === undefined
      ? Effect.flatMap(RunStore.RunStore, (store) => store.claimExecution({ runId, ownerId }))
      : options.claim(runId, ownerId)

  describeBackend(`running operation recovery (${options.name})`, () => {
    it.live("settles a terminal OpenRouter stream decode failure without making the model operation unknown", () => {
      let providerCalls = 0
      const client = HttpClient.make((request) =>
        Effect.sync(() => {
          providerCalls += 1
          return HttpClientResponse.fromWeb(
            request,
            new globalThis.Response(terminalDecodeResponse, {
              status: 200,
              headers: { "content-type": "text/event-stream" },
            }),
          )
        }),
      )
      const agent = Agent.make({
        name: `terminal-stream-decode-${options.name}`,
        model: { provider: "openrouter", model: "router-test" },
      })
      const executable = testExecutable(agent, `terminal-stream-decode-${options.name}-v1`)
      const model = layer({
        model: "router-test",
        apiKey: Config.succeed(Redacted.make("test-key")),
      }).pipe(Layer.provide(Layer.succeed(HttpClient.HttpClient, client)))
      const resolver = ExecutableResolver.makeStatic([
        { executable, agent: Agent.close(agent, model.pipe(Layer.orDie)) },
      ])

      return provideScoped(
        options.makeLayer({ resolver, addresses: [], scheduler: { pollInterval: "1 hour" } }),
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const store = yield* RunStore.RunStore
          const host = yield* ExecutionHost.ExecutionHost
          const receipt = yield* runtime.start({
            executable,
            registrations: registrationsFor(executable),
            sessionId: `session:terminal-stream-decode:${options.name}`,
            idempotencyKey: `terminal-stream-decode:${options.name}`,
            prompt: textPrompt("decode the response"),
          })
          const executionClaim = yield* claim(receipt.runId, `terminal-stream-decode-${options.name}`)
          yield* host.execute(executionClaim)

          const history = yield* runtime.history({ runId: receipt.runId, cursor: -1, limit: 100 })
          const tags = history.map((event) => event._tag)
          const operation = yield* store.getOperationByKey({
            runId: receipt.runId,
            operationKey: `${receipt.runId}:model:0:0:conversation`,
          })
          expect(providerCalls).toBe(1)
          expect(history).toContainEqual(
            expect.objectContaining({
              _tag: "ModelAttemptFailed",
              category: "stream-decode",
              classification: "terminal",
              disposition: "terminal",
            }),
          )
          expect(history).toContainEqual(
            expect.objectContaining({
              _tag: "ModelCallFailed",
              category: "stream-decode",
              classification: "terminal",
            }),
          )
          expect(operation).toMatchObject({ kind: "model", replayPolicy: "never", status: "failed" })
          expect((yield* runtime.inspect(receipt.runId)).status).toBe("failed")
          expect(tags).toContain("ModelResponseInterrupted")
          expect(tags).toContain("RunFailed")
          expect(tags).not.toContain("OperationUnknown")
        }),
      )
    })

    it.live("persists one bounded tool outcome across operation, event, Session, and provider input", () => {
      const raw = `raw-tool-sentinel:${"x".repeat(60 * 1024)}`
      const tool = Tool.make("large_result", { parameters: Schema.Struct({}), success: Schema.String })
      const toolkit = Toolkit.make(tool)
      const agent = Agent.make({ name: `bounded-tool-outcome-${options.name}`, toolkit })
      const executable = testExecutable(agent, `bounded-tool-outcome-${options.name}-v1`)
      const address = Address.make(`agent:bounded-tool-outcome-${options.name}`)
      const sessionId = `session:bounded-tool-outcome:${options.name}`
      let modelCalls = 0
      let toolCalls = 0
      let secondPrompt = ""
      const model = Layer.effect(
        LanguageModel.LanguageModel,
        LanguageModel.make({
          generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
          streamText: (request) => {
            modelCalls += 1
            if (modelCalls === 1) {
              return Stream.fromIterable<Response.StreamPartEncoded>([
                Response.makePart("tool-call", {
                  id: "large-result-call",
                  name: "large_result",
                  params: {},
                  providerExecuted: false,
                }),
                finish,
              ])
            }
            secondPrompt = JSON.stringify(request.prompt.content)
            return Stream.fromIterable<Response.StreamPartEncoded>([
              Response.makePart("text-delta", { id: "done", delta: "done" }),
              finish,
            ])
          },
        }),
      )
      const executor = ToolExecutor.layerTest({
        execute: () =>
          Effect.sync(() => {
            toolCalls += 1
            return { _tag: "Success" as const, result: raw, encodedResult: raw }
          }),
      })
      const handlers = toolkit.toLayer({
        large_result: () => Effect.die("ToolExecutor test layer owns execution"),
      })
      const resolver = ExecutableResolver.makeStatic([
        { executable, agent: Agent.close(agent, Layer.mergeAll(model, executor, handlers)) },
      ])

      return provideScoped(
        options.makeLayer({
          resolver,
          addresses: [{ address, executable, registrations: registrationsFor(executable) }],
          scheduler: { pollInterval: "1 hour" },
        }),
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const store = yield* RunStore.RunStore
          const host = yield* ExecutionHost.ExecutionHost
          const receipt = yield* runtime.send({
            to: address,
            sessionId,
            idempotencyKey: `bounded-tool-outcome:${options.name}`,
            prompt: textPrompt("return a large result"),
          })
          yield* host.execute(yield* claim(receipt.runId, `bounded-tool-outcome-${options.name}`))

          const operation = yield* store.getOperationByKey({
            runId: receipt.runId,
            operationKey: `${receipt.runId}:tool:0:large-result-call:large_result`,
          })
          const outcome = yield* Schema.decodeUnknownEffect(
            Schema.TaggedStruct("Success", {
              result: Schema.Unknown,
              encodedResult: Schema.Struct({
                inline: Schema.Struct({
                  truncated: Schema.Literal(true),
                  bytes: Schema.Finite,
                  maxBytes: Schema.Finite,
                  digest: Schema.String,
                  preview: Schema.String,
                }),
                outputPaths: Schema.Array(Schema.String),
              }),
              outputPaths: Schema.Array(Schema.String),
            }),
          )(operation?.result)
          const history = yield* runtime.history({ runId: receipt.runId, cursor: -1, limit: 100 })
          const completed = history.find((event) => event._tag === "ToolExecutionCompleted")
          if (completed?._tag !== "ToolExecutionCompleted") return yield* Effect.die("tool completion missing")
          const session = yield* store.sessionStore(sessionId)
          if (session._tag === "None") return yield* Effect.die("Session store missing")
          const context = Session.buildContext(yield* session.value.path())
          let sessionResult: Prompt.ToolResultPart | undefined
          for (const message of context.content) {
            if (!Array.isArray(message.content)) continue
            for (const part of message.content) {
              const result = Schema.decodeUnknownOption(Prompt.ToolResultPart)(part)
              if (Option.isSome(result) && result.value.id === "large-result-call") {
                sessionResult = result.value
                break
              }
            }
            if (sessionResult !== undefined) break
          }

          expect((yield* runtime.inspect(receipt.runId)).status).toBe("succeeded")
          expect(modelCalls).toBe(2)
          expect(toolCalls).toBe(1)
          expect(operation).toMatchObject({ kind: "tool", status: "succeeded" })
          expect(outcome.encodedResult.inline).toMatchObject({
            truncated: true,
            bytes: raw.length + 2,
            maxBytes: 50 * 1024,
          })
          expect(outcome.encodedResult.outputPaths).toEqual([])
          expect(completed.result.encodedResult).toEqual(outcome.encodedResult)
          expect(sessionResult?.result).toEqual(outcome.encodedResult)
          expect(secondPrompt).toContain(outcome.encodedResult.inline.digest)
          expect(stringify(operation)).not.toContain(raw)
          expect(stringify(completed)).not.toContain(raw)
          expect(stringify(context.content)).not.toContain(raw)
          expect(secondPrompt).not.toContain(raw)
        }),
      )
    })

    it.live("reconciles every replay policy atomically and idempotently under the current claim", () =>
      provideScoped(
        options.makeLayer({
          resolver: ExecutableResolver.makeStatic([{ executable: assistantRef, agent: closedTestAgent(assistant) }]),
          addresses: [],
          scheduler: { pollInterval: "1 hour" },
        }),
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const store = yield* RunStore.RunStore
          const receipt = yield* runtime.start({
            executable: assistantRef,
            registrations: registrationsFor(assistantRef),
            sessionId: `session:operation-recovery:${options.name}:policies`,
            idempotencyKey: "operation-recovery:policies",
            prompt: textPrompt("recover policies"),
          })
          const original = yield* claim(receipt.runId, "original")
          const attempt = (yield* store.loadExecution(receipt.runId)).attempt
          const operations = yield* Effect.forEach(
            [
              { key: "pure", replayPolicy: "pure" },
              { key: "provider-idempotent", replayPolicy: "provider-idempotent" },
              { key: "first-never", replayPolicy: "never" },
              { key: "second-never", replayPolicy: "never" },
            ] as const,
            ({ key, replayPolicy }) =>
              Effect.gen(function* () {
                const operation = yield* store.recordOperation({
                  ...original,
                  operationKey: `operation:${key}`,
                  kind: "tool",
                  inputDigest: key,
                  input: { key, replayPolicy },
                  replayPolicy,
                  attempt,
                })
                yield* store.startOperation({ ...original, operationId: operation.operationId })
                return operation
              }),
          )

          if (options.expireClaim !== undefined) yield* options.expireClaim(receipt.runId)
          const recovery = yield* claim(receipt.runId, "recovery")
          expect(yield* store.recoverRunningOperations(recovery)).toBe("blocked")
          expect(
            (yield* store.getOperation({ runId: receipt.runId, operationId: operations[0].operationId })).status,
          ).toBe("requested")
          expect(
            (yield* store.getOperation({ runId: receipt.runId, operationId: operations[1]!.operationId })).status,
          ).toBe("requested")
          expect(
            (yield* store.getOperation({ runId: receipt.runId, operationId: operations[2]!.operationId })).status,
          ).toBe("unknown")
          expect(
            (yield* store.getOperation({ runId: receipt.runId, operationId: operations[3]!.operationId })).status,
          ).toBe("unknown")
          expect((yield* runtime.inspect(receipt.runId)).status).toBe("needs-resolution")

          expect(yield* store.recoverRunningOperations(recovery)).toBe("blocked")
          const history = yield* runtime.history({ runId: receipt.runId, cursor: -1, limit: 100 })
          expect(history.filter((event) => event._tag === "OperationUnknown")).toHaveLength(2)
          expect((yield* store.recoverRunningOperations(original).pipe(Effect.flip))._tag).toBe(
            "tenetkit/runtime/StaleClaim",
          )

          yield* runtime.resolveOperation({
            runId: receipt.runId,
            operationId: operations[2]!.operationId,
            idempotencyKey: "operation-recovery:resolve",
            resolution: { _tag: "Succeeded", value: "already happened" },
          })
          expect((yield* runtime.inspect(receipt.runId)).status).toBe("needs-resolution")
          yield* runtime.resolveOperation({
            runId: receipt.runId,
            operationId: operations[3]!.operationId,
            idempotencyKey: "operation-recovery:resolve-second",
            resolution: { _tag: "Succeeded", value: "also already happened" },
          })
          expect((yield* runtime.inspect(receipt.runId)).status).not.toBe("needs-resolution")
          expect(
            (yield* store.getOperation({ runId: receipt.runId, operationId: operations[2]!.operationId })).status,
          ).toBe("succeeded")
          expect(
            (yield* store.getOperation({ runId: receipt.runId, operationId: operations[3]!.operationId })).status,
          ).toBe("succeeded")
        }),
      ),
    )

    it.live("blocks crash recovery before another agent turn when a never-replay tool was running", () => {
      const started = Deferred.make<void>()
      return Effect.gen(function* () {
        const toolStarted = yield* started
        const tool = Tool.make("crash_tool", { parameters: Schema.Struct({}), success: Schema.String })
        const agent = Agent.make({ name: `operation-recovery-${options.name}`, toolkit: Toolkit.make(tool) })
        const executable = testExecutable(agent, `operation-recovery-${options.name}-v1`)
        const address = Address.make(`agent:operation-recovery-${options.name}`)
        let modelCalls = 0
        let toolCalls = 0
        const model = Layer.effect(
          LanguageModel.LanguageModel,
          LanguageModel.make({
            generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
            streamText: () => {
              modelCalls += 1
              return Stream.fromIterable<Response.StreamPartEncoded>([
                Response.makePart("tool-call", {
                  id: "crash-call",
                  name: "crash_tool",
                  params: {},
                  providerExecuted: false,
                }),
                finish,
              ])
            },
          }),
        )
        const executor = ToolExecutor.layerTest({
          execute: () =>
            Effect.gen(function* () {
              toolCalls += 1
              yield* Deferred.succeed(toolStarted, undefined)
              return yield* Effect.never
            }),
        })
        const handlers = Toolkit.make(tool).toLayer({
          crash_tool: () => Effect.die("ToolExecutor test layer owns execution"),
        })
        const resolver = ExecutableResolver.makeStatic([
          { executable, agent: Agent.close(agent, Layer.mergeAll(model, executor, handlers)) },
        ])

        yield* provideScoped(
          options.makeLayer({
            resolver,
            addresses: [{ address, executable, registrations: registrationsFor(executable) }],
            scheduler: { pollInterval: "1 hour" },
          }),
          Effect.gen(function* () {
            const runtime = yield* Runtime.Runtime
            const store = yield* RunStore.RunStore
            const host = yield* ExecutionHost.ExecutionHost
            const receipt = yield* runtime.send({
              to: address,
              sessionId: `session:operation-recovery:${options.name}:crash`,
              idempotencyKey: "operation-recovery:crash",
              prompt: textPrompt("crash after tool dispatch"),
            })
            const original = yield* claim(receipt.runId, "process-before-crash")
            const orphan = yield* host.execute(original).pipe(Effect.forkChild({ startImmediately: true }))
            yield* Deferred.await(toolStarted).pipe(Effect.timeout("5 seconds"))

            const before = yield* runtime.history({ runId: receipt.runId, cursor: -1, limit: 100 })
            const beforeTags = before.map((event) => event._tag)
            expect(beforeTags).toContain("ModelResponseCommitted")
            expect(beforeTags).toContain("ToolExecutionStarted")
            const turnsBefore = beforeTags.filter((tag) => tag === "TurnStarted").length
            const operation = yield* store.getOperationByKey({
              runId: receipt.runId,
              operationKey: `${receipt.runId}:tool:0:crash-call:crash_tool`,
            })
            expect(operation).toMatchObject({ status: "running", replayPolicy: "never" })

            if (options.expireClaim !== undefined) yield* options.expireClaim(receipt.runId)
            const recoveryClaim = yield* claim(receipt.runId, "process-after-crash")
            const recoveryActive = yield* Layer.build(Layer.fresh(activeExecutionsLayer))
            const recoveryHost = yield* makeExecutionHost({
              workerId: "process-after-crash",
              resolver,
            }).pipe(Effect.provideService(RunStore.RunStore, store), Effect.provideContext(recoveryActive))
            yield* recoveryHost.execute(recoveryClaim).pipe(Effect.timeout("5 seconds"))

            const after = yield* runtime.history({ runId: receipt.runId, cursor: -1, limit: 100 })
            const afterTags = after.map((event) => event._tag)
            expect((yield* runtime.inspect(receipt.runId)).status).toBe("needs-resolution")
            expect(afterTags.filter((tag) => tag === "OperationUnknown")).toHaveLength(1)
            expect(afterTags.filter((tag) => tag === "TurnStarted")).toHaveLength(turnsBefore)
            expect(afterTags).not.toContain("RunFailed")
            expect(modelCalls).toBe(1)
            expect(toolCalls).toBe(1)
            if (operation === undefined) return yield* Effect.die("running operation missing")
            expect(
              (yield* store.getOperation({ runId: receipt.runId, operationId: operation.operationId })).status,
            ).toBe("unknown")

            yield* Fiber.interrupt(orphan)
          }),
        )
      })
    })

    it.live("re-enters a provider-idempotent Agent tool with the same operation key after a crash", () => {
      const started = Deferred.make<void>()
      return Effect.gen(function* () {
        const toolStarted = yield* started
        const tool = Tool.make("idempotent_write", { parameters: Schema.Struct({}), success: Schema.String })
        const agent = Agent.make({ name: `idempotent-recovery-${options.name}`, toolkit: Toolkit.make(tool) })
        const executable = testExecutable(agent, `idempotent-recovery-${options.name}-v1`)
        const address = Address.make(`agent:idempotent-recovery-${options.name}`)
        const providerResults = new Map<string, string>()
        const executorKeys = new Array<string>()
        let modelCalls = 0
        let toolCalls = 0
        let sideEffects = 0
        let semanticCancellations = 0
        const model = Layer.effect(
          LanguageModel.LanguageModel,
          LanguageModel.make({
            generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
            streamText: () => {
              modelCalls += 1
              return modelCalls === 1
                ? Stream.fromIterable<Response.StreamPartEncoded>([
                    Response.makePart("tool-call", {
                      id: "idempotent-call",
                      name: "idempotent_write",
                      params: {},
                      providerExecuted: false,
                    }),
                    finish,
                  ])
                : Stream.fromIterable<Response.StreamPartEncoded>([
                    Response.makePart("text-delta", { id: "done", delta: "done" }),
                    finish,
                  ])
            },
          }),
        )
        const executor = ToolExecutor.layerTest({
          replayPolicy: (request) => (request.call.name === "idempotent_write" ? "provider-idempotent" : "never"),
          execute: () =>
            Effect.gen(function* () {
              const context = yield* ToolContext.ToolContext
              if (context.operationKey === undefined || context.idempotencyKey === undefined) {
                return yield* Effect.die("Agent ToolContext is missing durable operation identity")
              }
              toolCalls += 1
              executorKeys.push(context.operationKey)
              const completed = providerResults.get(context.idempotencyKey)
              if (completed !== undefined) {
                return { _tag: "Success" as const, result: completed, encodedResult: completed }
              }
              sideEffects += 1
              providerResults.set(context.idempotencyKey, "applied once")
              yield* Deferred.succeed(toolStarted, undefined)
              return yield* Effect.never
            }),
          cancel: () =>
            Effect.sync(() => {
              semanticCancellations += 1
              return { _tag: "Cancelled" as const }
            }),
        })
        const handlers = Toolkit.make(tool).toLayer({
          idempotent_write: () => Effect.die("ToolExecutor test layer owns execution"),
        })
        const resolver = ExecutableResolver.makeStatic([
          { executable, agent: Agent.close(agent, Layer.mergeAll(model, executor, handlers)) },
        ])

        yield* provideScoped(
          options.makeLayer({
            resolver,
            addresses: [{ address, executable, registrations: registrationsFor(executable) }],
            scheduler: { pollInterval: "1 hour" },
          }),
          Effect.gen(function* () {
            const runtime = yield* Runtime.Runtime
            const store = yield* RunStore.RunStore
            const host = yield* ExecutionHost.ExecutionHost
            const receipt = yield* runtime.send({
              to: address,
              sessionId: `session:idempotent-recovery:${options.name}`,
              idempotencyKey: "idempotent-recovery",
              prompt: textPrompt("write once"),
            })
            const operationKey = `${receipt.runId}:tool:0:idempotent-call:idempotent_write`
            const original = yield* claim(receipt.runId, "process-before-crash")
            const orphan = yield* host.execute(original).pipe(Effect.forkChild({ startImmediately: true }))
            yield* Deferred.await(toolStarted).pipe(Effect.timeout("5 seconds"))
            const operation = yield* store.getOperationByKey({ runId: receipt.runId, operationKey })
            expect(operation).toMatchObject({ status: "running", replayPolicy: "provider-idempotent" })

            if (options.expireClaim !== undefined) yield* options.expireClaim(receipt.runId)
            const recoveryClaim = yield* claim(receipt.runId, "process-after-crash")
            expect(yield* store.recoverRunningOperations(recoveryClaim)).toBe("ready")
            if (operation === undefined) return yield* Effect.die("running operation missing")
            expect(
              (yield* store.getOperation({ runId: receipt.runId, operationId: operation.operationId })).status,
            ).toBe("requested")
            expect((yield* runtime.inspect(receipt.runId)).status).not.toBe("needs-resolution")

            const recoveryActive = yield* Layer.build(Layer.fresh(activeExecutionsLayer))
            const recoveryHost = yield* makeExecutionHost({
              workerId: "process-after-crash",
              resolver,
            }).pipe(Effect.provideService(RunStore.RunStore, store), Effect.provideContext(recoveryActive))
            yield* recoveryHost.execute(recoveryClaim).pipe(Effect.timeout("5 seconds"))

            const history = yield* runtime.history({ runId: receipt.runId, cursor: -1, limit: 100 })
            expect((yield* runtime.inspect(receipt.runId)).status).toBe("succeeded")
            expect(history.filter((event) => event._tag === "OperationUnknown")).toHaveLength(0)
            expect(
              (yield* store.getOperation({ runId: receipt.runId, operationId: operation.operationId })).status,
            ).toBe("succeeded")
            expect(modelCalls).toBe(2)
            expect(toolCalls).toBe(2)
            expect(executorKeys).toEqual([operationKey, operationKey])
            expect(sideEffects).toBe(1)
            expect(semanticCancellations).toBe(0)
            expect(providerResults).toEqual(new Map([[operationKey, "applied once"]]))

            yield* Fiber.interrupt(orphan)
          }),
        )
      })
    })
  })
}
