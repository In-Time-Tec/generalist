import { expect, it, layer } from "@effect/vitest"
import { Deferred, Effect, Fiber, Layer, Schema, Stream } from "effect"
import { LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
import { Agent, AgentRef, DurableDriver, ToolExecutor } from "@batonfx/core"
import { Address, AgentHost, Errors, Runtime, RunStore } from "../src/index.js"
import { assistantAddress, assistantRef, completedResult, memoryLayer } from "./helpers.js"
import { sqliteLayer, tempDbPath } from "./sqlite-helpers.js"

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
  yield* runtime.steer({ runId: receipt.runId, idempotencyKey: "steer:1", prompt: "first" })
  yield* runtime.steer({ runId: receipt.runId, idempotencyKey: "steer:1", prompt: "first" })
  yield* runtime.steer({ runId: receipt.runId, idempotencyKey: "steer:2", prompt: "second" })
  const conflict = yield* runtime
    .steer({ runId: receipt.runId, idempotencyKey: "steer:1", prompt: "changed" })
    .pipe(Effect.flip)
  expect(conflict).toBeInstanceOf(Errors.SteeringConflict)

  const claim = yield* store.claimExecution({ runId: receipt.runId, ownerId: "steering-test" })
  const firstRead = yield* store.readSteering(claim)
  const secondRead = yield* store.readSteering(claim)
  expect(firstRead.map((entry) => entry.entryId)).toEqual(secondRead.map((entry) => entry.entryId))
  expect(firstRead.map((entry) => JSON.stringify(entry.prompt))).toEqual([
    expect.stringContaining("first"),
    expect.stringContaining("second"),
  ])
  expect((yield* store.complete({ ...claim, result: completedResult("premature") }))._tag).toBe("SteeringPending")

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

  yield* store.recordOperation({
    ...claim,
    operationKey: "model:steering",
    kind: "model",
    inputDigest: "model:steering",
    input: { prompt: "steering" },
    replayPolicy: "provider-idempotent",
    attempt: claim.attemptFence,
    steeringEntryIds: firstRead.map((entry) => entry.entryId),
  })
  yield* store.recordOperation({
    ...claim,
    operationKey: "model:steering",
    kind: "model",
    inputDigest: "model:steering",
    input: { prompt: "steering" },
    replayPolicy: "provider-idempotent",
    attempt: claim.attemptFence,
    steeringEntryIds: firstRead.map((entry) => entry.entryId),
  })
  expect(yield* store.readSteering(claim)).toEqual([])
  expect((yield* store.complete({ ...claim, result: completedResult("done") }))._tag).toBe("Completed")
  const terminal = yield* runtime
    .steer({ runId: receipt.runId, idempotencyKey: "steer:terminal", prompt: "late" })
    .pipe(Effect.flip)
  expect(terminal).toBeInstanceOf(Errors.RunTerminal)
})

layer(memoryLayer)("Runtime durable steering memory contract", (test) => {
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
      yield* runtime.steer({ runId: receipt.runId, idempotencyKey: "steer:cancel", prompt: "still pending" })
      const claim = yield* store.claimExecution({ runId: receipt.runId, ownerId: "cancel-test" })
      expect(yield* store.readSteering(claim)).toHaveLength(1)

      yield* runtime.cancel({ runId: receipt.runId, reason: "stop" })
      yield* store.fail({ ...claim, error: { message: "execution interrupted" } })

      expect((yield* runtime.inspect(receipt.runId)).status).toBe("cancelled")
      const tags = (yield* runtime.history({ runId: receipt.runId, cursor: -1, limit: 100 })).map((event) => event._tag)
      expect(tags).toContain("RunCancellationRequested")
      expect(tags).toContain("RunCancelled")
      expect(tags).not.toContain("RunCompleted")
    }),
  )
})

it.live("persists accepted steering across a SQLite close and reopen", () => {
  const filename = tempDbPath("runtime-steering-reopen")
  let runId = ""
  const admit = Effect.gen(function* () {
    const runtime = yield* Runtime.Runtime
    const receipt = yield* admitRun
    runId = receipt.runId
    yield* runtime.steer({ runId, idempotencyKey: "steer:reopen", prompt: "survive restart" })
  }).pipe(Effect.provide(sqliteLayer(filename)), Effect.scoped)
  const reopen = Effect.gen(function* () {
    const store = yield* RunStore.RunStore
    const claim = yield* store.claimExecution({ runId, ownerId: "reopened" })
    const entries = yield* store.readSteering(claim)
    expect(entries).toHaveLength(1)
    expect(JSON.stringify(entries[0]?.prompt)).toContain("survive restart")
  }).pipe(Effect.provide(sqliteLayer(filename)), Effect.scoped)
  return admit.pipe(Effect.andThen(reopen))
})

it.live("atomically persists steering consumption and model scheduling before SQLite dispatch", () => {
  const filename = tempDbPath("runtime-steering-scheduled-reopen")
  const budget = {
    allocation: { modelCalls: 4, toolCalls: 4 },
    remaining: { modelCalls: 3, toolCalls: 4 },
    depth: 0,
  }
  const checkpoint = {
    driverVersion: "1",
    agent: assistantRef,
    turn: 0,
    budget,
    execution: {
      agent: assistantRef,
      driverVersion: "1",
      checkpointCodecVersion: "1",
      eventCodecVersion: "1",
      toolSchemaDigests: {},
      rootBudget: budget,
    },
    state: { phase: "model-scheduled" },
  } satisfies DurableDriver.DriverCheckpoint
  let runId = ""

  const schedule = Effect.gen(function* () {
    const runtime = yield* Runtime.Runtime
    const store = yield* RunStore.RunStore
    const receipt = yield* admitRun
    runId = receipt.runId
    yield* runtime.steer({ runId, idempotencyKey: "steer:scheduled", prompt: "consume atomically" })
    const claim = yield* store.claimExecution({ runId, ownerId: "before-crash" })
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
  }).pipe(Effect.provide(sqliteLayer(filename)), Effect.scoped)

  const reopen = Effect.gen(function* () {
    const store = yield* RunStore.RunStore
    const claim = yield* store.claimExecution({ runId, ownerId: "after-crash" })
    const operation = yield* store.getOperationByKey({ runId, operationKey: "model:scheduled-before-dispatch" })

    expect(yield* store.readSteering(claim)).toEqual([])
    expect(operation).toMatchObject({ kind: "model", status: "requested" })
    expect((yield* store.loadExecution(runId)).checkpoint).toEqual(checkpoint)
  }).pipe(Effect.provide(sqliteLayer(filename)), Effect.scoped)

  return schedule.pipe(Effect.andThen(reopen))
})

it.effect("AgentHost delivers durable steering in the next model operation", () => {
  const requests: Array<string> = []
  const agent = Agent.make({ name: "steered-host" })
  const ref = AgentRef.fromAgent(agent, "1")
  const address = Address.make("agent:steered-host")
  const model = Layer.effect(
    LanguageModel.LanguageModel,
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
  )
  const runtimeLayer = Runtime.layerMemory({
    agents: [{ ref, agent, services: model }],
    addresses: [{ address, agent: ref }],
  })
  return Effect.gen(function* () {
    const runtime = yield* Runtime.Runtime
    const store = yield* RunStore.RunStore
    const host = yield* AgentHost.AgentHost
    const receipt = yield* runtime.send({
      to: address,
      sessionId: "session:host-steering",
      idempotencyKey: "run:host-steering",
      prompt: "initial",
    })
    yield* runtime.steer({ runId: receipt.runId, idempotencyKey: "steer:host", prompt: "new direction" })
    const claim = yield* store.claimExecution({ runId: receipt.runId, ownerId: "memory" })
    yield* host.execute(claim)
    const inspection = yield* runtime.inspect(receipt.runId)
    if (inspection.status === "failed") {
      const history = yield* store.history({ runId: receipt.runId, cursor: -1, limit: 100 })
      const failure = history.find((event) => event._tag === "RunFailed")
      throw new Error(failure?._tag === "RunFailed" ? failure.error.message : "host failed")
    }
    expect(requests).toHaveLength(2)
    expect(requests[1]).toContain("new direction")
    expect(inspection.status).toBe("succeeded")
    expect(yield* store.readSteering(claim)).toEqual([])
    const history = yield* runtime.history({ runId: receipt.runId, cursor: -1, limit: 100 })
    const drained = history.filter((event) => event._tag === "SteeringDrained")
    const modelAttempts = history
      .map((event, index) => ({ event, index }))
      .filter(({ event }) => event._tag === "ModelAttemptStarted")
    expect(drained).toHaveLength(1)
    expect(history.findIndex((event) => event._tag === "SteeringDrained")).toBeLessThan(modelAttempts[1]!.index)
  }).pipe(Effect.provide(runtimeLayer), Effect.scoped)
})

it.effect("steering admitted during model streaming does not interrupt it and reaches the next turn", () =>
  Effect.gen(function* () {
    const started = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    let passedStreamingGate = false
    const requests: Array<string> = []
    const agent = Agent.make({ name: "streaming-steering" })
    const ref = AgentRef.fromAgent(agent, "1")
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
    const runtimeLayer = Runtime.layerMemory({
      agents: [{ ref, agent, services: model }],
      addresses: [{ address, agent: ref }],
    })

    yield* Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const host = yield* AgentHost.AgentHost
      const store = yield* RunStore.RunStore
      const receipt = yield* runtime.send({
        to: address,
        sessionId: "session:streaming-steering",
        idempotencyKey: "run:streaming-steering",
        prompt: "initial",
      })
      const claim = yield* store.claimExecution({ runId: receipt.runId, ownerId: "memory" })
      const fiber = yield* host.execute(claim).pipe(Effect.forkChild({ startImmediately: true }))
      yield* Deferred.await(started)

      yield* runtime.steer({ runId: receipt.runId, idempotencyKey: "steer:while-streaming", prompt: "redirect" })
      expect(requests).toHaveLength(1)
      expect(passedStreamingGate).toBe(false)

      yield* Deferred.succeed(release, undefined)
      expect((yield* Fiber.await(fiber))._tag).toBe("Success")
      expect(passedStreamingGate).toBe(true)
      expect(requests).toHaveLength(2)
      expect(requests[1]).toContain("redirect")
      expect((yield* runtime.inspect(receipt.runId)).status).toBe("succeeded")
    }).pipe(Effect.provide(runtimeLayer), Effect.scoped)
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
    const agent = Agent.make({ name: `tool-steering-${concurrency}`, toolkit, toolExecution: { concurrency } })
    const ref = AgentRef.fromAgent(agent, "1")
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
          const index = (request.call.params as { readonly index: number }).index
          yield* Deferred.succeed(started[index]!, undefined)
          yield* Deferred.await(releases[index]!)
          yield* Deferred.succeed(settled[index]!, undefined)
          return { _tag: "Success" as const, result: `result-${index}`, encodedResult: `result-${index}` }
        }),
    })
    const handlers = toolkit.toLayer({ batch_tool: () => Effect.die("ToolExecutor test layer owns execution") })
    const runtimeLayer = Runtime.layerMemory({
      agents: [{ ref, agent, services: Layer.mergeAll(model, executor, handlers) }],
      addresses: [{ address, agent: ref }],
    })

    yield* Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const host = yield* AgentHost.AgentHost
      const store = yield* RunStore.RunStore
      const receipt = yield* runtime.send({
        to: address,
        sessionId: `session:tool-steering-${concurrency}`,
        idempotencyKey: `run:tool-steering-${concurrency}`,
        prompt: "run the batch",
      })
      const claim = yield* store.claimExecution({ runId: receipt.runId, ownerId: "memory" })
      const fiber = yield* host.execute(claim).pipe(Effect.forkChild({ startImmediately: true }))
      yield* Deferred.await(started[0])
      if (concurrency === 2) yield* Deferred.await(started[1])

      yield* runtime.steer({
        runId: receipt.runId,
        idempotencyKey: `steer:during-tools-${concurrency}`,
        prompt: "after every tool",
      })
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
    }).pipe(Effect.provide(runtimeLayer), Effect.scoped)
  })

it.effect("steering admitted during sequential and concurrent tools drains after the whole batch", () =>
  Effect.forEach([1, 2] as const, verifyToolBatchSteering, { concurrency: 1, discard: true }),
)
