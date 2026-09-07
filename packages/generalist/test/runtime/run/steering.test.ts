import { makeObjectStorage, objectRuntimeLayer, objectWorkerId } from "../execution/object.js"
import { expect, it, layer } from "@effect/vitest"
import { provideScoped } from "../execution/scoped-provide.js"
import { Deferred, Effect, Fiber, Layer, Schema, Stream } from "effect"
import { LanguageModel, Prompt, Response, Tool, Toolkit } from "effect/unstable/ai"
import { Agent, DurableDriver, Steering, ToolExecutor } from "../../../src/index.js"
import { closedTestAgent, testExecutable } from "./identity.js"
import { DurabilityFailure } from "../../../src/durability/errors.js"
import { Address, RunExecutor, Errors, ExecutableResolver, Runtime, RunStore } from "../../../src/runtime/index.js"
import {
  assistant,
  assistantAddress,
  assistantRef,
  completedResult,
  objectLayer,
  registrationsFor,
  resolverLayer,
} from "../execution/fixtures.js"
import { allowAllAuthorization } from "../../authorization.js"
const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))

const steer = (runtime: Runtime.Service, runId: string, idempotencyKey: string, prompt: Prompt.Prompt | string) =>
  runtime.send(runId, prompt, { idempotencyKey })

const admitRun = Effect.gen(function* () {
  const runtime = yield* Runtime.Runtime
  return yield* runtime.send({
    to: assistantAddress,
    sessionId: "session:steering",
    idempotencyKey: "run:1",
    prompt: "start",
  })
})

const finish = Response.makePart("finish", {
  reason: "stop",
  usage: Response.Usage.make({
    inputTokens: { total: 1, uncached: 1, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 1, text: 1, reasoning: undefined },
  }),
  response: undefined,
})

const verifyInbox = Effect.gen(function* () {
  const runtime = yield* Runtime.Runtime
  const store = yield* RunStore.RunStore
  const receipt = yield* admitRun
  const first = Prompt.fromMessages([
    Prompt.makeMessage("user", {
      content: [Prompt.makePart("text", { text: "first" })],
      options: { generalist: { priority: 1, region: "local" } },
    }),
  ])
  const reordered = Prompt.fromMessages([
    Prompt.makeMessage("user", {
      content: [Prompt.makePart("text", { text: "first" })],
      options: { generalist: { region: "local", priority: 1 } },
    }),
  ])
  const accepted = yield* steer(runtime, receipt.runId, "steer:1", first)
  const retry = yield* steer(runtime, receipt.runId, "steer:1", reordered)
  const sameText = yield* steer(runtime, receipt.runId, "steer:2", reordered)
  const second = yield* steer(runtime, receipt.runId, "steer:3", "second")
  expect(retry).toEqual(accepted)
  expect(accepted.sequence).toBe(0)
  expect(sameText.sequence).toBe(1)
  expect(second.sequence).toBe(2)
  expect(new Set([accepted.entryId, sameText.entryId, second.entryId])).toHaveLength(3)
  const conflict = yield* runtime
    .send(
      receipt.runId,
      Prompt.fromMessages([
        Prompt.makeMessage("user", {
          content: [Prompt.makePart("text", { text: "first" })],
          options: { generalist: { priority: 2, region: "local" } },
        }),
      ]),
      { idempotencyKey: "steer:1" },
    )
    .pipe(Effect.flip)
  expect(conflict).toBeInstanceOf(DurabilityFailure)
  expect(conflict).toMatchObject({ reason: "input-conflict" })

  const claim = yield* store.claimExecution({
    commandId: "runtime-run-steering-test-ts-claim-1",
    runId: receipt.runId,
    ownerId: objectWorkerId,
  })
  const firstRead = yield* store.readSteering(claim)
  const secondRead = yield* store.readSteering(claim)
  expect(firstRead.map((entry) => entry.entryId)).toEqual(secondRead.map((entry) => entry.entryId))
  expect(firstRead.map((entry) => JSON.stringify(entry.prompt))).toEqual([
    expect.stringContaining("first"),
    expect.stringContaining("first"),
    expect.stringContaining("second"),
  ])
  const acceptance = (yield* runtime.history({ runId: receipt.runId, cursor: -1, limit: 100 })).filter(
    (event) => event._tag === "Inbox",
  )
  expect(acceptance).toHaveLength(3)
  expect(acceptance.map((event) => event.entryId)).toEqual([accepted.entryId, sameText.entryId, second.entryId])
  expect(acceptance.map((event) => event.inboxSequence)).toEqual([0, 1, 2])
  expect(acceptance.map((event) => JSON.stringify(event.message))).toEqual([
    expect.stringContaining("first"),
    expect.stringContaining("first"),
    expect.stringContaining("second"),
  ])
  expect(
    (yield* store.complete({
      commandId: "runtime-run-steering-test-ts-complete-1",
      ...claim,
      result: completedResult("premature"),
    }))._tag,
  ).toBe("SteeringPending")

  const invalidConsumption = yield* store
    .recordOperation({
      ...claim,
      operationKey: "model:invalid-steering",
      kind: "model",
      inputDigest: "model:invalid-steering",
      input: { prompt: "steering" },
      replayPolicy: "provider-idempotent",
      attempt: claim.attemptFence,
      steeringEntryIds: ["missing-steering-entry"],
    })
    .pipe(Effect.flip)
  expect(invalidConsumption).toBeInstanceOf(Errors.RuntimeUnavailable)

  const operationInput = {
    ...claim,
    operationKey: "model:steering",
    kind: "model",
    inputDigest: "model:steering",
    input: { prompt: "steering" },
    replayPolicy: "provider-idempotent",
    attempt: claim.attemptFence,
    steeringEntryIds: firstRead.map((entry) => entry.entryId),
  } as const
  const skippedMiddle = yield* store
    .recordOperation({
      ...operationInput,
      operationKey: "model:skipped-middle",
      steeringEntryIds: [firstRead[0]!.entryId, firstRead[2]!.entryId],
    })
    .pipe(Effect.flip)
  expect(skippedMiddle).toBeInstanceOf(Errors.RuntimeUnavailable)

  const operation = yield* store.recordOperation(operationInput)
  const operationRetry = yield* store.recordOperation(operationInput)
  expect(operationRetry).toEqual(operation)
  const divergentRetry = yield* store
    .recordOperation({ ...operationInput, steeringEntryIds: firstRead.slice(0, 2).map((entry) => entry.entryId) })
    .pipe(Effect.flip)
  expect(divergentRetry).toBeInstanceOf(DurabilityFailure)
  expect(divergentRetry).toMatchObject({
    reason: "input-conflict",
  })
  expect(yield* store.readSteering(claim)).toEqual([])
  const consumed = (yield* runtime.history({ runId: receipt.runId, cursor: -1, limit: 100 })).filter(
    (event) => event._tag === "SteeringConsumed",
  )
  expect(consumed).toEqual([
    expect.objectContaining({
      entryIds: firstRead.map((entry) => entry.entryId),
      operationId: operation.operationId,
    }),
  ])
  expect(
    (yield* store.complete({
      commandId: "runtime-run-steering-test-ts-complete-2",
      ...claim,
      result: completedResult("done"),
    }))._tag,
  ).toBe("Completed")
  const terminal = yield* steer(runtime, receipt.runId, "steer:terminal", "late").pipe(Effect.flip)
  expect(terminal).toBeInstanceOf(Errors.RunTerminal)
})

layer(objectLayer)("Runtime durable steering object contract", (test) => {
  test.effect("is FIFO, idempotent, non-destructive, and completion-safe", () => verifyInbox)

  test.effect("cancellation wins while steering is pending", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const receipt = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:steering-cancel",
        idempotencyKey: "run:steering-cancel",
        prompt: "start",
      })
      yield* steer(runtime, receipt.runId, "steer:cancel", "still pending")
      const claim = yield* store.claimExecution({
        commandId: "runtime-run-steering-test-ts-claim-2",
        runId: receipt.runId,
        ownerId: objectWorkerId,
      })
      expect(yield* store.readSteering(claim)).toHaveLength(1)

      yield* runtime.cancel({
        commandId: "runtime-run-steering-test-ts-cancel-3",
        runId: receipt.runId,
        reason: "stop",
      })
      yield* store.fail({
        ...claim,
        error: Errors.AgentExecutionFailure.make({ message: "execution interrupted" }),
      })

      expect((yield* runtime.inspect(receipt.runId)).status).toBe("cancelled")
      const tags = (yield* runtime.history({ runId: receipt.runId, cursor: -1, limit: 100 })).map((event) => event._tag)
      expect(tags).toContain("RunCancellationRequested")
      expect(tags).toContain("RunCancelled")
      expect(tags).not.toContain("RunCompleted")
    }),
  )
})

const backend = "object" as const
{
  const options = {
    addresses: [{ address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) }],
    scheduler: { pollInterval: "1 day" as const },
  }
  const baseLayer = objectRuntimeLayer(options)
  const runtimeLayer = baseLayer.pipe(
    Layer.provide(
      ExecutableResolver.layerStatic([{ executable: assistantRef, agent: closedTestAgent(assistant) }]).pipe(
        Layer.orDie,
      ),
    ),
  )
  layer(runtimeLayer, { excludeTestServices: true })(
    `${backend} completion cannot resurrect cancellation through pending steering`,
    (test) => {
      test.effect(`${backend} completion cannot resurrect cancellation through pending steering`, () =>
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const store = yield* RunStore.RunStore
          const receipt = yield* runtime.send({
            to: assistantAddress,
            sessionId: `steering-cancel-completion:${backend}`,
            idempotencyKey: "run",
            prompt: "start",
          })
          yield* steer(runtime, receipt.runId, "pending", "do not resume")
          const claim = yield* store.claimExecution({
            commandId: "runtime-run-steering-test-ts-claim-3",
            runId: receipt.runId,
            ownerId: objectWorkerId,
          })
          yield* runtime.cancel({
            commandId: "runtime-run-steering-test-ts-cancel-4",
            runId: receipt.runId,
            reason: "stop",
          })

          expect(
            yield* store.complete({
              commandId: "runtime-run-steering-test-ts-complete-5",
              ...claim,
              result: completedResult("late"),
            }),
          ).toEqual({ _tag: "Completed" })
          expect((yield* runtime.inspect(receipt.runId)).status).toBe("cancelled")
          expect((yield* store.loadExecution(receipt.runId)).continuation).toBeUndefined()
          const tags = (yield* runtime.history({ runId: receipt.runId, cursor: -1, limit: 100 })).map(
            (event) => event._tag,
          )
          expect(tags.filter((tag) => tag === "RunCancelled")).toHaveLength(1)
          expect(tags).not.toContain("RunCompleted")
        }),
      )

      test.effect(`${backend} bounds direct steering without charging idempotent retries twice`, () =>
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const store = yield* RunStore.RunStore
          const receipt = yield* runtime.send({
            to: assistantAddress,
            sessionId: `steering-bounds:${backend}`,
            idempotencyKey: "run",
            prompt: "start",
          })
          const accepted = yield* Effect.forEach(
            Array.from({ length: Steering.defaultCapacity }, (_, index) => index),
            (index) => steer(runtime, receipt.runId, `entry:${index}`, `prompt ${index}`),
            { concurrency: "unbounded" },
          )
          expect(
            yield* steer(
              runtime,
              receipt.runId,
              `entry:${Steering.defaultCapacity - 1}`,
              `prompt ${Steering.defaultCapacity - 1}`,
            ),
          ).toEqual(accepted.at(-1))
          const full = yield* steer(runtime, receipt.runId, "entry:full", "not admitted").pipe(Effect.flip)
          expect(full).toBeInstanceOf(Steering.InboxFull)
          expect(full).toMatchObject({
            runId: receipt.runId,
            queue: "steering",
            dimension: "entries",
            limit: Steering.defaultCapacity,
          })
          const claim = yield* store.claimExecution({
            commandId: "runtime-run-steering-test-ts-claim-4",
            runId: receipt.runId,
            ownerId: objectWorkerId,
          })
          expect(yield* store.readSteering(claim)).toHaveLength(Steering.defaultCapacity)

          const byteRun = yield* runtime.send({
            to: assistantAddress,
            sessionId: `steering-byte-bound:${backend}`,
            idempotencyKey: "run",
            prompt: "start",
          })
          const byteFull = yield* steer(
            runtime,
            byteRun.runId,
            "too-large",
            "x".repeat(Steering.defaultMaxPendingBytes),
          ).pipe(Effect.flip)
          expect(byteFull).toBeInstanceOf(Steering.InboxFull)
          expect(byteFull).toMatchObject({
            runId: byteRun.runId,
            queue: "steering",
            dimension: "bytes",
            limit: Steering.defaultMaxPendingBytes,
          })
          const byteClaim = yield* store.claimExecution({
            commandId: "runtime-run-steering-test-ts-claim-5",
            runId: byteRun.runId,
            ownerId: objectWorkerId,
          })
          expect(yield* store.readSteering(byteClaim)).toEqual([])
        }),
      )
    },
  )
}

it.live("persists accepted steering across an object-host close and reopen", () => {
  const storage = makeObjectStorage()
  const options = {
    addresses: [{ address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) }],
    scheduler: { pollInterval: "1 day" as const },
  }
  let runId = ""
  let steeringReceipt: { readonly entryId: string; readonly sequence: number } | undefined
  const admit = provideScoped(
    objectRuntimeLayer(options, storage).pipe(Layer.provide(resolverLayer)),
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const receipt = yield* admitRun
      runId = receipt.runId
      steeringReceipt = yield* steer(runtime, runId, "steer:reopen", "survive restart")
    }),
  )
  const reopen = provideScoped(
    objectRuntimeLayer(options, storage).pipe(Layer.provide(resolverLayer)),
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      expect(yield* steer(runtime, runId, "steer:reopen", "survive restart")).toEqual(steeringReceipt)
      const claim = yield* store.claimExecution({
        commandId: "runtime-run-steering-test-ts-claim-6",
        runId,
        ownerId: objectWorkerId,
      })
      const entries = yield* store.readSteering(claim)
      expect(entries).toHaveLength(1)
      expect(entries[0]).toMatchObject(steeringReceipt!)
      expect(encodeJson(entries[0]?.prompt)).toContain("survive restart")
      expect(
        (yield* runtime.history({ runId, cursor: -1, limit: 100 })).filter((event) => event._tag === "Inbox"),
      ).toHaveLength(1)
    }),
  )
  return admit.pipe(Effect.andThen(reopen))
})

const lifecycleBackend = "object" as const
{
  const lifecycleLayer = objectLayer
  layer(lifecycleLayer)(`${lifecycleBackend} steering terminal disposition`, (test) => {
    test.effect("discards every unconsumed entry on completion, failure, and cancellation", () =>
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        const settle = (reason: "completed" | "failed" | "cancelled") =>
          Effect.gen(function* () {
            const run = yield* runtime.send({
              to: assistantAddress,
              sessionId: `session:steering-discard:${lifecycleBackend}:${reason}`,
              idempotencyKey: "run",
              prompt: "start",
            })
            const first = yield* steer(runtime, run.runId, "first", "one")
            const second = yield* steer(runtime, run.runId, "second", "two")
            if (reason === "cancelled") {
              yield* runtime.cancel({
                commandId: `runtime-run-steering-test-ts-cancel-6-${reason}`,
                runId: run.runId,
                reason: "caller stopped",
              })
            } else {
              const claim = yield* store.claimExecution({
                commandId: `runtime-run-steering-test-ts-claim-7-${reason}`,
                runId: run.runId,
                ownerId: objectWorkerId,
              })
              if (reason === "completed") {
                yield* store.complete({
                  commandId: `runtime-run-steering-test-ts-complete-7-${reason}`,
                  ...claim,
                  result: { _tag: "Program", value: "done" },
                })
              } else {
                yield* store.fail({
                  ...claim,
                  error: Errors.AgentExecutionFailure.make({ message: "failed" }),
                })
              }
            }
            const history = yield* runtime.history({ runId: run.runId, cursor: -1, limit: 100 })
            const discardedIndex = history.findIndex((event) => event._tag === "SteeringDiscarded")
            const terminalIndex = history.findIndex(
              (event) => event._tag === "RunCompleted" || event._tag === "RunFailed" || event._tag === "RunCancelled",
            )
            expect(discardedIndex).toBeGreaterThan(-1)
            expect(discardedIndex).toBeLessThan(terminalIndex)
            expect(history[discardedIndex]).toMatchObject({
              _tag: "SteeringDiscarded",
              entryIds: [first.entryId, second.entryId],
              reason,
            })
          })
        yield* Effect.forEach(["completed", "failed", "cancelled"] as const, settle, { discard: true })
      }),
    )
  })
}

it.live("atomically persists steering consumption and model scheduling before object dispatch", () => {
  const storage = makeObjectStorage()
  const options = {
    addresses: [{ address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) }],
    scheduler: { pollInterval: "1 day" as const },
  }
  const budget = {
    allocation: { tokens: 4, toolCalls: 4 },
    remaining: { tokens: 3, toolCalls: 4 },
  }
  const checkpoint = {
    driverVersion: "1",
    executable: assistantRef.ref,
    turn: 0,
    budget,
    state: { phase: "model-scheduled" },
  } satisfies DurableDriver.DriverCheckpoint
  let runId = ""
  const schedule = provideScoped(
    objectRuntimeLayer(options, storage).pipe(Layer.provide(resolverLayer)),
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const receipt = yield* admitRun
      runId = receipt.runId
      yield* steer(runtime, runId, "steer:scheduled", "consume atomically")
      const claim = yield* store.claimExecution({
        commandId: "runtime-run-steering-test-ts-claim-10",
        runId,
        ownerId: objectWorkerId,
      })
      const entries = yield* store.readSteering(claim)
      yield* store.recordOperation({
        ...claim,
        operationKey: "model:scheduled-before-dispatch",
        kind: "model",
        inputDigest: "model:scheduled-before-dispatch",
        input: { prompt: "next model request" },
        replayPolicy: "provider-idempotent",
        attempt: claim.attempt,
        checkpoint,
        steeringEntryIds: entries.map((entry) => entry.entryId),
      })
    }),
  )
  const reopen = provideScoped(
    objectRuntimeLayer(options, storage).pipe(Layer.provide(resolverLayer)),
    Effect.gen(function* () {
      const store = yield* RunStore.RunStore
      const claim = yield* store.claimExecution({
        commandId: "runtime-run-steering-test-ts-claim-11",
        runId,
        ownerId: objectWorkerId,
      })
      const operation = yield* store.getOperationByKey({ runId, operationKey: "model:scheduled-before-dispatch" })
      expect(yield* store.readSteering(claim)).toEqual([])
      expect(operation).toMatchObject({ kind: "model", status: "requested" })
      expect((yield* store.loadExecution(runId)).checkpoint).toEqual(checkpoint)
    }),
  )
  return schedule.pipe(Effect.andThen(reopen))
})

{
  const requests: Array<string> = []
  let serviceAcquisitions = 0
  const agent = Agent.make({ name: "steered-host" })
  const ref = testExecutable(agent, "1")
  const address = Address.make("agent:steered-host")
  const model = Layer.effect(
    LanguageModel.LanguageModel,
    Effect.sync(() => {
      serviceAcquisitions += 1
    }).pipe(
      Effect.andThen(
        LanguageModel.make({
          generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
          streamText: (request) => {
            requests.push(JSON.stringify(request.prompt))
            return Stream.fromIterable<Response.StreamPartEncoded>([
              Response.makePart("text-delta", { id: `text:${requests.length}`, delta: `answer ${requests.length}` }),
              finish,
            ])
          },
        }),
      ),
    ),
  )
  const runtimeLayer = objectRuntimeLayer({
    addresses: [{ address, executable: ref, registrations: registrationsFor(ref) }],
  }).pipe(
    Layer.provide(
      ExecutableResolver.layerStatic([
        { executable: ref, agent: Agent.close(agent, Layer.mergeAll(allowAllAuthorization, model)) },
      ]).pipe(Layer.orDie),
    ),
  )
  layer(runtimeLayer)("RunExecutor delivers durable steering in the next model operation", (test) => {
    test.effect("RunExecutor delivers durable steering in the next model operation", () =>
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        const host = yield* RunExecutor.RunExecutor
        const receipt = yield* runtime.send({
          to: address,
          sessionId: "session:host-steering",
          idempotencyKey: "run:host-steering",
          prompt: "initial",
        })
        yield* steer(runtime, receipt.runId, "steer:host", "new direction")
        const claim = yield* store.claimExecution({
          commandId: "runtime-run-steering-test-ts-claim-12",
          runId: receipt.runId,
          ownerId: objectWorkerId,
        })
        yield* host.execute(claim)
        const inspection = yield* runtime.inspect(receipt.runId)
        if (inspection.status === "failed") {
          const history = yield* store.history({ runId: receipt.runId, cursor: -1, limit: 100 })
          const failure = history.find((event) => event._tag === "RunFailed")
          throw new Error(failure?._tag === "RunFailed" ? failure.error.message : "host failed")
        }
        expect(requests).toHaveLength(2)
        expect(serviceAcquisitions).toBe(1)
        expect(requests[1]).toContain("new direction")
        expect(inspection.status).toBe("succeeded")
        expect((yield* store.loadExecution(receipt.runId)).ownerId).toBeUndefined()
        const history = yield* runtime.history({ runId: receipt.runId, cursor: -1, limit: 100 })
        const drained = history.filter((event) => event._tag === "SteeringDrained")
        const modelAttempts = history
          .map((event, index) => ({ event, index }))
          .filter(({ event }) => event._tag === "ModelAttemptStarted")
        expect(drained).toHaveLength(1)
        expect(history.findIndex((event) => event._tag === "SteeringDrained")).toBeLessThan(modelAttempts[1]!.index)
      }),
    )
  })
}

it.effect("steering admitted during model streaming does not interrupt it and reaches the next turn", () =>
  Effect.gen(function* () {
    const started = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    let passedStreamingGate = false
    const requests: Array<string> = []
    const agent = Agent.make({ name: "streaming-steering" })
    const ref = testExecutable(agent, "1")
    const address = Address.make("agent:streaming-steering")
    const model = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
        streamText: (request) => {
          requests.push(JSON.stringify(request.prompt))
          if (requests.length > 1) {
            return Stream.fromIterable<Response.StreamPartEncoded>([
              Response.makePart("text-delta", { id: "second", delta: "redirected" }),
              finish,
            ])
          }
          return Stream.fromEffect(Deferred.succeed(started, undefined)).pipe(
            Stream.drain,
            Stream.concat(Stream.fromEffect(Deferred.await(release)).pipe(Stream.drain)),
            Stream.concat(
              Stream.sync(() => {
                passedStreamingGate = true
                return Response.makePart("text-delta", { id: "first", delta: "original" })
              }),
            ),
            Stream.concat(Stream.make(finish)),
          )
        },
      }),
    )
    const runtimeLayer = objectRuntimeLayer({
      addresses: [{ address, executable: ref, registrations: registrationsFor(ref) }],
    }).pipe(
      Layer.provide(
        ExecutableResolver.layerStatic([
          { executable: ref, agent: Agent.close(agent, Layer.mergeAll(allowAllAuthorization, model)) },
        ]).pipe(Layer.orDie),
      ),
    )

    yield* provideScoped(
      runtimeLayer,
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const host = yield* RunExecutor.RunExecutor
        const store = yield* RunStore.RunStore
        const receipt = yield* runtime.send({
          to: address,
          sessionId: "session:streaming-steering",
          idempotencyKey: "run:streaming-steering",
          prompt: "initial",
        })
        const claim = yield* store.claimExecution({
          commandId: "runtime-run-steering-test-ts-claim-13",
          runId: receipt.runId,
          ownerId: objectWorkerId,
        })
        const fiber = yield* host.execute(claim).pipe(Effect.forkChild({ startImmediately: true }))
        yield* Deferred.await(started)

        yield* steer(runtime, receipt.runId, "steer:while-streaming", "redirect")
        expect(requests).toHaveLength(1)
        expect(passedStreamingGate).toBe(false)

        yield* Deferred.succeed(release, undefined)
        expect((yield* Fiber.await(fiber))._tag).toBe("Success")
        expect(passedStreamingGate).toBe(true)
        expect(requests).toHaveLength(2)
        expect(requests[1]).toContain("redirect")
        expect((yield* runtime.inspect(receipt.runId)).status).toBe("succeeded")
      }),
    )
  }),
)

const verifyToolBatchSteering = (concurrency: 1 | 2) =>
  Effect.gen(function* () {
    const started = [yield* Deferred.make<void>(), yield* Deferred.make<void>()] as const
    const releases = [yield* Deferred.make<void>(), yield* Deferred.make<void>()] as const
    const settled = [yield* Deferred.make<void>(), yield* Deferred.make<void>()] as const
    const tool = Tool.make("batch_tool", {
      parameters: Schema.Struct({ index: Schema.Finite }),
      success: Schema.String,
    })
    const toolkit = Toolkit.make(tool)
    const requests: Array<string> = []
    const agent = Agent.make({
      name: `tool-steering-${concurrency}`,
      toolkit,
      toolScheduling: { maxConcurrency: concurrency, parallelSafe: ["batch_tool"] },
    })
    const ref = testExecutable(agent, "1")
    const address = Address.make(`agent:tool-steering-${concurrency}`)
    const model = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
        streamText: (request) => {
          requests.push(JSON.stringify(request.prompt))
          return Stream.fromIterable<Response.StreamPartEncoded>(
            requests.length === 1
              ? [
                  Response.makePart("tool-call", {
                    id: "batch-0",
                    name: "batch_tool",
                    params: { index: 0 },
                    providerExecuted: false,
                  }),
                  Response.makePart("tool-call", {
                    id: "batch-1",
                    name: "batch_tool",
                    params: { index: 1 },
                    providerExecuted: false,
                  }),
                  finish,
                ]
              : [Response.makePart("text-delta", { id: "done", delta: "done" }), finish],
          )
        },
      }),
    )
    const executor = ToolExecutor.layerTest({
      execute: (request) =>
        Effect.gen(function* () {
          const { index } = yield* Schema.decodeUnknownEffect(Schema.Struct({ index: Schema.Int }))(
            request.call.params,
          ).pipe(Effect.orDie)
          yield* Deferred.succeed(started[index]!, undefined)
          yield* Deferred.await(releases[index]!)
          yield* Deferred.succeed(settled[index]!, undefined)
          return { _tag: "Success" as const, result: `result-${index}`, encodedResult: `result-${index}` }
        }),
    })
    const handlers = toolkit.toLayer({ batch_tool: () => Effect.die("ToolExecutor test layer owns execution") })
    const runtimeLayer = objectRuntimeLayer({
      addresses: [{ address, executable: ref, registrations: registrationsFor(ref) }],
    }).pipe(
      Layer.provide(
        ExecutableResolver.layerStatic([
          {
            executable: ref,
            agent: Agent.close(agent, Layer.mergeAll(allowAllAuthorization, model, executor, handlers)),
          },
        ]).pipe(Layer.orDie),
      ),
    )

    yield* provideScoped(
      runtimeLayer,
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const host = yield* RunExecutor.RunExecutor
        const store = yield* RunStore.RunStore
        const receipt = yield* runtime.send({
          to: address,
          sessionId: `session:tool-steering-${concurrency}`,
          idempotencyKey: `run:tool-steering-${concurrency}`,
          prompt: "run the batch",
        })
        const claim = yield* store.claimExecution({
          commandId: "runtime-run-steering-test-ts-claim-14",
          runId: receipt.runId,
          ownerId: objectWorkerId,
        })
        const fiber = yield* host.execute(claim).pipe(Effect.forkChild({ startImmediately: true }))
        yield* Deferred.await(started[0])
        if (concurrency === 2) yield* Deferred.await(started[1])

        yield* steer(runtime, receipt.runId, `steer:during-tools-${concurrency}`, "after every tool")
        yield* Deferred.succeed(releases[0], undefined)
        yield* Deferred.await(settled[0])
        if (concurrency === 1) yield* Deferred.await(started[1])

        expect(requests).toHaveLength(1)
        expect(yield* store.readSteering(claim)).toHaveLength(1)
        expect(
          (yield* runtime.history({ runId: receipt.runId, cursor: -1, limit: 100 })).some(
            (event) => event._tag === "SteeringDrained",
          ),
        ).toBe(false)

        yield* Deferred.succeed(releases[1], undefined)
        expect((yield* Fiber.await(fiber))._tag).toBe("Success")
        expect(requests).toHaveLength(2)
        expect(requests[1]).toContain("after every tool")
        expect(requests[1]).toContain("result-0")
        expect(requests[1]).toContain("result-1")

        const history = yield* runtime.history({ runId: receipt.runId, cursor: -1, limit: 100 })
        const drainedIndex = history.findIndex((event) => event._tag === "SteeringDrained")
        const toolResultIndexes = history
          .map((event, index) => ({ event, index }))
          .filter(({ event }) => event._tag === "ToolExecutionCompleted")
          .map(({ index }) => index)
        expect(toolResultIndexes).toHaveLength(2)
        expect(toolResultIndexes.every((index) => index < drainedIndex)).toBe(true)
        expect((yield* runtime.inspect(receipt.runId)).status).toBe("succeeded")
      }),
    )
  })

it.effect("steering admitted during sequential and concurrent tools drains after the whole batch", () =>
  Effect.forEach([1, 2] as const, verifyToolBatchSteering, { concurrency: 1, discard: true }),
)
