import { expect, it, layer } from "@effect/vitest"
import { provideScoped } from "./scoped-provide.js"
import { Deferred, Effect, Fiber, Layer, Schema, Stream } from "effect"
import { LanguageModel, Prompt, Response, Tool, Toolkit } from "effect/unstable/ai"
import { Agent, DurableDriver, ToolExecutor } from "@batonfx/core"
import { Database } from "bun:sqlite"
import { closedTestAgent, testExecutable } from "./identity.js"
import { Address, ExecutionHost, Errors, ExecutableResolver, Runtime, RunStore } from "../src/index.js"
import { assistant, assistantAddress, assistantRef, completedResult, memoryLayer, registrationsFor } from "./helpers.js"
import { sqliteLayer, tempDbPath } from "./sqlite-helpers.js"
const encodeJson = (value: unknown): string => Schema.encodeSync(Schema.UnknownFromJsonString)(value)

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
      options: { baton: { priority: 1, region: "local" } },
    }),
  ])
  const reordered = Prompt.fromMessages([
    Prompt.makeMessage("user", {
      content: [Prompt.makePart("text", { text: "first" })],
      options: { baton: { region: "local", priority: 1 } },
    }),
  ])
  const accepted = yield* runtime.steer({ runId: receipt.runId, idempotencyKey: "steer:1", prompt: first })
  const retry = yield* runtime.steer({ runId: receipt.runId, idempotencyKey: "steer:1", prompt: reordered })
  const sameText = yield* runtime.steer({ runId: receipt.runId, idempotencyKey: "steer:2", prompt: reordered })
  const second = yield* runtime.steer({ runId: receipt.runId, idempotencyKey: "steer:3", prompt: "second" })
  expect(retry).toEqual(accepted)
  expect(accepted.sequence).toBe(0)
  expect(sameText.sequence).toBe(1)
  expect(second.sequence).toBe(2)
  expect(new Set([accepted.entryId, sameText.entryId, second.entryId])).toHaveLength(3)
  const conflict = yield* runtime
    .steer({
      runId: receipt.runId,
      idempotencyKey: "steer:1",
      prompt: Prompt.fromMessages([
        Prompt.makeMessage("user", {
          content: [Prompt.makePart("text", { text: "first" })],
          options: { baton: { priority: 2, region: "local" } },
        }),
      ]),
    })
    .pipe(Effect.flip)
  expect(conflict).toBeInstanceOf(Errors.SteeringConflict)

  const claim = yield* store.claimExecution({ runId: receipt.runId, ownerId: "steering-test" })
  const firstRead = yield* store.readSteering(claim)
  const secondRead = yield* store.readSteering(claim)
  expect(firstRead.map((entry) => entry.entryId)).toEqual(secondRead.map((entry) => entry.entryId))
  expect(firstRead.map((entry) => JSON.stringify(entry.prompt))).toEqual([
    expect.stringContaining("first"),
    expect.stringContaining("first"),
    expect.stringContaining("second"),
  ])
  const acceptance = (yield* runtime.history({ runId: receipt.runId, cursor: -1, limit: 100 })).filter(
    (event) => event._tag === "SteeringAccepted",
  )
  expect(acceptance).toHaveLength(3)
  expect(acceptance.map((event) => event.entryId)).toEqual([accepted.entryId, sameText.entryId, second.entryId])
  expect(acceptance.map((event) => event.steeringSequence)).toEqual([0, 1, 2])
  expect(acceptance.map((event) => JSON.stringify(event.prompt))).toEqual([
    expect.stringContaining("first"),
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
  yield* store.recordOperation(operationInput)
  const divergentRetry = yield* store
    .recordOperation({ ...operationInput, steeringEntryIds: firstRead.slice(0, 2).map((entry) => entry.entryId) })
    .pipe(Effect.flip)
  expect(divergentRetry).toBeInstanceOf(Errors.RuntimeUnavailable)
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

for (const backend of ["memory", "sqlite"] as const) {
  const options = {
    resolver: ExecutableResolver.makeStatic([{ executable: assistantRef, agent: closedTestAgent(assistant) }]),
    addresses: [{ address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) }],
    scheduler: { pollInterval: "1 day" as const },
  }
  const runtimeLayer =
    backend === "memory"
      ? Runtime.layerMemory(options)
      : Runtime.layerSqlite({ ...options, filename: tempDbPath("steering-cancel-completion") })
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
          yield* runtime.steer({ runId: receipt.runId, idempotencyKey: "pending", prompt: "do not resume" })
          const claim = yield* store.claimExecution({ runId: receipt.runId, ownerId: "completion-race" })
          yield* runtime.cancel({ runId: receipt.runId, reason: "stop" })

          expect(yield* store.complete({ ...claim, result: completedResult("late") })).toEqual({ _tag: "Completed" })
          expect((yield* runtime.inspect(receipt.runId)).status).toBe("cancelled")
          expect((yield* store.loadExecution(receipt.runId)).continuation).toBeUndefined()
          const tags = (yield* runtime.history({ runId: receipt.runId, cursor: -1, limit: 100 })).map(
            (event) => event._tag,
          )
          expect(tags.filter((tag) => tag === "RunCancelled")).toHaveLength(1)
          expect(tags).not.toContain("RunCompleted")
        }),
      )
    },
  )
}

it.live("persists accepted steering across a SQLite close and reopen", () => {
  const filename = tempDbPath("runtime-steering-reopen")
  let runId = ""
  let steeringReceipt: { readonly entryId: string; readonly sequence: number } | undefined
  const admit = provideScoped(
    sqliteLayer(filename),
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const receipt = yield* admitRun
      runId = receipt.runId
      steeringReceipt = yield* runtime.steer({
        runId,
        idempotencyKey: "steer:reopen",
        prompt: "survive restart",
      })
    }),
  )
  const reopen = provideScoped(
    sqliteLayer(filename),
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      expect(yield* runtime.steer({ runId, idempotencyKey: "steer:reopen", prompt: "survive restart" })).toEqual(
        steeringReceipt,
      )
      const claim = yield* store.claimExecution({ runId, ownerId: "reopened" })
      const entries = yield* store.readSteering(claim)
      expect(entries).toHaveLength(1)
      expect(entries[0]).toMatchObject(steeringReceipt!)
      expect(encodeJson(entries[0]?.prompt)).toContain("survive restart")
      expect(
        (yield* runtime.history({ runId, cursor: -1, limit: 100 })).filter(
          (event) => event._tag === "SteeringAccepted",
        ),
      ).toHaveLength(1)
    }),
  )
  return admit.pipe(Effect.andThen(reopen))
})

for (const backend of ["memory", "sqlite"] as const) {
  const lifecycleLayer =
    backend === "memory" ? memoryLayer : sqliteLayer(tempDbPath(`steering-terminal-disposition-${backend}`))
  layer(lifecycleLayer)(`${backend} steering terminal disposition`, (test) => {
    test.effect("discards every unconsumed entry on completion, failure, and cancellation", () =>
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        const settle = (reason: "completed" | "failed" | "cancelled") =>
          Effect.gen(function* () {
            const run = yield* runtime.send({
              to: assistantAddress,
              sessionId: `session:steering-discard:${backend}:${reason}`,
              idempotencyKey: "run",
              prompt: "start",
            })
            const first = yield* runtime.steer({ runId: run.runId, idempotencyKey: "first", prompt: "one" })
            const second = yield* runtime.steer({ runId: run.runId, idempotencyKey: "second", prompt: "two" })
            if (reason === "cancelled") {
              yield* runtime.cancel({ runId: run.runId, reason: "caller stopped" })
            } else {
              const claim = yield* store.claimExecution({ runId: run.runId, ownerId: `discard-${reason}` })
              if (reason === "completed") {
                yield* store.complete({ ...claim, result: { _tag: "Program", value: "done" } })
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

it.live("rolls back every SQLite steering lifecycle boundary atomically", () => {
  const filename = tempDbPath("runtime-steering-atomic-boundaries")
  return provideScoped(
    sqliteLayer(filename),
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const database = new Database(filename)
      const run = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:steering-atomic-boundaries",
        idempotencyKey: "run",
        prompt: "start",
      })

      database.exec(`
        CREATE TRIGGER fail_steering_acceptance
        BEFORE INSERT ON baton_run_events
        WHEN NEW.event_json LIKE '%"_tag":"SteeringAccepted"%'
        BEGIN
          SELECT RAISE(ABORT, 'forced steering acceptance rollback');
        END
      `)
      expect(
        (yield* runtime.steer({ runId: run.runId, idempotencyKey: "atomic", prompt: "atomic" }).pipe(Effect.exit))._tag,
      ).toBe("Failure")
      database.exec("DROP TRIGGER fail_steering_acceptance")
      const steering = yield* runtime.steer({ runId: run.runId, idempotencyKey: "atomic", prompt: "atomic" })
      expect(steering.sequence).toBe(0)
      expect(
        (yield* runtime.history({ runId: run.runId, cursor: -1, limit: 100 })).filter(
          (event) => event._tag === "SteeringAccepted",
        ),
      ).toHaveLength(1)

      const claim = yield* store.claimExecution({ runId: run.runId, ownerId: "atomic" })
      const entries = yield* store.readSteering(claim)
      database.exec(`
        CREATE TRIGGER fail_steering_consumption
        BEFORE INSERT ON baton_run_events
        WHEN NEW.event_json LIKE '%"_tag":"SteeringConsumed"%'
        BEGIN
          SELECT RAISE(ABORT, 'forced steering consumption rollback');
        END
      `)
      const operationInput = {
        ...claim,
        operationKey: "model:atomic",
        kind: "model" as const,
        inputDigest: "model:atomic",
        input: { prompt: "atomic" },
        replayPolicy: "provider-idempotent" as const,
        attempt: claim.attemptFence,
        steeringEntryIds: entries.map((entry) => entry.entryId),
      }
      expect((yield* store.recordOperation(operationInput).pipe(Effect.exit))._tag).toBe("Failure")
      expect(yield* store.readSteering(claim)).toHaveLength(1)
      expect(yield* store.getOperationByKey({ runId: run.runId, operationKey: "model:atomic" })).toBeUndefined()
      database.exec("DROP TRIGGER fail_steering_consumption")
      yield* store.recordOperation(operationInput)
      expect(yield* store.readSteering(claim)).toEqual([])

      const terminalRun = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:steering-atomic-terminal",
        idempotencyKey: "run",
        prompt: "start",
      })
      const terminalSteering = yield* runtime.steer({
        runId: terminalRun.runId,
        idempotencyKey: "pending",
        prompt: "pending",
      })
      const terminalClaim = yield* store.claimExecution({ runId: terminalRun.runId, ownerId: "atomic-terminal" })
      database.exec(`
        CREATE TRIGGER fail_steering_terminal
        BEFORE INSERT ON baton_run_events
        WHEN NEW.event_json LIKE '%"_tag":"RunCompleted"%'
        BEGIN
          SELECT RAISE(ABORT, 'forced steering terminal rollback');
        END
      `)
      expect(
        (yield* store.complete({ ...terminalClaim, result: { _tag: "Program", value: "done" } }).pipe(Effect.exit))
          ._tag,
      ).toBe("Failure")
      expect(yield* store.readSteering(terminalClaim)).toHaveLength(1)
      expect(
        (yield* runtime.history({ runId: terminalRun.runId, cursor: -1, limit: 100 })).some(
          (event) => event._tag === "SteeringDiscarded",
        ),
      ).toBe(false)
      database.exec("DROP TRIGGER fail_steering_terminal")
      yield* store.complete({ ...terminalClaim, result: { _tag: "Program", value: "done" } })
      const discarded = (yield* runtime.history({ runId: terminalRun.runId, cursor: -1, limit: 100 })).filter(
        (event) => event._tag === "SteeringDiscarded",
      )
      expect(discarded).toEqual([
        expect.objectContaining({ entryIds: [terminalSteering.entryId], reason: "completed" }),
      ])
      database.close()
    }),
  )
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
    executable: assistantRef.ref,
    turn: 0,
    budget,
    state: { phase: "model-scheduled" },
  } satisfies DurableDriver.DriverCheckpoint
  let runId = ""

  const schedule = provideScoped(
    sqliteLayer(filename),
    Effect.gen(function* () {
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
    }),
  )

  const reopen = provideScoped(
    sqliteLayer(filename),
    Effect.gen(function* () {
      const store = yield* RunStore.RunStore
      const claim = yield* store.claimExecution({ runId, ownerId: "after-crash" })
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
  const runtimeLayer = Runtime.layerMemory({
    resolver: ExecutableResolver.makeStatic([{ executable: ref, agent: Agent.close(agent, model) }]),
    addresses: [{ address, executable: ref, registrations: registrationsFor(ref) }],
  })
  layer(runtimeLayer)("ExecutionHost delivers durable steering in the next model operation", (test) => {
    test.effect("ExecutionHost delivers durable steering in the next model operation", () =>
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        const host = yield* ExecutionHost.ExecutionHost
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
    const runtimeLayer = Runtime.layerMemory({
      resolver: ExecutableResolver.makeStatic([{ executable: ref, agent: Agent.close(agent, model) }]),
      addresses: [{ address, executable: ref, registrations: registrationsFor(ref) }],
    })

    yield* provideScoped(
      runtimeLayer,
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const host = yield* ExecutionHost.ExecutionHost
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
          const index = (request.call.params as { readonly index: number }).index
          yield* Deferred.succeed(started[index]!, undefined)
          yield* Deferred.await(releases[index]!)
          yield* Deferred.succeed(settled[index]!, undefined)
          return { _tag: "Success" as const, result: `result-${index}`, encodedResult: `result-${index}` }
        }),
    })
    const handlers = toolkit.toLayer({ batch_tool: () => Effect.die("ToolExecutor test layer owns execution") })
    const runtimeLayer = Runtime.layerMemory({
      resolver: ExecutableResolver.makeStatic([
        { executable: ref, agent: Agent.close(agent, Layer.mergeAll(model, executor, handlers)) },
      ]),
      addresses: [{ address, executable: ref, registrations: registrationsFor(ref) }],
    })

    yield* provideScoped(
      runtimeLayer,
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const host = yield* ExecutionHost.ExecutionHost
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
      }),
    )
  })

it.effect("steering admitted during sequential and concurrent tools drains after the whole batch", () =>
  Effect.forEach([1, 2] as const, verifyToolBatchSteering, { concurrency: 1, discard: true }),
)
