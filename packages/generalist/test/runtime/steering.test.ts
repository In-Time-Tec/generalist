import { expect, it, layer } from "@effect/vitest"
import { Deferred, Effect, Fiber, Layer, Ref, Schema, Stream } from "effect"
import { LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
import { Agent, Hooks, ToolExecutor } from "../../src/index.js"
import {
  Address,
  Errors,
  ExecutableResolver,
  Messaging,
  RunExecutor,
  Runtime,
  RunStore,
  Steering,
} from "../../src/runtime/index.js"
import type { Service as ActiveExecutionsService } from "../../src/runtime/execution/active-executions.js"
import { make as makeSteeringAdmission } from "../../src/runtime/run/steering.js"
import { allowAllAuthorization } from "../authorization.js"
import { assistantAddress, completedResult, memoryLayer, registrationsFor } from "./execution/fixtures.js"
import { provideScoped } from "./execution/scoped-provide.js"
import { testExecutable } from "./run/identity.js"
import { messagingBackend, messagingLayer } from "./messaging/scenario.js"
import { sqliteManualClaimLayer, tempDbPath } from "./sql/scenario.js"

const finish = Response.makePart("finish", {
  reason: "stop",
  usage: Response.Usage.make({
    inputTokens: { total: 1, uncached: 1, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 1, text: 1, reasoning: undefined },
  }),
  response: undefined,
})

const toolPolicy = (policy: "steer" | "enqueue") =>
  Effect.gen(function* () {
    const started = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    const requests: Array<string> = []
    const tool = Tool.make("controlled_tool", { parameters: Schema.Struct({}), success: Schema.String })
    const toolkit = Toolkit.make(tool)
    const agent = Agent.make({ name: `${policy}-admission`, toolkit })
    const executable = testExecutable(agent, "1")
    const address = Address.make(`agent:${policy}-admission`)
    const model = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
        streamText: (request) => {
          requests.push(JSON.stringify(request.prompt))
          if (requests.length === 1) {
            return Stream.fromIterable<Response.StreamPartEncoded>([
              Response.makePart("tool-call", {
                id: "controlled-1",
                name: "controlled_tool",
                params: {},
                providerExecuted: false,
              }),
              finish,
            ])
          }
          return Stream.fromIterable<Response.StreamPartEncoded>([
            Response.makePart("text-delta", { id: `text-${requests.length}`, delta: "done" }),
            finish,
          ])
        },
      }),
    )
    const executor = ToolExecutor.layerTest({
      execute: () =>
        Effect.gen(function* () {
          yield* Deferred.succeed(started, undefined)
          yield* Deferred.await(release)
          return { _tag: "Success" as const, result: "tool result", encodedResult: "tool result" }
        }),
    })
    const hooks = Hooks.layer([
      Hooks.onSteer(({ queue, count }) => Effect.succeed(Hooks.AddContext(`${queue}:${count}:hooked admission`))),
    ])
    const handlers = toolkit.toLayer({ controlled_tool: () => Effect.die("ToolExecutor owns controlled_tool") })
    const runtimeLayer = Runtime.layerMemory({
      addresses: [{ address, executable, registrations: registrationsFor(executable) }],
    }).pipe(
      Layer.provide(
        ExecutableResolver.layerStatic([
          {
            executable,
            agent: Agent.close(agent, Layer.mergeAll(allowAllAuthorization, model, executor, handlers, hooks)),
          },
        ]).pipe(Layer.orDie),
      ),
    )

    yield* provideScoped(
      runtimeLayer,
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        const host = yield* RunExecutor.RunExecutor
        const run = yield* runtime.send({
          to: address,
          sessionId: `session:${policy}-admission`,
          idempotencyKey: "run",
          prompt: "start",
        })
        const execution = yield* host
          .execute(yield* store.claimExecution({ runId: run.runId, ownerId: policy }))
          .pipe(Effect.forkChild({ startImmediately: true }))
        const start = yield* Effect.raceFirst(
          Deferred.await(started).pipe(Effect.as("started" as const)),
          Fiber.await(execution).pipe(Effect.map((exit) => ({ exit }))),
        )
        if (start !== "started") {
          return yield* Effect.die(`execution exited before tool dispatch: ${String(start.exit)}`)
        }

        yield* runtime.send(run.runId, `${policy} message`, { policy, idempotencyKey: policy })
        yield* Deferred.succeed(release, undefined)
        yield* Fiber.join(execution)

        const deliveredAt = requests.findIndex((request) => request.includes(`${policy} message`))
        expect(deliveredAt).toBe(policy === "steer" ? 1 : 2)
        expect(requests[deliveredAt]).toContain(`${policy === "enqueue" ? "followUp" : "steering"}:1:hooked admission`)
        const history = yield* runtime.history({ runId: run.runId, limit: 100 })
        const inbox = history.find((event) => event._tag === "Inbox")
        expect(inbox).toMatchObject({ _tag: "Inbox", policy })
        const drained = history.find((event) => event._tag === "SteeringDrained" && event.queue === "followUp")
        expect(drained === undefined).toBe(policy === "steer")
      }),
    )
  })

it.effect("steer waits for current tool results and enters the next safe model boundary", () => toolPolicy("steer"))

it.effect("enqueue waits until the Run would otherwise finish its current work", () => toolPolicy("enqueue"))

it.effect("interrupt journals first, stops an in-flight tool, and creates an Unknown obligation", () =>
  Effect.gen(function* () {
    const started = yield* Deferred.make<void>()
    const tool = Tool.make("external_write", { parameters: Schema.Struct({}), success: Schema.String })
    const toolkit = Toolkit.make(tool)
    const agent = Agent.make({ name: "interrupt-admission", toolkit })
    const executable = testExecutable(agent, "1")
    const address = Address.make("agent:interrupt-admission")
    const model = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
        streamText: () =>
          Stream.fromIterable<Response.StreamPartEncoded>([
            Response.makePart("tool-call", {
              id: "external-write-1",
              name: "external_write",
              params: {},
              providerExecuted: false,
            }),
            finish,
          ]),
      }),
    )
    const executor = ToolExecutor.layerTest({
      execute: () => Deferred.succeed(started, undefined).pipe(Effect.andThen(Effect.never)),
    })
    const handlers = toolkit.toLayer({ external_write: () => Effect.die("ToolExecutor owns external_write") })
    const runtimeLayer = Runtime.layerMemory({
      addresses: [{ address, executable, registrations: registrationsFor(executable) }],
    }).pipe(
      Layer.provide(
        ExecutableResolver.layerStatic([
          {
            executable,
            agent: Agent.close(agent, Layer.mergeAll(allowAllAuthorization, model, executor, handlers)),
          },
        ]).pipe(Layer.orDie),
      ),
    )

    yield* provideScoped(
      runtimeLayer,
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        const host = yield* RunExecutor.RunExecutor
        const run = yield* runtime.send({
          to: address,
          sessionId: "session:interrupt-admission",
          idempotencyKey: "run",
          prompt: "write",
        })
        const execution = yield* host
          .execute(yield* store.claimExecution({ runId: run.runId, ownerId: "interrupt" }))
          .pipe(Effect.forkChild({ startImmediately: true }))
        yield* Deferred.await(started)

        const receipt = yield* runtime.send(run.runId, "stop and reconsider", {
          policy: "interrupt",
          idempotencyKey: "interrupt",
        })
        yield* Fiber.join(execution)

        expect((yield* runtime.inspect(run.runId)).status).toBe("needs-resolution")
        const obligations = yield* runtime.operator.scanObligations().pipe(Stream.runCollect)
        const obligation = obligations.find((entry) => entry.runId === run.runId)
        expect(obligation?.decision._tag).toBe("Unknown")
        const history = yield* runtime.history({ runId: run.runId, limit: 100 })
        const inboxIndex = history.findIndex((event) => event._tag === "Inbox" && event.entryId === receipt.entryId)
        const unknownIndex = history.findIndex((event) => event._tag === "OperationUnknown")
        expect(inboxIndex).toBeGreaterThan(-1)
        expect(unknownIndex).toBeGreaterThan(inboxIndex)
        expect((yield* store.pendingSteering({ runId: run.runId, limit: 10 })).map((entry) => entry.entryId)).toEqual([
          receipt.entryId,
        ])
      }),
    )
  }),
)

it.effect("reject fails with RunBusy during active work and journals nothing", () =>
  Effect.gen(function* () {
    const started = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    const agent = Agent.make({ name: "reject-admission" })
    const executable = testExecutable(agent, "1")
    const address = Address.make("agent:reject-admission")
    const model = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
        streamText: () =>
          Stream.fromEffect(Deferred.succeed(started, undefined)).pipe(
            Stream.drain,
            Stream.concat(Stream.fromEffect(Deferred.await(release)).pipe(Stream.drain)),
            Stream.concat(Stream.make(Response.makePart("text-delta", { id: "done", delta: "done" }), finish)),
          ),
      }),
    )
    const runtimeLayer = Runtime.layerMemory({
      addresses: [{ address, executable, registrations: registrationsFor(executable) }],
    }).pipe(
      Layer.provide(
        ExecutableResolver.layerStatic([
          { executable, agent: Agent.close(agent, Layer.mergeAll(allowAllAuthorization, model)) },
        ]).pipe(Layer.orDie),
      ),
    )

    yield* provideScoped(
      runtimeLayer,
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        const host = yield* RunExecutor.RunExecutor
        const run = yield* runtime.send({
          to: address,
          sessionId: "session:reject-admission",
          idempotencyKey: "run",
          prompt: "start",
        })
        const execution = yield* host
          .execute(yield* store.claimExecution({ runId: run.runId, ownerId: "reject" }))
          .pipe(Effect.forkChild({ startImmediately: true }))
        yield* Deferred.await(started)

        const error = yield* runtime
          .send(run.runId, "do not queue", { policy: "reject", idempotencyKey: "reject" })
          .pipe(Effect.flip)
        expect(error).toBeInstanceOf(Errors.RunBusy)
        expect(
          (yield* runtime.history({ runId: run.runId, limit: 100 })).filter((event) => event._tag === "Inbox"),
        ).toEqual([])

        yield* Deferred.succeed(release, undefined)
        yield* Fiber.join(execution)
      }),
    )
  }),
)

const completionLaneSelection = Effect.gen(function* () {
  const runtime = yield* Runtime.Runtime
  const store = yield* RunStore.RunStore
  const run = yield* runtime.send({
    to: assistantAddress,
    sessionId: "session:mixed-completion-lanes",
    idempotencyKey: "run",
    prompt: "start",
  })
  const claim = yield* store.claimExecution({ runId: run.runId, ownerId: "mixed-completion-lanes" })
  const steering = yield* runtime.send(run.runId, "steer later", {
    policy: "steer",
    idempotencyKey: "steer",
  })
  const enqueue = yield* runtime.send(run.runId, "enqueue first", {
    policy: "enqueue",
    idempotencyKey: "enqueue",
  })

  const first = yield* store.complete({ ...claim, result: completedResult("first") })
  expect(first).toMatchObject({
    _tag: "SteeringPending",
    continuation: { steeringEntryIds: [enqueue.entryId] },
  })
  yield* store.recordOperation({
    ...claim,
    operationKey: "model:enqueue",
    kind: "model",
    inputDigest: "model:enqueue",
    input: {},
    replayPolicy: "provider-idempotent",
    attempt: claim.attemptFence,
    steeringEntryIds: [enqueue.entryId],
  })
  const second = yield* store.complete({ ...claim, result: completedResult("second") })
  expect(second).toMatchObject({
    _tag: "SteeringPending",
    continuation: { steeringEntryIds: [steering.entryId] },
  })
})

layer(memoryLayer)("memory completion admission lanes", (test) => {
  test.effect("continues one admission lane at a time with enqueue first", () => completionLaneSelection)
})

layer(sqliteManualClaimLayer(tempDbPath("steering-mixed-completion-lanes")))(
  "SQLite completion admission lanes",
  (test) => {
    test.effect("continues one admission lane at a time with enqueue first", () => completionLaneSelection)
  },
)

it.effect("completion continuations retain their lane and pass through onSteer", () =>
  Effect.gen(function* () {
    let modelPrompt = ""
    const agent = Agent.make({ name: "completion-hook" })
    const executable = testExecutable(agent, "1")
    const address = Address.make("agent:completion-hook")
    const model = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
        streamText: (request) => {
          modelPrompt = JSON.stringify(request.prompt)
          return Stream.fromIterable<Response.StreamPartEncoded>([
            Response.makePart("text-delta", { id: "done", delta: "done" }),
            finish,
          ])
        },
      }),
    )
    const hooks = Hooks.layer([
      Hooks.onSteer(({ queue, count }) => Effect.succeed(Hooks.AddContext(`${queue}:${count}:completion hook`))),
    ])
    const runtimeLayer = Runtime.layerMemory({
      addresses: [{ address, executable, registrations: registrationsFor(executable) }],
    }).pipe(
      Layer.provide(
        ExecutableResolver.layerStatic([
          { executable, agent: Agent.close(agent, Layer.mergeAll(allowAllAuthorization, model, hooks)) },
        ]).pipe(Layer.orDie),
      ),
    )

    yield* provideScoped(
      runtimeLayer,
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        const host = yield* RunExecutor.RunExecutor
        const run = yield* runtime.send({
          to: address,
          sessionId: "session:completion-hook",
          idempotencyKey: "run",
          prompt: "start",
        })
        const claim = yield* store.claimExecution({ runId: run.runId, ownerId: "completion-hook" })
        const receipt = yield* runtime.send(run.runId, "queued continuation", {
          policy: "enqueue",
          idempotencyKey: "queued",
        })
        const outcome = yield* store.complete({ ...claim, result: completedResult("first") })
        expect(outcome).toMatchObject({
          _tag: "SteeringPending",
          continuation: { queue: "followUp", steeringEntryIds: [receipt.entryId] },
        })

        yield* host.execute(claim)

        expect(modelPrompt).toContain("queued continuation")
        expect(modelPrompt).toContain("followUp:1:completion hook")
      }),
    )
  }),
)

layer(memoryLayer)("rollback admission", (test) => {
  test.effect("rewinds to the previous TurnCompleted event before admitting exactly once", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const run = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:rollback-admission",
        idempotencyKey: "run",
        prompt: "start",
      })
      const claim = yield* store.claimExecution({ runId: run.runId, ownerId: "rollback" })
      yield* store.emitAgentEvent({ ...claim, event: { _tag: "TurnStarted", turn: 0 } })
      yield* store.emitAgentEvent({ ...claim, event: { _tag: "TurnCompleted", turn: 0 } })
      yield* store.emitAgentEvent({ ...claim, event: { _tag: "TurnStarted", turn: 1 } })
      yield* store.releaseExecution(claim)

      const [receipt, retry] = yield* Effect.all(
        [
          runtime.send(run.runId, "replace turn one", {
            policy: "rollback",
            idempotencyKey: "rollback",
          }),
          runtime.send(run.runId, "replace turn one", {
            policy: "rollback",
            idempotencyKey: "rollback",
          }),
        ],
        { concurrency: "unbounded" },
      )

      expect(retry).toEqual(receipt)
      expect((yield* runtime.inspect(run.runId)).branches).toHaveLength(1)
      const history = yield* runtime.history({ runId: run.runId, limit: 100 })
      expect(history.filter((event) => event._tag === "TurnCompleted")).toHaveLength(1)
      expect(history.filter((event) => event._tag === "TurnStarted" && event.turn === 1)).toEqual([])
      expect(history.filter((event) => event._tag === "Inbox")).toEqual([
        expect.objectContaining({ entryId: receipt.entryId, policy: "rollback" }),
      ])
    }),
  )
})

it.effect("rollback fences an active tool before the replacement turn runs", () =>
  Effect.gen(function* () {
    const started = yield* Deferred.make<void>()
    const requests: Array<string> = []
    const tool = Tool.make("rollback_write", { parameters: Schema.Struct({}), success: Schema.String })
    const toolkit = Toolkit.make(tool)
    const agent = Agent.make({ name: "rollback-active", toolkit })
    const executable = testExecutable(agent, "1")
    const address = Address.make("agent:rollback-active")
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
                    id: "rollback-write-1",
                    name: "rollback_write",
                    params: {},
                    providerExecuted: false,
                  }),
                  finish,
                ]
              : [Response.makePart("text-delta", { id: "replacement", delta: "replaced" }), finish],
          )
        },
      }),
    )
    const executor = ToolExecutor.layerTest({
      execute: () => Deferred.succeed(started, undefined).pipe(Effect.andThen(Effect.never)),
    })
    const hooks = Hooks.layer([
      Hooks.onSteer(({ queue, count }) => Effect.succeed(Hooks.AddContext(`${queue}:${count}:rollback hook`))),
    ])
    const handlers = toolkit.toLayer({ rollback_write: () => Effect.die("ToolExecutor owns rollback_write") })
    const runtimeLayer = Runtime.layerMemory({
      addresses: [{ address, executable, registrations: registrationsFor(executable) }],
    }).pipe(
      Layer.provide(
        ExecutableResolver.layerStatic([
          {
            executable,
            agent: Agent.close(agent, Layer.mergeAll(allowAllAuthorization, model, executor, handlers, hooks)),
          },
        ]).pipe(Layer.orDie),
      ),
    )

    yield* provideScoped(
      runtimeLayer,
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        const host = yield* RunExecutor.RunExecutor
        const run = yield* runtime.send({
          to: address,
          sessionId: "session:rollback-active",
          idempotencyKey: "run",
          prompt: "write",
        })
        const first = yield* host
          .execute(yield* store.claimExecution({ runId: run.runId, ownerId: "rollback-first" }))
          .pipe(Effect.forkChild({ startImmediately: true }))
        yield* Deferred.await(started)

        const receipt = yield* runtime.send(run.runId, "replace the active turn", {
          policy: "rollback",
          idempotencyKey: "rollback-active",
        })
        yield* Fiber.join(first)

        yield* host.execute(yield* store.claimExecution({ runId: run.runId, ownerId: "rollback-replacement" }))

        expect(requests).toHaveLength(2)
        expect(requests[1]).toContain("replace the active turn")
        expect(requests[1]).toContain("steering:1:rollback hook")
        expect((yield* runtime.inspect(run.runId)).status).toBe("succeeded")
        const history = yield* runtime.history({ runId: run.runId, limit: 100 })
        expect(history.filter((event) => event._tag === "Inbox")).toEqual([
          expect.objectContaining({ entryId: receipt.entryId, policy: "rollback" }),
        ])
        expect(history.filter((event) => event._tag === "OperationUnknown")).toEqual([])
        expect((yield* runtime.inspect(run.runId)).branches).toHaveLength(1)
      }),
    )
  }),
)

layer(memoryLayer)("admission retry side effects", (test) => {
  test.effect("interrupts at most once for exact interrupt and rollback retries", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const interrupts = yield* Ref.make(0)
      const active: ActiveExecutionsService = {
        run: (_runId, execution, afterExit = Effect.void) => execution.pipe(Effect.ignore, Effect.andThen(afterExit)),
        interrupt: () => Ref.update(interrupts, (count) => count + 1),
        interruptAndAwait: () => Ref.update(interrupts, (count) => count + 1),
        active: Effect.succeed(new Set()),
      }
      const admit = yield* makeSteeringAdmission({ store, active, policy: Messaging.Policy.make() })
      const run = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:retry-side-effects",
        idempotencyKey: "run",
        prompt: "start",
      })

      const firstInterrupt = yield* admit(run.runId, "interrupt once", {
        policy: "interrupt",
        idempotencyKey: "interrupt-once",
      })
      const retryInterrupt = yield* admit(run.runId, "interrupt once", {
        policy: "interrupt",
        idempotencyKey: "interrupt-once",
      })
      expect(firstInterrupt.duplicate).toBe(false)
      expect(retryInterrupt).toEqual({ ...firstInterrupt, duplicate: true })
      expect(yield* Ref.get(interrupts)).toBe(1)

      const firstRollback = yield* admit(run.runId, "rollback once", {
        policy: "rollback",
        idempotencyKey: "rollback-once",
      })
      const retryRollback = yield* admit(run.runId, "rollback once", {
        policy: "rollback",
        idempotencyKey: "rollback-once",
      })
      expect(firstRollback.duplicate).toBe(false)
      expect(retryRollback).toEqual({ ...firstRollback, duplicate: true })
      expect(yield* Ref.get(interrupts)).toBe(2)
      expect((yield* runtime.inspect(run.runId)).branches).toHaveLength(1)
    }),
  )
})

it.effect("a sibling may send directly while an unrelated Run fails with NotInFamily", () => {
  const { provide, familyFor, strangerFor } = messagingBackend({ name: "steering-family", layer: messagingLayer })
  return Effect.gen(function* () {
    const { runtime, first, second } = yield* familyFor("session:steering-family")
    const stranger = yield* strangerFor("session:steering-stranger")

    yield* runtime.send(second.runId, "hello sibling", {
      from: { runId: first.runId },
      idempotencyKey: "sibling",
    })
    const error = yield* runtime
      .send(stranger.runId, "hello stranger", {
        from: { runId: first.runId },
        idempotencyKey: "stranger",
      })
      .pipe(Effect.flip)

    expect(error).toBeInstanceOf(Errors.NotInFamily)
    expect(
      (yield* runtime.history({ runId: second.runId, limit: 100 })).filter((event) => event._tag === "Inbox"),
    ).toHaveLength(1)
    expect(
      (yield* runtime.history({ runId: stranger.runId, limit: 100 })).filter((event) => event._tag === "Inbox"),
    ).toEqual([])
  }).pipe(provide())
})

it.effect("maps process-local admission policies onto the existing RunHandle lanes", () =>
  Effect.gen(function* () {
    const run = yield* Agent.allocateRun(Agent.make({ name: "local-admission" }), { prompt: "start" })

    expect(yield* Agent.send(run, "steer locally", "steer")).toMatchObject({ queue: "steering", sequence: 0 })
    expect(yield* Agent.send(run, "enqueue locally", "enqueue")).toMatchObject({ queue: "followUp", sequence: 0 })
    expect(yield* Agent.send(run, "reject while idle", "reject")).toMatchObject({ queue: "steering", sequence: 1 })
    const rollback = yield* Agent.send(run, "cannot rewind", "rollback").pipe(Effect.flip)
    expect(rollback._tag).toBe("generalist/core/RollbackRequiresRuntime")
  }),
)

it.effect("interrupts a process-local tool while reject leaves its inbox unchanged", () =>
  Effect.gen(function* () {
    const started = yield* Deferred.make<void>()
    const interrupted = yield* Deferred.make<void>()
    const requests: Array<string> = []
    const tool = Tool.make("local_write", { parameters: Schema.Struct({}), success: Schema.String })
    const toolkit = Toolkit.make(tool)
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
                    id: "local-write-1",
                    name: "local_write",
                    params: {},
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
      execute: () =>
        Deferred.succeed(started, undefined).pipe(
          Effect.andThen(Effect.never),
          Effect.onInterrupt(() => Deferred.succeed(interrupted, undefined)),
        ),
    })
    const handlers = toolkit.toLayer({ local_write: () => Effect.die("ToolExecutor owns local_write") })
    const agent = Agent.make({ name: "local-interrupt", toolkit })
    const run = yield* Agent.allocateRun(agent, { prompt: "write" })
    const context = yield* Layer.build(Layer.mergeAll(allowAllAuthorization, model, executor, handlers))
    const execution = yield* Stream.runCollect(run.events).pipe(
      Effect.provideContext(context),
      Effect.forkChild({ startImmediately: true }),
    )
    const start = yield* Effect.raceFirst(
      Deferred.await(started).pipe(Effect.as("started" as const)),
      Fiber.await(execution).pipe(Effect.map((exit) => ({ exit }))),
    )
    if (start !== "started")
      return yield* Effect.die(`local execution exited before tool dispatch: ${String(start.exit)}`)

    const busy = yield* Agent.send(run, "reject this", "reject").pipe(Effect.flip)
    expect(busy._tag).toBe("generalist/core/RunBusy")
    yield* Agent.send(run, "stop writing", "interrupt")
    const events = yield* Fiber.join(execution).pipe(Effect.timeout("1 second"))

    yield* Deferred.await(interrupted).pipe(Effect.timeout("1 second"))
    expect(events.some((event) => event._tag === "Completed")).toBe(true)
    expect(requests).toHaveLength(2)
    expect(requests[1]).toContain("stop writing")
    expect(requests[1]).toContain("interrupted")
    expect(requests[1]).not.toContain("reject this")
  }),
)

it("exports the three model-callable steering tools", () => {
  expect(Object.keys(Steering.toolkit().tools).toSorted()).toEqual(["list_inbox", "send_to_child", "send_to_parent"])
})
