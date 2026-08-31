import { describe, expect, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Layer, Schema, Stream, Tracer } from "effect"
import { LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
import { Agent, ToolExecutor } from "../../../../src/index.js"
import { RunExecutor, ExecutableResolver, Runtime, RunStore } from "../../../../src/runtime/index.js"
import { layer as activeExecutionsLayer } from "../../../../src/runtime/execution/active-executions.js"
import { make as makeRunExecutor } from "../../../../src/runtime/execution/run-executor-internal.js"
import type { ExecutionClaim, WorkerMutationError } from "../../../../src/runtime/run/store.js"
import {
  assistant,
  assistantRef,
  registrationsFor,
  researcher,
  researcherRef,
  textPrompt,
} from "../../execution/fixtures.js"
import { testExecutable, unusedModel } from "../../run/identity.js"
import { provideScoped } from "../../execution/scoped-provide.js"

export interface ToolCancellationSuiteOptions<StoreError, Extra = never> {
  readonly name: string
  readonly makeLayer: (
    options: Runtime.LayerOptions,
  ) => Layer.Layer<
    Runtime.Runtime | RunStore.RunStore | RunExecutor.RunExecutor | Extra,
    StoreError,
    ExecutableResolver.ExecutableResolver
  >
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

const testTracer = () => {
  const spans: Array<Tracer.NativeSpan> = []
  const tracer = Tracer.make({
    span: (options) => {
      const span = new Tracer.NativeSpan(options)
      spans.push(span)
      return span
    },
  })
  return { spans, tracer }
}

const request = (sessionId: string, toolName: string, toolCallId: string): ToolExecutor.Request => {
  const call = Schema.decodeSync(Response.ToolCallPart(toolName, Schema.Struct({})))({
    type: "tool-call",
    id: toolCallId,
    name: toolName,
    params: {},
    providerExecuted: false,
  })
  return {
    call,
    toolCallBatch: { calls: [call] },
    turn: 0,
    toolCallIndex: 0,
    agentName: "cancellation-agent",
    sessionId,
  }
}

const cancellableOperation = (execution: ToolExecutor.Request) => ({ _tag: "CancellableTool" as const, execution })

export const toolCancellationSuite = <StoreError, Extra = never>(
  options: ToolCancellationSuiteOptions<StoreError, Extra>,
) => {
  const describeBackend = options.skip === true ? describe.skip : describe
  const claim = (runId: string, ownerId: string) =>
    options.claim === undefined
      ? Effect.flatMap(RunStore.RunStore, (store) => store.claimExecution({ runId, ownerId }))
      : options.claim(runId, ownerId)

  describeBackend(`durable tool cancellation (${options.name})`, () => {
    it.live("commits cancellation before delivery and redelivers the same operation identity after a crash", () =>
      Effect.gen(function* () {
        const toolStarted = yield* Deferred.make<void>()
        const cancellationDelivered = yield* Deferred.make<void>()
        const allowAcknowledgement = yield* Deferred.make<void>()
        const tracing = testTracer()
        const cancellationRequests = new Array<ToolExecutor.CancellationRequest>()
        const tool = Tool.make("durable_write", { parameters: Schema.Struct({}), success: Schema.String })
        const toolkit = Toolkit.make(tool)
        const agent = Agent.make({ name: `tool-cancellation-${options.name}`, toolkit })
        const executable = testExecutable(agent, `tool-cancellation-${options.name}-v1`)
        let modelCalls = 0
        const model = Layer.effect(
          LanguageModel.LanguageModel,
          LanguageModel.make({
            generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
            streamText: () => {
              modelCalls += 1
              return Stream.fromIterable<Response.StreamPartEncoded>([
                Response.makePart("tool-call", {
                  id: "durable-write-call",
                  name: "durable_write",
                  params: {},
                  providerExecuted: false,
                }),
                finish,
              ])
            },
          }),
        )
        const executor = ToolExecutor.layerTest({
          replayPolicy: () => "never",
          execute: () => Deferred.succeed(toolStarted, undefined).pipe(Effect.andThen(Effect.never)),
          cancel: (cancellation) =>
            Effect.gen(function* () {
              cancellationRequests.push(cancellation)
              yield* Deferred.succeed(cancellationDelivered, undefined)
              yield* Deferred.await(allowAcknowledgement)
              return { _tag: "Cancelled" as const }
            }),
        })
        const resolverLayer = ExecutableResolver.layerStatic([
          {
            executable,
            agent: Agent.close(
              agent,
              Layer.mergeAll(
                model,
                executor,
                toolkit.toLayer({ durable_write: () => Effect.die("ToolExecutor owns durable_write") }),
              ),
            ),
          },
        ]).pipe(Layer.orDie)

        yield* provideScoped(
          options
            .makeLayer({ addresses: [], scheduler: { pollInterval: "1 hour" } })
            .pipe(Layer.provide(resolverLayer)),
          Effect.gen(function* () {
            const runtime = yield* Runtime.Runtime
            const store = yield* RunStore.RunStore
            const host = yield* RunExecutor.RunExecutor
            const receipt = yield* runtime.start({
              executable,
              registrations: registrationsFor(executable),
              sessionId: `session:tool-cancellation:${options.name}`,
              idempotencyKey: `tool-cancellation:${options.name}`,
              prompt: textPrompt("write"),
            })
            const operationKey = `${receipt.runId}:tool:0:durable-write-call:durable_write`
            const originalClaim = yield* claim(receipt.runId, "tool-cancellation-original")
            const original = yield* host.execute(originalClaim).pipe(Effect.forkChild({ startImmediately: true }))
            yield* Deferred.await(toolStarted).pipe(Effect.timeout("5 seconds"))
            expect(yield* store.getOperationByKey({ runId: receipt.runId, operationKey })).toMatchObject({
              status: "running",
              replayPolicy: "never",
            })

            yield* runtime.cancel({ runId: receipt.runId, reason: "user requested" })
            yield* Fiber.await(original).pipe(Effect.timeout("5 seconds"))
            const committed = yield* store.getOperationByKey({ runId: receipt.runId, operationKey })
            expect(committed).toMatchObject({ status: "cancelling" })
            expect((yield* runtime.inspect(receipt.runId)).status).toBe("cancelling")
            expect(cancellationRequests).toHaveLength(0)
            expect(
              (yield* runtime.history({ runId: receipt.runId, limit: 100 })).some(
                (event) => event._tag === "RunCancelled",
              ),
            ).toBe(false)

            const firstCancellationClaim = yield* claim(receipt.runId, "tool-cancellation-first-delivery")
            const firstCancellation = yield* host
              .execute(firstCancellationClaim)
              .pipe(Effect.forkChild({ startImmediately: true }))
            yield* Deferred.await(cancellationDelivered).pipe(Effect.timeout("5 seconds"))
            expect(cancellationRequests).toHaveLength(1)
            expect((yield* runtime.inspect(receipt.runId)).status).toBe("cancelling")
            expect((yield* store.getOperationByKey({ runId: receipt.runId, operationKey }))?.status).toBe("cancelling")

            yield* Fiber.interrupt(firstCancellation)
            const afterCrash = yield* store.getOperationByKey({ runId: receipt.runId, operationKey })
            expect(afterCrash?.status).toBe("cancelling")
            expect((yield* runtime.inspect(receipt.runId)).status).toBe("cancelling")

            const replacementClaim = yield* claim(receipt.runId, "tool-cancellation-redelivery")
            yield* Deferred.succeed(allowAcknowledgement, undefined)
            yield* provideScoped(
              Layer.mergeAll(Layer.succeed(RunStore.RunStore, store), activeExecutionsLayer, resolverLayer),
              Effect.flatMap(makeRunExecutor, (replacementHost) =>
                replacementHost.execute(replacementClaim).pipe(Effect.timeout("5 seconds")),
              ),
            )

            expect(cancellationRequests).toHaveLength(2)
            expect(cancellationRequests[1]).toEqual(cancellationRequests[0])
            expect(cancellationRequests[1]).toMatchObject({
              operationKey,
              attempt: committed?.attempt,
              sessionId: `session:tool-cancellation:${options.name}`,
              runId: receipt.runId,
              rootRunId: receipt.runId,
              toolCallId: "durable-write-call",
              toolName: "durable_write",
            })
            expect((yield* store.getOperationByKey({ runId: receipt.runId, operationKey }))?.status).toBe("cancelled")
            expect((yield* runtime.inspect(receipt.runId)).status).toBe("cancelled")
            expect(modelCalls).toBe(1)
          }),
        ).pipe(Effect.provideService(Tracer.Tracer, tracing.tracer))
        const semanticCancellationSpans = tracing.spans.filter(
          (span) => span.name === "Generalist.Runtime.semanticCancel",
        )
        expect(semanticCancellationSpans.map((span) => span.events.map(([name]) => name))).toEqual([
          ["generalist.runtime.semantic_cancel.delivered"],
          ["generalist.runtime.semantic_cancel.delivered", "generalist.runtime.semantic_cancel.acknowledged"],
        ])
      }),
    )

    it.live("does not invoke semantic cancellation when execution is interrupted without Runtime.cancel", () =>
      Effect.gen(function* () {
        const toolStarted = yield* Deferred.make<void>()
        let semanticCancellations = 0
        const tool = Tool.make("interrupted_write", { parameters: Schema.Struct({}), success: Schema.String })
        const toolkit = Toolkit.make(tool)
        const agent = Agent.make({ name: `tool-interruption-${options.name}`, toolkit })
        const executable = testExecutable(agent, `tool-interruption-${options.name}-v1`)
        const model = Layer.effect(
          LanguageModel.LanguageModel,
          LanguageModel.make({
            generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
            streamText: () =>
              Stream.fromIterable<Response.StreamPartEncoded>([
                Response.makePart("tool-call", {
                  id: "interrupted-write-call",
                  name: "interrupted_write",
                  params: {},
                  providerExecuted: false,
                }),
                finish,
              ]),
          }),
        )
        const executor = ToolExecutor.layerTest({
          replayPolicy: () => "never",
          execute: () => Deferred.succeed(toolStarted, undefined).pipe(Effect.andThen(Effect.never)),
          cancel: () =>
            Effect.sync(() => {
              semanticCancellations += 1
              return { _tag: "Cancelled" as const }
            }),
        })
        const resolverLayer = ExecutableResolver.layerStatic([
          {
            executable,
            agent: Agent.close(
              agent,
              Layer.mergeAll(
                model,
                executor,
                toolkit.toLayer({ interrupted_write: () => Effect.die("ToolExecutor owns interrupted_write") }),
              ),
            ),
          },
        ]).pipe(Layer.orDie)

        yield* provideScoped(
          options
            .makeLayer({ addresses: [], scheduler: { pollInterval: "1 hour" } })
            .pipe(Layer.provide(resolverLayer)),
          Effect.gen(function* () {
            const runtime = yield* Runtime.Runtime
            const store = yield* RunStore.RunStore
            const host = yield* RunExecutor.RunExecutor
            const receipt = yield* runtime.start({
              executable,
              registrations: registrationsFor(executable),
              sessionId: `session:tool-interruption:${options.name}`,
              idempotencyKey: `tool-interruption:${options.name}`,
              prompt: textPrompt("write"),
            })
            const operationKey = `${receipt.runId}:tool:0:interrupted-write-call:interrupted_write`
            const originalClaim = yield* claim(receipt.runId, "tool-interruption-original")
            const original = yield* host.execute(originalClaim).pipe(Effect.forkChild({ startImmediately: true }))
            yield* Deferred.await(toolStarted).pipe(Effect.timeout("5 seconds"))

            if (options.expireClaim === undefined) {
              yield* Fiber.interrupt(original)
            } else {
              yield* options.expireClaim(receipt.runId)
              const recoveryClaim = yield* claim(receipt.runId, "tool-interruption-recovery")
              expect(yield* store.recoverRunningOperations(recoveryClaim)).toBe("blocked")
              yield* store.releaseExecution(recoveryClaim)
              yield* Fiber.interrupt(original)
            }
            expect(semanticCancellations).toBe(0)
            expect((yield* runtime.inspect(receipt.runId)).status).toBe("needs-resolution")
            expect((yield* store.getOperationByKey({ runId: receipt.runId, operationKey }))?.status).toBe("unknown")
            expect(
              (yield* runtime.history({ runId: receipt.runId, limit: 100 })).some(
                (event) => event._tag === "RunCancellationRequested" || event._tag === "RunCancelled",
              ),
            ).toBe(false)
          }),
        )
      }),
    )

    it.live("closes root and descendant operation admission and waits for both cancellation acknowledgements", () =>
      Effect.gen(function* () {
        const cancellationRequests = new Array<ToolExecutor.CancellationRequest>()
        const executor = ToolExecutor.layerTest({
          replayPolicy: () => "never",
          execute: () => Effect.die("manually admitted cancellation operations must not execute"),
          cancel: (cancellation) =>
            Effect.sync(() => {
              cancellationRequests.push(cancellation)
              return cancellation.toolName === "root_operation"
                ? ({
                    _tag: "AlreadyTerminal" as const,
                    outcome: { _tag: "Success" as const, result: "completed", encodedResult: "completed" },
                  } as const)
                : ({ _tag: "Cancelled" as const } as const)
            }),
        })
        const environment = Layer.merge(unusedModel, executor)
        const resolverLayer = ExecutableResolver.layerStatic([
          { executable: assistantRef, agent: Agent.close(assistant, environment) },
          { executable: researcherRef, agent: Agent.close(researcher, environment) },
        ]).pipe(Layer.orDie)

        yield* provideScoped(
          options
            .makeLayer({ addresses: [], scheduler: { pollInterval: "1 hour" } })
            .pipe(Layer.provide(resolverLayer)),
          Effect.gen(function* () {
            const runtime = yield* Runtime.Runtime
            const store = yield* RunStore.RunStore
            const host = yield* RunExecutor.RunExecutor
            const receipt = yield* runtime.start({
              executable: assistantRef,
              registrations: registrationsFor(assistantRef),
              sessionId: `session:tool-cancellation-tree:${options.name}`,
              idempotencyKey: `tool-cancellation-tree:${options.name}`,
              prompt: textPrompt("root"),
            })
            const rootClaim = yield* claim(receipt.runId, "tool-cancellation-tree-root")
            const rootExecution = yield* store.loadExecution(receipt.runId)
            const rootRequest = request(rootExecution.message.sessionId, "root_operation", "root-operation-call")
            const rootOperation = yield* store.recordOperation({
              ...rootClaim,
              operationKey: `${receipt.runId}:tool:root-operation-call:root_operation`,
              kind: "tool",
              inputDigest: "root-operation",
              input: { cancellation: cancellableOperation(rootRequest) },
              replayPolicy: "never",
              attempt: rootExecution.attempt,
            })
            yield* store.startOperation({ ...rootClaim, operationId: rootOperation.operationId })
            const blockedOperation = yield* store.recordOperation({
              ...rootClaim,
              operationKey: `${receipt.runId}:tool:blocked`,
              kind: "tool",
              inputDigest: "blocked",
              input: {},
              replayPolicy: "never",
              attempt: rootExecution.attempt,
            })
            const child = yield* runtime.spawn({
              parentRunId: receipt.runId,
              invocationId: "cancellation-child",
              selection: "researcher",
              prompt: textPrompt("child"),
              sessionId: `session:tool-cancellation-tree-child:${options.name}`,
              idempotencyKey: `tool-cancellation-tree-child:${options.name}`,
            })
            const childClaim = yield* claim(child.runId, "tool-cancellation-tree-child")
            const childExecution = yield* store.loadExecution(child.runId)
            const childRequest = request(childExecution.message.sessionId, "child_operation", "child-operation-call")
            const childOperation = yield* store.recordOperation({
              ...childClaim,
              operationKey: `${child.runId}:tool:child-operation-call:child_operation`,
              kind: "tool",
              inputDigest: "child-operation",
              input: { cancellation: cancellableOperation(childRequest) },
              replayPolicy: "never",
              attempt: childExecution.attempt,
            })
            yield* store.startOperation({ ...childClaim, operationId: childOperation.operationId })

            yield* runtime.cancel({ runId: receipt.runId, reason: "cancel tree" })
            expect((yield* runtime.inspect(receipt.runId)).status).toBe("cancelling")
            expect((yield* runtime.inspect(child.runId)).status).toBe("cancelling")
            expect(
              (yield* store.getOperation({ runId: receipt.runId, operationId: rootOperation.operationId })).status,
            ).toBe("cancelling")
            expect(
              (yield* store.getOperation({ runId: child.runId, operationId: childOperation.operationId })).status,
            ).toBe("cancelling")
            expect(
              (yield* store
                .recordOperation({
                  ...rootClaim,
                  operationKey: `${receipt.runId}:tool:post-cancel`,
                  kind: "tool",
                  inputDigest: "post-cancel",
                  input: {},
                  replayPolicy: "never",
                  attempt: rootExecution.attempt,
                })
                .pipe(Effect.flip))._tag,
            ).toBe("generalist/runtime/RuntimeUnavailable")
            expect(
              (yield* store
                .startOperation({ ...rootClaim, operationId: blockedOperation.operationId })
                .pipe(Effect.flip))._tag,
            ).toBe("generalist/runtime/RuntimeUnavailable")
            expect(cancellationRequests).toHaveLength(0)

            yield* store.releaseExecution(rootClaim)
            yield* store.releaseExecution(childClaim)
            yield* host
              .execute(yield* claim(child.runId, "tool-cancellation-tree-child-cancel"))
              .pipe(Effect.timeout("5 seconds"))
            expect((yield* runtime.inspect(child.runId)).status).toBe("cancelled")
            expect((yield* runtime.inspect(receipt.runId)).status).toBe("cancelling")
            yield* host
              .execute(yield* claim(receipt.runId, "tool-cancellation-tree-root-cancel"))
              .pipe(Effect.timeout("5 seconds"))

            expect((yield* runtime.inspect(receipt.runId)).status).toBe("cancelled")
            expect(
              (yield* store.getOperation({ runId: child.runId, operationId: childOperation.operationId })).status,
            ).toBe("cancelled")
            expect(
              (yield* store.getOperation({ runId: receipt.runId, operationId: rootOperation.operationId })).status,
            ).toBe("succeeded")
            expect(cancellationRequests.map(({ runId }) => runId)).toEqual([child.runId, receipt.runId])
            expect(cancellationRequests.every(({ rootRunId }) => rootRunId === receipt.runId)).toBe(true)
          }),
        )
      }),
    )
  })
}
