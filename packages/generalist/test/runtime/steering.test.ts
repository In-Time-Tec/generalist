import { objectRuntimeLayer, objectWorkerId } from "./execution/object.js"
import { expect, it, layer } from "@effect/vitest"
import { Deferred, Effect, Fiber, Layer, Ref, Schema, Stream } from "effect"
import { LanguageModel, Prompt, Response, Tool, Toolkit } from "effect/unstable/ai"
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
import { assistantAddress, assistantRef, completedResult, objectLayer, registrationsFor } from "./execution/fixtures.js"
import { provideScoped } from "./execution/scoped-provide.js"
import { testExecutable } from "./run/identity.js"
import { messagingBackend, messagingLayer } from "./messaging/scenario.js"

const finish = Response.makePart("finish", {
  reason: "stop",
  usage: Response.Usage.make({
    inputTokens: { total: 1, uncached: 1, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 1, text: 1, reasoning: undefined },
  }),
  response: undefined,
})

const toolPolicy = (policy: "steer" | "session") =>
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
      Hooks.onSteer({
        key: "test.runtime.steering.onSteer.1",
        version: "1",
        replayPolicy: "never",
        hook: ({ queue, count }) => Effect.succeed(Hooks.AddContext(`${queue}:${count}:hooked admission`)),
      }),
    ])
    const handlers = toolkit.toLayer({ controlled_tool: () => Effect.die("ToolExecutor owns controlled_tool") })
    const runtimeLayer = objectRuntimeLayer({
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
        yield* store.createHostSession({ id: `session:${policy}-admission` })
        const run = yield* runtime.send({
          to: address,
          sessionId: `session:${policy}-admission`,
          idempotencyKey: "run",
          prompt: "start",
        })
        const execution = yield* host
          .execute(
            yield* store.claimExecution({
              commandId: "runtime-steering-test-ts-claim-1",
              runId: run.runId,
              ownerId: objectWorkerId,
            }),
          )
          .pipe(Effect.forkChild({ startImmediately: true }))
        const start = yield* Effect.raceFirst(
          Deferred.await(started).pipe(Effect.as("started" as const)),
          Fiber.await(execution).pipe(Effect.map((exit) => ({ exit }))),
        )
        if (start !== "started") {
          return yield* Effect.die(`execution exited before tool dispatch: ${String(start.exit)}`)
        }

        if (policy === "steer") {
          yield* runtime.send(run.runId, "steer message", { policy, idempotencyKey: policy })
        } else {
          yield* store.submitSessionInput({
            sessionId: `session:${policy}-admission`,
            commandId: "next-input",
            prompt: Prompt.make("session message"),
            selection: {
              executableRef: executable.ref,
              executableManifest: executable.manifest,
              registrations: registrationsFor(executable),
            },
          })
          expect((yield* store.hostSession(`session:${policy}-admission`)).queue).toHaveLength(1)
        }
        yield* Deferred.succeed(release, undefined)
        yield* Fiber.join(execution)

        if (policy === "session") {
          expect(requests.some((request) => request.includes("session message"))).toBe(false)
          const next = (yield* store.hostSession("session:session-admission")).activeRunId!
          expect(next).not.toBe(run.runId)
          yield* host.execute(
            yield* store.claimExecution({ runId: next, ownerId: objectWorkerId, commandId: "next-claim" }),
          )
        }

        const deliveredAt = requests.findIndex((request) => request.includes(`${policy} message`))
        expect(deliveredAt).toBe(policy === "steer" ? 1 : 2)
        if (policy === "steer") expect(requests[deliveredAt]).toContain("steering:1:hooked admission")
        else expect(requests[deliveredAt]).not.toContain("followUp:1:hooked admission")
        const history = yield* runtime.history({ runId: run.runId, limit: 100 })
        const inbox = history.find((event) => event._tag === "Inbox")
        if (policy === "steer") expect(inbox).toMatchObject({ _tag: "Inbox", policy })
        else expect(inbox).toBeUndefined()
        const drained = history.find((event) => event._tag === "SteeringDrained" && event.queue === "followUp")
        expect(drained).toBeUndefined()
      }),
    )
  })

it.effect("steer waits for current tool results and enters the next safe model boundary", () => toolPolicy("steer"))

it.effect("Session input waits for the current tool and starts a separate Run after completion", () =>
  toolPolicy("session"),
)

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
    const runtimeLayer = objectRuntimeLayer({
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
          .execute(
            yield* store.claimExecution({
              commandId: "runtime-steering-test-ts-claim-2",
              runId: run.runId,
              ownerId: objectWorkerId,
            }),
          )
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
    const runtimeLayer = objectRuntimeLayer({
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
          .execute(
            yield* store.claimExecution({
              commandId: "runtime-steering-test-ts-claim-3",
              runId: run.runId,
              ownerId: objectWorkerId,
            }),
          )
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
  yield* store.createHostSession({ id: "session:mixed-completion-lanes" })
  const run = yield* runtime.send({
    to: assistantAddress,
    sessionId: "session:mixed-completion-lanes",
    idempotencyKey: "run",
    prompt: "start",
  })
  const claim = yield* store.claimExecution({
    commandId: "runtime-steering-test-ts-claim-4",
    runId: run.runId,
    ownerId: objectWorkerId,
  })
  const steering = yield* runtime.send(run.runId, "steer later", {
    policy: "steer",
    idempotencyKey: "steer",
  })
  const pending = yield* store.submitSessionInput({
    sessionId: "session:mixed-completion-lanes",
    commandId: "next-session-input",
    prompt: Prompt.make("next Run"),
    selection: {
      executableRef: assistantRef.ref,
      executableManifest: assistantRef.manifest,
      registrations: registrationsFor(assistantRef),
    },
  })

  const first = yield* store.complete({
    commandId: "runtime-steering-test-ts-complete-1",
    ...claim,
    result: completedResult("first"),
  })
  expect(first).toMatchObject({
    _tag: "SteeringPending",
    continuation: { steeringEntryIds: [steering.entryId] },
  })
  expect((yield* store.hostSession("session:mixed-completion-lanes")).queue).toMatchObject([{ id: pending.id }])
  expect(yield* store.hostSessionRuns("session:mixed-completion-lanes")).toHaveLength(1)
  yield* store.recordOperation({
    ...claim,
    operationKey: "model:steering",
    kind: "model",
    inputDigest: "model:steering",
    input: {},
    replayPolicy: "provider-idempotent",
    attempt: claim.attemptFence,
    steeringEntryIds: [steering.entryId],
  })
  const second = yield* store.complete({
    commandId: "runtime-steering-test-ts-complete-2",
    ...claim,
    result: completedResult("second"),
  })
  expect(second._tag).toBe("Completed")
  const session = yield* store.hostSession("session:mixed-completion-lanes")
  expect(session.queue).toEqual([])
  expect(session.activeRunId).toBeDefined()
  expect(session.activeRunId).not.toBe(run.runId)
  expect(yield* store.hostSessionRuns("session:mixed-completion-lanes")).toHaveLength(2)
})

layer(objectLayer)("object completion admission lanes", (test) => {
  test.effect("consumes exact-Run steering before promoting the next Session input", () => completionLaneSelection)
})

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
      Hooks.onSteer({
        key: "test.runtime.steering.onSteer.2",
        version: "1",
        replayPolicy: "never",
        hook: ({ queue, count }) => Effect.succeed(Hooks.AddContext(`${queue}:${count}:completion hook`)),
      }),
    ])
    const runtimeLayer = objectRuntimeLayer({
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
        const claim = yield* store.claimExecution({
          commandId: "runtime-steering-test-ts-claim-5",
          runId: run.runId,
          ownerId: objectWorkerId,
        })
        const receipt = yield* runtime.send(run.runId, "queued continuation", {
          policy: "steer",
          idempotencyKey: "queued",
        })
        const outcome = yield* store.complete({
          commandId: "runtime-steering-test-ts-complete-3",
          ...claim,
          result: completedResult("first"),
        })
        expect(outcome).toMatchObject({
          _tag: "SteeringPending",
          continuation: { queue: "steering", steeringEntryIds: [receipt.entryId] },
        })

        yield* host.execute(claim)

        expect(modelPrompt).toContain("queued continuation")
        expect(modelPrompt).toContain("steering:1:completion hook")
      }),
    )
  }),
)

layer(objectLayer)("rollback admission", (test) => {
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
      const claim = yield* store.claimExecution({
        commandId: "runtime-steering-test-ts-claim-6",
        runId: run.runId,
        ownerId: objectWorkerId,
      })
      yield* store.emitAgentEvent({
        commandId: "runtime-steering-test-ts-emitAgentEvent-4",
        ...claim,
        event: { _tag: "TurnStarted", turn: 0 },
      })
      yield* store.emitAgentEvent({
        commandId: "runtime-steering-test-ts-emitAgentEvent-5",
        ...claim,
        event: { _tag: "TurnCompleted", turn: 0 },
      })
      yield* store.emitAgentEvent({
        commandId: "runtime-steering-test-ts-emitAgentEvent-6",
        ...claim,
        event: { _tag: "TurnStarted", turn: 1 },
      })
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
      expect(history.filter((event) => event._tag === "TurnStarted" && event.turn === 1)).toHaveLength(1)
      expect(history.findLast((event) => event._tag === "RunRewound")).toMatchObject({
        toSequence: history.findLast((event) => event._tag === "TurnCompleted")?.sequence,
      })
      expect((yield* store.loadExecution(run.runId)).continuation).toMatchObject({
        nextTurn: 1,
        steeringEntryIds: [receipt.entryId],
      })
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
    let dispatches = 0
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
      replayPolicy: () => "provider-idempotent",
      execute: () =>
        Effect.sync(() => {
          dispatches += 1
        }).pipe(Effect.andThen(Deferred.succeed(started, undefined)), Effect.andThen(Effect.never)),
    })
    const hooks = Hooks.layer([
      Hooks.onSteer({
        key: "test.runtime.steering.onSteer.3",
        version: "1",
        replayPolicy: "never",
        hook: ({ queue, count }) => Effect.succeed(Hooks.AddContext(`${queue}:${count}:rollback hook`)),
      }),
    ])
    const handlers = toolkit.toLayer({ rollback_write: () => Effect.die("ToolExecutor owns rollback_write") })
    const runtimeLayer = objectRuntimeLayer({
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
          .execute(
            yield* store.claimExecution({
              commandId: "runtime-steering-test-ts-claim-7",
              runId: run.runId,
              ownerId: objectWorkerId,
            }),
          )
          .pipe(Effect.forkChild({ startImmediately: true }))
        yield* Deferred.await(started)

        const receipt = yield* runtime.send(run.runId, "replace the active turn", {
          policy: "rollback",
          idempotencyKey: "rollback-active",
        })
        yield* Fiber.join(first)

        yield* host.execute(
          yield* store.claimExecution({
            commandId: "runtime-steering-test-ts-claim-8",
            runId: run.runId,
            ownerId: objectWorkerId,
          }),
        )

        expect(requests).toHaveLength(2)
        expect(dispatches).toBe(1)
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

it.effect("rollback retains an unsafe running tool without redispatching replacement work", () =>
  Effect.gen(function* () {
    const started = yield* Deferred.make<void>()
    const requests: Array<string> = []
    let dispatches = 0
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
      execute: () =>
        Effect.sync(() => {
          dispatches += 1
        }).pipe(Effect.andThen(Deferred.succeed(started, undefined)), Effect.andThen(Effect.never)),
    })
    const hooks = Hooks.layer([
      Hooks.onSteer({
        key: "test.runtime.steering.onSteer.4",
        version: "1",
        replayPolicy: "never",
        hook: ({ queue, count }) => Effect.succeed(Hooks.AddContext(`${queue}:${count}:rollback hook`)),
      }),
    ])
    const handlers = toolkit.toLayer({ rollback_write: () => Effect.die("ToolExecutor owns rollback_write") })
    const runtimeLayer = objectRuntimeLayer({
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
          .execute(
            yield* store.claimExecution({
              commandId: "runtime-steering-test-ts-claim-7",
              runId: run.runId,
              ownerId: objectWorkerId,
            }),
          )
          .pipe(Effect.forkChild({ startImmediately: true }))
        yield* Deferred.await(started)

        const receipt = yield* runtime.send(run.runId, "replace the active turn", {
          policy: "rollback",
          idempotencyKey: "rollback-active",
        })
        yield* Fiber.join(first)

        yield* host.execute(
          yield* store.claimExecution({
            commandId: "runtime-steering-test-ts-claim-8",
            runId: run.runId,
            ownerId: objectWorkerId,
          }),
        )

        expect(requests).toHaveLength(1)
        expect(dispatches).toBe(1)
        expect((yield* runtime.inspect(run.runId)).status).toBe("needs-resolution")
        const history = yield* runtime.history({ runId: run.runId, limit: 100 })
        expect(history.filter((event) => event._tag === "Inbox")).toEqual([
          expect.objectContaining({ entryId: receipt.entryId, policy: "rollback" }),
        ])
        expect(history.filter((event) => event._tag === "OperationUnknown")).toHaveLength(1)
        expect(history.filter((event) => event._tag === "ToolExecutionStarted")).toHaveLength(1)
        expect((yield* runtime.inspect(run.runId)).branches).toHaveLength(1)
      }),
    )
  }),
)

layer(objectLayer)("admission retry side effects", (test) => {
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

      const [firstInterrupt, retryInterrupt] = yield* Effect.all(
        [
          admit(run.runId, "interrupt once", {
            policy: "interrupt",
            idempotencyKey: "interrupt-once",
          }),
          admit(run.runId, "interrupt once", {
            policy: "interrupt",
            idempotencyKey: "interrupt-once",
          }),
        ],
        { concurrency: "unbounded" },
      )
      expect(retryInterrupt).toEqual(firstInterrupt)
      expect(yield* Ref.get(interrupts)).toBe(1)

      const firstRollback = yield* admit(run.runId, "rollback once", {
        policy: "rollback",
        idempotencyKey: "rollback-once",
      })
      const retryRollback = yield* admit(run.runId, "rollback once", {
        policy: "rollback",
        idempotencyKey: "rollback-once",
      })
      expect(retryRollback).toEqual(firstRollback)
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
