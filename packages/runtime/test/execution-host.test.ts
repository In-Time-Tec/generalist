import { describe, expect, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Layer, Option, Ref, Schema, Stream } from "effect"
import { LanguageModel, Prompt, Response, Tool, Toolkit } from "effect/unstable/ai"
import {
  Agent,
  AgentEvent,
  AgentManifest,
  Compaction,
  ExecutableManifest,
  Pins,
  Session,
  ToolContext,
  ToolExecutor,
} from "@batonfx/core"
import { closedTestAgent, testExecutable } from "./identity.js"
import {
  Address,
  ExecutionHost,
  Cursor,
  Errors,
  ExecutableRegistration,
  ExecutableResolver,
  Runtime,
  RunStore,
} from "../src/index.js"
import { assistant, assistantRef, registrationsFor, researcherRef } from "./helpers.js"
import { tempDbPath } from "./sqlite-helpers.js"

const waitTool = Tool.make("wait_for_human", {
  parameters: Schema.Struct({ question: Schema.String }),
  success: Schema.String,
})

const isAdmission = (input: ExecutableResolver.Input): boolean => input.runId === "pending"

const finish = Response.makePart("finish", {
  reason: "stop",
  usage: Response.Usage.make({
    inputTokens: { total: 1, uncached: 1, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 1, text: 1, reasoning: undefined },
  }),
  response: undefined,
})

describe("ExecutionHost", () => {
  it.effect("passes the exact pinned context window and reserve to compaction", () =>
    Effect.gen(function* () {
      let observed: Compaction.Usage | undefined
      let observedKeepRecent: number | undefined
      const agent = Agent.make({ name: "pinned-compaction" })
      const compaction = {
        service: Pins.makeCapability({ service: "compaction", revision: 1 }),
        summaryModel: Pins.makeModel({ model: "summary", revision: 1 }),
        contextWindow: 32_768,
        reserveTokens: 2_048,
        keepRecentTokens: 777,
        strategyIdentity: "default:v1",
        summaryPromptIdentity: "summary:v1",
      }
      const pinned = AgentManifest.fromLiveAgent(agent, {
        model: Pins.makeModel({ model: "conversation", revision: 1 }),
        tools: [],
        skills: [],
        services: [],
        policy: { _tag: "Portable", policy: { _tag: "Forever" } },
        compaction,
        budget: {},
        children: [],
      })
      const executable = ExecutableManifest.make({ root: pinned.pin, entries: [{ _tag: "Agent", ...pinned }] })
      const policyPayload = {
        keepRecentTokens: 777,
        strategyIdentity: "default:v1",
        summaryPromptIdentity: "summary:v1",
      }
      const registrations = [
        { pin: pinned.manifest.model, codec: "test-model", version: "1", payload: {} },
        { pin: compaction.service, codec: "compaction-policy", version: "1", payload: policyPayload },
        { pin: compaction.summaryModel, codec: "test-model", version: "1", payload: { route: "summary" } },
      ]
      const resolver = ExecutableResolver.ExecutableResolver.of({
        resolve: (input) =>
          Effect.sync(() => {
            const registration = input.registrations?.find((item) => item.pin === compaction.service)
            const policy = Schema.decodeUnknownSync(ExecutableRegistration.CompactionPolicy)(registration?.payload)
            const strategy: Compaction.Strategy = {
              ...Compaction.defaultStrategy(),
              shouldCompact: (usage) => {
                observed = usage
                return true
              },
              cut: (_entries, keepRecentTokens) => {
                observedKeepRecent = keepRecentTokens
                return Option.none()
              },
            }
            return {
              _tag: "Agent" as const,
              agent: Agent.close(
                agent,
                Layer.mergeAll(
                  Layer.effect(
                    LanguageModel.LanguageModel,
                    LanguageModel.make({
                      generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
                      streamText: () => Stream.fromIterable<Response.StreamPartEncoded>([finish]),
                    }),
                  ),
                  Compaction.layer({ strategy, keepRecentTokens: policy.keepRecentTokens }),
                ),
              ),
              runOptions: {
                compaction: {
                  contextWindow: compaction.contextWindow,
                  reserveTokens: compaction.reserveTokens,
                },
              },
              attestation: executable,
            }
          }),
      })
      const runtimeLayer = Runtime.layerMemory({
        resolver,
        addresses: [],
      })

      yield* Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const host = yield* ExecutionHost.ExecutionHost
        const store = yield* RunStore.RunStore
        const receipt = yield* runtime.start({
          executable,
          registrations,
          sessionId: "session:pinned-compaction",
          idempotencyKey: "pinned-compaction",
          prompt: "run",
        })
        yield* host.execute(yield* store.claimExecution({ runId: receipt.runId, ownerId: "pinned-compaction" }))
      }).pipe(Effect.provide(runtimeLayer))

      expect(observed).toMatchObject({ contextWindow: 32_768, reserveTokens: 2_048 })
      expect(observedKeepRecent).toBe(777)
    }),
  )

  it.effect("reopens SQLite and reconstructs one pinned summary checkpoint", () =>
    Effect.gen(function* () {
      const filename = tempDbPath("pinned-compaction-reopen")
      let summaryCalls = 0
      let conversationCalls = 0
      const checkpointTool = Tool.make("checkpoint_tool", { parameters: Schema.Struct({ value: Schema.String }) })
      const agent = Agent.make({
        name: "sqlite-pinned-compaction",
        instructions: "Preserve the task.",
        toolkit: Toolkit.make(checkpointTool),
      })
      const compaction = {
        service: Pins.makeCapability({ service: "compaction", revision: 2 }),
        summaryModel: Pins.makeModel({ model: "summary", route: "summary-route:v2" }),
        contextWindow: 8,
        reserveTokens: 0,
        keepRecentTokens: 1,
        strategyIdentity: "default:v1",
        summaryPromptIdentity: "summary:v2",
      }
      const conversationModel = Pins.makeModel({ model: "conversation", route: "conversation-route:v2" })
      const checkpointToolPin = Pins.makeCapability({ tool: "checkpoint_tool", revision: 2 })
      const pinned = AgentManifest.fromLiveAgent(agent, {
        model: conversationModel,
        tools: [{ name: "checkpoint_tool", pin: checkpointToolPin }],
        skills: [],
        services: [],
        policy: { _tag: "Portable", policy: { _tag: "Forever" } },
        compaction,
        budget: {},
        children: [],
      })
      const executable = ExecutableManifest.make({ root: pinned.pin, entries: [{ _tag: "Agent", ...pinned }] })
      const registrations = [
        { pin: conversationModel, codec: "test-model", version: "1", payload: { route: "conversation-route:v2" } },
        { pin: checkpointToolPin, codec: "test-tool", version: "1", payload: { tool: "checkpoint_tool" } },
        {
          pin: compaction.service,
          codec: "compaction-policy",
          version: "1",
          payload: {
            keepRecentTokens: 1,
            strategyIdentity: "default:v1",
            summaryPromptIdentity: "summary:v2",
          },
        },
        { pin: compaction.summaryModel, codec: "test-model", version: "1", payload: { route: "summary-route:v2" } },
      ]
      const resolver = ExecutableResolver.ExecutableResolver.of({
        resolve: (input) =>
          Effect.sync(() => {
            const policyRegistration = input.registrations?.find((item) => item.pin === compaction.service)
            const summaryRegistration = input.registrations?.find((item) => item.pin === compaction.summaryModel)
            const policy = Schema.decodeUnknownSync(ExecutableRegistration.CompactionPolicy)(
              policyRegistration?.payload,
            )
            if (
              typeof summaryRegistration?.payload !== "object" ||
              summaryRegistration.payload === null ||
              !("route" in summaryRegistration.payload) ||
              summaryRegistration.payload.route !== "summary-route:v2"
            ) {
              throw new TypeError("Pinned summary route was not recovered")
            }
            const summaryModel = Layer.effect(
              LanguageModel.LanguageModel,
              LanguageModel.make({
                generateText: () => {
                  summaryCalls += 1
                  return Effect.succeed([{ type: "text", text: "recovered summary" }])
                },
                streamText: () => Stream.empty,
              }),
            )
            return {
              _tag: "Agent" as const,
              agent: Agent.close(
                agent,
                Layer.mergeAll(
                  Layer.effect(
                    LanguageModel.LanguageModel,
                    LanguageModel.make({
                      generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
                      streamText: () => {
                        conversationCalls += 1
                        return Stream.fromIterable<Response.StreamPartEncoded>(
                          conversationCalls === 1
                            ? [
                                Response.makePart("tool-call", {
                                  id: "checkpoint-call",
                                  name: "checkpoint_tool",
                                  params: { value: "commit history" },
                                  providerExecuted: false,
                                }),
                                finish,
                              ]
                            : [Response.makePart("text-delta", { id: "done", delta: "done" }), finish],
                        )
                      },
                    }),
                  ),
                  ToolExecutor.layerTest({
                    execute: () =>
                      Effect.succeed({ _tag: "Success", result: "checkpointed", encodedResult: "checkpointed" }),
                  }),
                  Toolkit.make(checkpointTool).toLayer({
                    checkpoint_tool: () => Effect.die("ToolExecutor test layer owns execution"),
                  }),
                  Session.layerMemory,
                  Compaction.layer({
                    keepRecentTokens: policy.keepRecentTokens,
                    summaryModel,
                  }),
                ),
              ),
              runOptions: {
                compaction: {
                  contextWindow: compaction.contextWindow,
                  reserveTokens: compaction.reserveTokens,
                },
              },
              attestation: executable,
            }
          }),
      })
      const layerSqlite = () => Runtime.layerSqlite({ filename, addresses: [], resolver })
      const receipt = yield* Effect.scoped(
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          return yield* runtime.start({
            executable,
            registrations,
            sessionId: "session:sqlite-pinned-compaction",
            idempotencyKey: "sqlite-pinned-compaction",
            prompt: "old context that must be summarized",
          })
        }).pipe(Effect.provide(layerSqlite())),
      )
      yield* Effect.scoped(
        Effect.gen(function* () {
          const host = yield* ExecutionHost.ExecutionHost
          const store = yield* RunStore.RunStore
          yield* host.execute(yield* store.claimExecution({ runId: receipt.runId, ownerId: "reopened-compaction" }))
        }).pipe(Effect.provide(layerSqlite())),
      )
      const snapshot = yield* Effect.scoped(
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          return yield* runtime.snapshot(receipt.runId)
        }).pipe(Effect.provide(layerSqlite())),
      )
      expect(summaryCalls).toBe(1)
      expect(snapshot.compactions).toHaveLength(1)
      expect(snapshot.compactions[0]?._tag).toBe("Applied")
      if (snapshot.compactions[0]?._tag === "Applied") {
        expect(snapshot.compactions[0].commit.checkpointId).not.toBe("")
      }
    }),
  )

  it.effect("attests admission in its own scope and resolves execution resources separately", () =>
    Effect.gen(function* () {
      const admissions = yield* Ref.make(0)
      const resolved = yield* Ref.make(0)
      const lifecycle = yield* Ref.make<ReadonlyArray<string>>([])
      const agent = Agent.make({ name: "lazy-resolver" })
      const executable = testExecutable(agent, "lazy-v1")
      const address = Address.make("agent:lazy-resolver")
      const model = Layer.effect(
        LanguageModel.LanguageModel,
        Effect.acquireRelease(
          Ref.update(lifecycle, (events) => [...events, "service acquired"]).pipe(
            Effect.andThen(
              LanguageModel.make({
                generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
                streamText: () => Stream.fromIterable<Response.StreamPartEncoded>([finish]),
              }),
            ),
          ),
          () => Ref.update(lifecycle, (events) => [...events, "service finalized"]),
        ),
      )
      const resolver = ExecutableResolver.ExecutableResolver.of({
        resolve: (input) =>
          Effect.gen(function* () {
            const scope = isAdmission(input) ? "admission" : "execution"
            yield* Ref.update(isAdmission(input) ? admissions : resolved, (count) => count + 1)
            yield* Ref.update(lifecycle, (events) => [...events, `${scope} resolver acquired`])
            yield* Effect.addFinalizer(() =>
              Ref.update(lifecycle, (events) => [...events, `${scope} resolver finalized`]),
            )
            return { _tag: "Agent" as const, agent: Agent.close(agent, model), attestation: executable }
          }),
      })
      const runtimeLayer = Runtime.layerMemory({
        resolver,
        addresses: [{ address, executable, registrations: registrationsFor(executable) }],
      })

      yield* Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const host = yield* ExecutionHost.ExecutionHost
        const store = yield* RunStore.RunStore
        const receipt = yield* runtime.send({
          to: address,
          sessionId: "session:lazy",
          idempotencyKey: "lazy:1",
          prompt: "run",
        })
        expect(yield* Ref.get(admissions)).toBe(1)
        expect(yield* Ref.get(resolved)).toBe(0)
        expect(yield* Ref.get(lifecycle)).toEqual(["admission resolver acquired", "admission resolver finalized"])
        const persisted = yield* store.loadExecution(receipt.runId)
        expect(persisted.executableRef).toEqual(executable.ref)
        expect(persisted.executableManifest).toEqual(executable.manifest)

        yield* host.execute(yield* store.claimExecution({ runId: receipt.runId, ownerId: "lazy" }))
        expect(yield* Ref.get(admissions)).toBe(1)
        expect(yield* Ref.get(resolved)).toBe(1)
        expect(yield* Ref.get(lifecycle)).toEqual([
          "admission resolver acquired",
          "admission resolver finalized",
          "execution resolver acquired",
          "service acquired",
          "service finalized",
          "execution resolver finalized",
        ])
      }).pipe(Effect.provide(runtimeLayer))
    }),
  )

  it.effect("interrupts and finalizes a blocked resolver before model execution", () =>
    Effect.gen(function* () {
      const resolving = yield* Deferred.make<void>()
      const finalized = yield* Deferred.make<void>()
      const modelCalls = yield* Ref.make(0)
      const agent = Agent.make({ name: "blocked-resolver" })
      const executable = testExecutable(agent, "blocked-v1")
      const address = Address.make("agent:blocked-resolver")
      const model = Layer.effect(
        LanguageModel.LanguageModel,
        Ref.update(modelCalls, (count) => count + 1).pipe(
          Effect.andThen(
            LanguageModel.make({
              generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
              streamText: () => Stream.fromIterable<Response.StreamPartEncoded>([finish]),
            }),
          ),
        ),
      )
      const resolution = { _tag: "Agent" as const, agent: Agent.close(agent, model), attestation: executable }
      const resolver = ExecutableResolver.ExecutableResolver.of({
        resolve: (input) =>
          Effect.gen(function* () {
            if (isAdmission(input)) return resolution
            yield* Effect.addFinalizer(() => Deferred.succeed(finalized, undefined))
            yield* Deferred.succeed(resolving, undefined)
            yield* Effect.never
            return resolution
          }),
      })
      const runtimeLayer = Runtime.layerMemory({
        resolver,
        addresses: [{ address, executable, registrations: registrationsFor(executable) }],
      })

      yield* Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const host = yield* ExecutionHost.ExecutionHost
        const store = yield* RunStore.RunStore
        const receipt = yield* runtime.send({
          to: address,
          sessionId: "session:blocked-resolver",
          idempotencyKey: "blocked-resolver:1",
          prompt: "never resolve",
        })
        const claim = yield* store.claimExecution({ runId: receipt.runId, ownerId: "blocked-resolver" })
        const execution = yield* host.execute(claim).pipe(Effect.forkChild({ startImmediately: true }))
        yield* Deferred.await(resolving)
        yield* runtime.cancel({ runId: receipt.runId, reason: "stop resolving" })

        expect((yield* Fiber.await(execution))._tag).toBe("Success")
        yield* Deferred.await(finalized)
        expect((yield* runtime.inspect(receipt.runId)).status).toBe("cancelled")
        expect(yield* Ref.get(modelCalls)).toBe(0)
      }).pipe(Effect.provide(runtimeLayer))
    }),
  )

  it.effect("finalizes services before resolver resources when model execution fails", () =>
    Effect.gen(function* () {
      const lifecycle: Array<string> = []
      const agent = Agent.make({ name: "failing-model" })
      const executable = testExecutable(agent, "failing-v1")
      const address = Address.make("agent:failing-model")
      const model = Layer.effect(
        LanguageModel.LanguageModel,
        Effect.acquireRelease(
          Effect.sync(() => lifecycle.push("service acquired")).pipe(
            Effect.andThen(
              LanguageModel.make({
                generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
                streamText: () => Stream.die(new Error("model failed")),
              }),
            ),
          ),
          () => Effect.sync(() => lifecycle.push("service finalized")),
        ),
      )
      const resolver = ExecutableResolver.ExecutableResolver.of({
        resolve: (input) =>
          Effect.gen(function* () {
            const scope = isAdmission(input) ? "admission" : "execution"
            lifecycle.push(`${scope} resolver acquired`)
            yield* Effect.addFinalizer(() => Effect.sync(() => lifecycle.push(`${scope} resolver finalized`)))
            return { _tag: "Agent" as const, agent: Agent.close(agent, model), attestation: executable }
          }),
      })

      yield* Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const host = yield* ExecutionHost.ExecutionHost
        const store = yield* RunStore.RunStore
        const receipt = yield* runtime.send({
          to: address,
          sessionId: "session:failing-model",
          idempotencyKey: "failing-model:1",
          prompt: "fail",
        })
        expect(lifecycle).toEqual(["admission resolver acquired", "admission resolver finalized"])
        yield* host.execute(yield* store.claimExecution({ runId: receipt.runId, ownerId: "failing-model" }))

        expect((yield* runtime.inspect(receipt.runId)).status).toBe("failed")
        expect(lifecycle).toEqual([
          "admission resolver acquired",
          "admission resolver finalized",
          "execution resolver acquired",
          "service acquired",
          "service finalized",
          "execution resolver finalized",
        ])
      }).pipe(
        Effect.provide(
          Runtime.layerMemory({
            resolver,
            addresses: [{ address, executable, registrations: registrationsFor(executable) }],
          }),
        ),
      )
    }),
  )

  it.effect("persists typed missing and mismatched executable failures", () => {
    const agent = Agent.make({ name: "resolution-failure" })
    const executable = testExecutable(agent, "expected")
    const other = testExecutable(Agent.make({ name: "other-resolution" }), "actual")
    const address = Address.make("agent:resolution-failure")

    const verify = (
      resolver: ExecutableResolver.Interface,
      expectedTag: string,
      key: string,
      finalized: Ref.Ref<boolean>,
      admissionFinalized: Ref.Ref<boolean>,
    ) =>
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const host = yield* ExecutionHost.ExecutionHost
        const store = yield* RunStore.RunStore
        const receipt = yield* runtime.send({
          to: address,
          sessionId: `session:${key}`,
          idempotencyKey: key,
          prompt: "run",
        })
        expect(yield* Ref.get(admissionFinalized)).toBe(true)
        expect(yield* Ref.get(finalized)).toBe(false)
        yield* host.execute(yield* store.claimExecution({ runId: receipt.runId, ownerId: key }))
        const failed = (yield* runtime.history({ runId: receipt.runId, limit: 20 })).find(
          (event) => event._tag === "RunFailed",
        )
        expect(failed?._tag).toBe("RunFailed")
        if (failed?._tag === "RunFailed") expect(failed.error._tag).toBe(expectedTag)
        expect(yield* Ref.get(finalized)).toBe(true)
      }).pipe(
        Effect.provide(
          Runtime.layerMemory({
            resolver,
            addresses: [{ address, executable, registrations: registrationsFor(executable) }],
          }),
        ),
      )

    return Effect.gen(function* () {
      const missingFinalized = yield* Ref.make(false)
      const missingAdmissionFinalized = yield* Ref.make(false)
      const mismatchFinalized = yield* Ref.make(false)
      const mismatchAdmissionFinalized = yield* Ref.make(false)
      const attested = { _tag: "Agent" as const, agent: closedTestAgent(agent), attestation: executable }
      const missing = ExecutableResolver.ExecutableResolver.of({
        resolve: (input) =>
          isAdmission(input)
            ? Effect.addFinalizer(() => Ref.set(missingAdmissionFinalized, true)).pipe(Effect.as(attested))
            : Effect.addFinalizer(() => Ref.set(missingFinalized, true)).pipe(
                Effect.andThen(Errors.ExecutablePinMissing.make({ runId: input.runId, ref: input.ref })),
              ),
      })
      const mismatched = ExecutableResolver.ExecutableResolver.of({
        resolve: (input) =>
          isAdmission(input)
            ? Effect.addFinalizer(() => Ref.set(mismatchAdmissionFinalized, true)).pipe(Effect.as(attested))
            : Effect.addFinalizer(() => Ref.set(mismatchFinalized, true)).pipe(
                Effect.as({ _tag: "Agent" as const, agent: closedTestAgent(agent), attestation: other }),
              ),
      })
      yield* verify(
        missing,
        "@batonfx/runtime/ExecutablePinMissing",
        "missing",
        missingFinalized,
        missingAdmissionFinalized,
      )
      yield* verify(
        mismatched,
        "@batonfx/runtime/ExecutableIdentityMismatch",
        "mismatch",
        mismatchFinalized,
        mismatchAdmissionFinalized,
      )
    })
  })

  it.effect("persists operations and resumes a suspended Agent in the same Run", () => {
    let phase: "suspend" | "resume" = "suspend"
    let modelCalls = 0
    const lifecycle: Array<string> = []
    const agent = Agent.make({ name: "durable-assistant", toolkit: Toolkit.make(waitTool) })
    const ref = testExecutable(agent, "2026-08-03")
    const address = Address.make("agent:durable-assistant")
    const model = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
        streamText: () => {
          modelCalls += 1
          return Stream.fromIterable<Response.StreamPartEncoded>(
            modelCalls === 1
              ? [
                  Response.makePart("tool-call", {
                    id: "wait-call-1",
                    name: "wait_for_human",
                    params: { question: "Continue?" },
                    providerExecuted: false,
                  }),
                  finish,
                ]
              : [Response.makePart("text-delta", { id: "answer", delta: "continued" }), finish],
          )
        },
      }),
    )
    const executor = ToolExecutor.layerTest({
      execute: () =>
        phase === "suspend"
          ? Effect.succeed({ _tag: "Suspend", token: "approval-token" })
          : Effect.succeed({ _tag: "Success", result: "approved", encodedResult: "approved" }),
    })
    const handlers = Toolkit.make(waitTool).toLayer({
      wait_for_human: () => Effect.die("ToolExecutor test layer owns execution"),
    })
    const resources = Layer.effectDiscard(
      Effect.acquireRelease(
        Effect.sync(() => lifecycle.push("service acquired")),
        () => Effect.sync(() => lifecycle.push("service finalized")),
      ),
    )
    const resolver = ExecutableResolver.ExecutableResolver.of({
      resolve: (input) =>
        Effect.gen(function* () {
          const scope = isAdmission(input) ? "admission" : "execution"
          lifecycle.push(`${scope} resolver acquired`)
          yield* Effect.addFinalizer(() => Effect.sync(() => lifecycle.push(`${scope} resolver finalized`)))
          return {
            _tag: "Agent" as const,
            agent: Agent.close(agent, Layer.mergeAll(model, executor, handlers, resources)),
            attestation: ref,
          }
        }),
    })
    const runtimeLayer = Runtime.layerMemory({
      resolver,
      addresses: [{ address, executable: ref, registrations: registrationsFor(ref) }],
    })

    return Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const host = yield* ExecutionHost.ExecutionHost
      const store = yield* RunStore.RunStore
      const receipt = yield* runtime.send({
        to: address,
        sessionId: "session:durable",
        idempotencyKey: "message:1",
        prompt: "Wait and then continue.",
      })
      expect(lifecycle).toEqual(["admission resolver acquired", "admission resolver finalized"])

      const firstClaim = yield* store.claimExecution({ runId: receipt.runId, ownerId: "memory" })
      yield* host.execute(firstClaim)
      const waiting = yield* runtime.inspect(receipt.runId)
      if (waiting.status === "failed") {
        const failedEvents = yield* runtime.events({ runId: receipt.runId }).pipe(
          Stream.takeUntil((event) => event._tag === "RunFailed"),
          Stream.runCollect,
        )
        const failed = [...failedEvents].find((event) => event._tag === "RunFailed")
        throw new Error(failed?._tag === "RunFailed" ? failed.error.message : "run failed")
      }
      expect(waiting.status).toBe("waiting")
      expect(waiting.wait?.waitId).toBe("wait-call-1")
      const persisted = yield* store.loadExecution(receipt.runId)
      expect(persisted.checkpoint !== undefined && "driverVersion" in persisted.checkpoint).toBe(true)
      if (persisted.checkpoint === undefined || !("driverVersion" in persisted.checkpoint)) return
      expect(persisted.checkpoint.driverVersion).toBe("1")
      expect(persisted.checkpoint.executable).toEqual(ref.ref)
      expect(persisted.transcript).toBeDefined()
      expect(persisted.suspension?.token).toBe("approval-token")
      expect(lifecycle).toEqual([
        "admission resolver acquired",
        "admission resolver finalized",
        "execution resolver acquired",
        "service acquired",
        "service finalized",
        "execution resolver finalized",
      ])

      phase = "resume"
      lifecycle.length = 0
      yield* runtime.respond({
        runId: receipt.runId,
        waitId: "wait-call-1",
        idempotencyKey: "response:1",
        resolution: { _tag: "ToolResult", result: "approved", encodedResult: "approved" },
      })
      const resumeClaim = yield* store.claimExecution({ runId: receipt.runId, ownerId: "memory" })
      yield* host.execute(resumeClaim)

      const completed = yield* runtime.inspect(receipt.runId)
      if (completed.status === "failed") {
        const history = yield* store.history({ runId: receipt.runId, cursor: Cursor.origin, limit: 100 })
        const failure = history.find((event) => event._tag === "RunFailed")
        throw new Error(failure?._tag === "RunFailed" ? failure.error.message : "run failed")
      }
      expect(completed.runId).toBe(receipt.runId)
      expect(completed.status).toBe("succeeded")
      const events = yield* runtime.events({ runId: receipt.runId, cursor: Cursor.origin }).pipe(
        Stream.takeUntil((event) => event._tag === "RunCompleted"),
        Stream.runCollect,
      )
      const replay = [...events]
      expect(replay.filter((event) => event._tag === "RunCompleted")).toHaveLength(1)
      expect(replay.map((event) => event.sequence)).toEqual(replay.map((_, index) => index))
      expect(new Set(replay.map((event) => event.runId))).toEqual(new Set([receipt.runId]))
      expect(modelCalls).toBe(2)
      expect(lifecycle).toEqual([
        "execution resolver acquired",
        "service acquired",
        "service finalized",
        "execution resolver finalized",
      ])

      modelCalls = 0
      phase = "suspend"
      const cancelled = yield* runtime.send({
        to: address,
        sessionId: "session:durable-cancel",
        idempotencyKey: "message:cancel",
        prompt: "Wait until cancelled.",
      })
      yield* host.execute(yield* store.claimExecution({ runId: cancelled.runId, ownerId: "memory" }))
      expect((yield* runtime.inspect(cancelled.runId)).status).toBe("waiting")
      yield* runtime.cancel({ runId: cancelled.runId, reason: "stop while suspended" })
      expect((yield* runtime.inspect(cancelled.runId)).status).toBe("cancelled")
    }).pipe(Effect.provide(runtimeLayer))
  })

  it.effect("interrupts an active model when Runtime.cancel commits cancellation", () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>()
      const releaseFinalizer = yield* Deferred.make<void>()
      const interrupted = yield* Ref.make(false)
      const lifecycle: Array<string> = []
      const agent = Agent.make({ name: "cancel-model" })
      const ref = testExecutable(agent, "cancel-v2")
      const address = Address.make("agent:cancel-model")
      const model = Layer.effect(
        LanguageModel.LanguageModel,
        LanguageModel.make({
          generateText: () => Effect.never,
          streamText: () =>
            Stream.fromEffect(Deferred.succeed(started, undefined)).pipe(
              Stream.flatMap(() => Stream.never),
              Stream.ensuring(Ref.set(interrupted, true)),
            ),
        }),
      )
      const resources = Layer.effectDiscard(
        Effect.acquireRelease(
          Effect.sync(() => lifecycle.push("service acquired")),
          () =>
            Deferred.await(releaseFinalizer).pipe(
              Effect.andThen(Effect.sync(() => lifecycle.push("service finalized"))),
            ),
        ),
      )
      const resolver = ExecutableResolver.ExecutableResolver.of({
        resolve: (input) =>
          Effect.gen(function* () {
            const scope = isAdmission(input) ? "admission" : "execution"
            lifecycle.push(`${scope} resolver acquired`)
            yield* Effect.addFinalizer(() => Effect.sync(() => lifecycle.push(`${scope} resolver finalized`)))
            return {
              _tag: "Agent" as const,
              agent: Agent.close(agent, Layer.merge(model, resources)),
              attestation: ref,
            }
          }),
      })
      const runtimeLayer = Runtime.layerMemory({
        resolver,
        addresses: [{ address, executable: ref, registrations: registrationsFor(ref) }],
      })
      yield* Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const host = yield* ExecutionHost.ExecutionHost
        const store = yield* RunStore.RunStore
        const receipt = yield* runtime.send({
          to: address,
          sessionId: "session:cancel",
          idempotencyKey: "cancel:1",
          prompt: "wait",
        })
        expect(lifecycle).toEqual(["admission resolver acquired", "admission resolver finalized"])
        const claim = yield* store.claimExecution({ runId: receipt.runId, ownerId: "memory" })
        const fiber = yield* host.execute(claim).pipe(Effect.forkChild({ startImmediately: true }))
        yield* Deferred.await(started)
        yield* runtime.cancel({ runId: receipt.runId, reason: "stop" })
        expect((yield* runtime.inspect(receipt.runId)).status).toBe("cancelling")
        expect(lifecycle).toEqual([
          "admission resolver acquired",
          "admission resolver finalized",
          "execution resolver acquired",
          "service acquired",
        ])
        yield* Deferred.succeed(releaseFinalizer, undefined)
        const exit = yield* Fiber.await(fiber)
        expect(exit._tag).toBe("Success")
        expect((yield* runtime.inspect(receipt.runId)).status).toBe("cancelled")
        expect(yield* Ref.get(interrupted)).toBe(true)
        expect(lifecycle).toEqual([
          "admission resolver acquired",
          "admission resolver finalized",
          "execution resolver acquired",
          "service acquired",
          "service finalized",
          "execution resolver finalized",
        ])
        expect(
          (yield* runtime.history({ runId: receipt.runId, cursor: -1, limit: 100 })).map((event) => event._tag),
        ).not.toContain("RunFailed")
      }).pipe(Effect.provide(runtimeLayer))
    }),
  )

  it.live("keeps a host-interrupted SQLite Run recoverable after reopen", () =>
    Effect.gen(function* () {
      const filename = tempDbPath("host-interruption-recovery")
      const started = yield* Deferred.make<void>()
      const agent = Agent.make({ name: "host-interruption-recovery" })
      const executable = testExecutable(agent, "host-interruption-recovery-v1")
      const address = Address.make("agent:host-interruption-recovery")
      const blockingModel = Layer.effect(
        LanguageModel.LanguageModel,
        LanguageModel.make({
          generateText: () => Effect.never,
          streamText: () =>
            Stream.fromEffect(Deferred.succeed(started, undefined)).pipe(Stream.flatMap(() => Stream.never)),
        }),
      )
      const firstResolver = ExecutableResolver.makeStatic([{ executable, agent: Agent.close(agent, blockingModel) }])
      const runId = yield* Effect.scoped(
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const host = yield* ExecutionHost.ExecutionHost
          const store = yield* RunStore.RunStore
          const receipt = yield* runtime.send({
            to: address,
            sessionId: "session:host-interruption-recovery",
            idempotencyKey: "host-interruption-recovery",
            prompt: "wait for host shutdown",
          })
          const claim = yield* store.claimExecution({ runId: receipt.runId, ownerId: "before-reopen" })
          yield* host.execute(claim).pipe(Effect.forkScoped)
          yield* Deferred.await(started)
          return receipt.runId
        }).pipe(
          Effect.provide(
            Runtime.layerSqlite({
              filename,
              resolver: firstResolver,
              addresses: [{ address, executable, registrations: registrationsFor(executable) }],
              scheduler: { pollInterval: "1 hour" },
            }),
          ),
        ),
      )

      const recoveredStarted = yield* Deferred.make<void>()
      const recoveredModel = Layer.effect(
        LanguageModel.LanguageModel,
        LanguageModel.make({
          generateText: () => Effect.never,
          streamText: () =>
            Stream.fromEffect(Deferred.succeed(recoveredStarted, undefined)).pipe(Stream.flatMap(() => Stream.never)),
        }),
      )
      const secondResolver = ExecutableResolver.makeStatic([{ executable, agent: Agent.close(agent, recoveredModel) }])
      yield* Effect.scoped(
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const host = yield* ExecutionHost.ExecutionHost
          const store = yield* RunStore.RunStore
          expect((yield* runtime.inspect(runId)).status).toBe("running")
          const history = yield* runtime.history({ runId, limit: 100 })
          expect(history.map((event) => event._tag)).not.toContain("RunFailed")
          yield* host.execute(yield* store.claimExecution({ runId, ownerId: "after-reopen" })).pipe(Effect.forkScoped)
          yield* Deferred.await(recoveredStarted)
          expect((yield* runtime.inspect(runId)).status).toBe("running")
        }).pipe(
          Effect.provide(
            Runtime.layerSqlite({
              filename,
              resolver: secondResolver,
              addresses: [{ address, executable, registrations: registrationsFor(executable) }],
              scheduler: { pollInterval: "1 hour" },
            }),
          ),
        ),
      )
    }),
  )

  it.effect("interrupts active tool execution and waits for explicit uncertainty resolution", () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>()
      const interrupted = yield* Ref.make(false)
      let invocation: ToolContext.Interface | undefined
      const tool = Tool.make("block", { parameters: Schema.Struct({}), success: Schema.String })
      const agent = Agent.make({ name: "cancel-tool", toolkit: Toolkit.make(tool) })
      const ref = testExecutable(agent, "cancel-tool-v1")
      const address = Address.make("agent:cancel-tool")
      const model = Layer.effect(
        LanguageModel.LanguageModel,
        LanguageModel.make({
          generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
          streamText: () =>
            Stream.fromIterable<Response.StreamPartEncoded>([
              Response.makePart("tool-call", { id: "block-1", name: "block", params: {}, providerExecuted: false }),
              finish,
            ]),
        }),
      )
      const executor = ToolExecutor.layerTest({
        execute: () =>
          Effect.gen(function* () {
            const context = yield* ToolContext.ToolContext
            invocation = context
            context.signal.addEventListener("abort", () => {
              Effect.runSync(Ref.set(interrupted, true))
            })
            yield* Deferred.succeed(started, undefined)
            return yield* Effect.never
          }),
      })
      const handlers = Toolkit.make(tool).toLayer({ block: () => Effect.die("ToolExecutor test layer owns execution") })
      const runtimeLayer = Runtime.layerMemory({
        resolver: ExecutableResolver.makeStatic([
          { executable: ref, agent: Agent.close(agent, Layer.mergeAll(model, executor, handlers)) },
        ]),
        addresses: [{ address, executable: ref, registrations: registrationsFor(ref) }],
      })
      yield* Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const host = yield* ExecutionHost.ExecutionHost
        const store = yield* RunStore.RunStore
        const receipt = yield* runtime.send({
          to: address,
          sessionId: "session:cancel-tool",
          idempotencyKey: "cancel-tool:1",
          prompt: "block",
        })
        const claim = yield* store.claimExecution({ runId: receipt.runId, ownerId: "memory" })
        const fiber = yield* host.execute(claim).pipe(Effect.forkChild({ startImmediately: true }))
        yield* Deferred.await(started)
        expect(invocation).toMatchObject({
          runId: receipt.runId,
          rootRunId: receipt.runId,
          toolCallId: "block-1",
          operationKey: `${receipt.runId}:tool:0:0:block-1:block`,
          idempotencyKey: `${receipt.runId}:tool:0:0:block-1:block`,
          attempt: 1,
          admittedAt: expect.any(String),
          sessionId: "session:cancel-tool",
        })
        yield* runtime.cancel({ runId: receipt.runId, reason: "stop" })
        const exit = yield* Fiber.await(fiber)
        expect(exit._tag).toBe("Success")
        expect((yield* runtime.inspect(receipt.runId)).status).toBe("needs-resolution")
        expect(yield* Ref.get(interrupted)).toBe(true)
        const unknown = (yield* runtime.history({ runId: receipt.runId, cursor: -1, limit: 100 })).find(
          (event) => event._tag === "OperationUnknown",
        )
        if (unknown?._tag !== "OperationUnknown") return yield* Effect.die("unknown operation event missing")
        yield* runtime.resolveOperation({
          runId: receipt.runId,
          operationId: unknown.operationId,
          idempotencyKey: "cancel-tool:resolved",
          resolution: { _tag: "Failed", error: { message: "cancelled before result was observed" } },
        })
        yield* runtime.cancel({ runId: receipt.runId, reason: "settle after resolution" })
        expect((yield* runtime.inspect(receipt.runId)).status).toBe("cancelled")
        expect(
          (yield* runtime.history({ runId: receipt.runId, cursor: -1, limit: 100 })).map((event) => event._tag),
        ).not.toContain("RunFailed")
      }).pipe(Effect.provide(runtimeLayer))
    }),
  )

  for (const backend of ["memory", "sqlite"] as const) {
    it.live(`${backend} records an interrupted external tool effect as unknown before cancellation settles`, () =>
      Effect.gen(function* () {
        const started = yield* Deferred.make<void>()
        const toolFinalized = yield* Deferred.make<void>()
        const lifecycle: Array<string> = []
        let externalCounter = 0
        const tool = Tool.make("external_counter", { parameters: Schema.Struct({}), success: Schema.Number })
        const agent = Agent.make({ name: `uncertain-${backend}`, toolkit: Toolkit.make(tool) })
        const executable = testExecutable(agent, `uncertain-${backend}-v1`)
        const address = Address.make(`agent:uncertain-${backend}`)
        const model = Layer.effect(
          LanguageModel.LanguageModel,
          LanguageModel.make({
            generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
            streamText: () =>
              Stream.fromIterable<Response.StreamPartEncoded>([
                Response.makePart("tool-call", {
                  id: "external-counter-1",
                  name: "external_counter",
                  params: {},
                  providerExecuted: false,
                }),
                finish,
              ]),
          }),
        )
        const executor = ToolExecutor.layerTest({
          execute: () =>
            Effect.gen(function* () {
              externalCounter += 1
              lifecycle.push("external effect committed")
              yield* Deferred.succeed(started, undefined)
              return yield* Effect.never
            }).pipe(
              Effect.ensuring(
                Effect.sync(() => lifecycle.push("tool finalized")).pipe(
                  Effect.andThen(Deferred.succeed(toolFinalized, undefined)),
                ),
              ),
            ),
        })
        const handlers = Toolkit.make(tool).toLayer({
          external_counter: () => Effect.die("ToolExecutor test layer owns execution"),
        })
        const resources = Layer.effectDiscard(
          Effect.acquireRelease(Effect.void, () => Effect.sync(() => lifecycle.push("service finalized"))),
        )
        const resolver = ExecutableResolver.ExecutableResolver.of({
          resolve: (input) =>
            isAdmission(input)
              ? Effect.addFinalizer(() => Effect.sync(() => lifecycle.push("admission resolver finalized"))).pipe(
                  Effect.as({
                    _tag: "Agent" as const,
                    agent: Agent.close(agent, Layer.mergeAll(model, executor, handlers, resources)),
                    attestation: executable,
                  }),
                )
              : Effect.addFinalizer(() => Effect.sync(() => lifecycle.push("execution resolver finalized"))).pipe(
                  Effect.as({
                    _tag: "Agent" as const,
                    agent: Agent.close(agent, Layer.mergeAll(model, executor, handlers, resources)),
                    attestation: executable,
                  }),
                ),
        })
        const filename = tempDbPath(`uncertain-${backend}`)
        const layer = () =>
          backend === "memory"
            ? Runtime.layerMemory({
                resolver,
                addresses: [{ address, executable, registrations: registrationsFor(executable) }],
              })
            : Runtime.layerSqlite({
                filename,
                resolver,
                addresses: [{ address, executable, registrations: registrationsFor(executable) }],
              })

        const first = yield* Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const host = yield* ExecutionHost.ExecutionHost
          const store = yield* RunStore.RunStore
          const receipt = yield* runtime.send({
            to: address,
            sessionId: `session:uncertain-${backend}`,
            idempotencyKey: `uncertain-${backend}:1`,
            prompt: "increment once",
          })
          expect(lifecycle).toEqual(["admission resolver finalized"])
          const fiber = yield* host
            .execute(yield* store.claimExecution({ runId: receipt.runId, ownerId: `uncertain-${backend}` }))
            .pipe(Effect.forkChild({ startImmediately: true }))
          yield* Deferred.await(started)
          yield* runtime.cancel({ runId: receipt.runId, reason: "stop after commit" })
          expect((yield* Fiber.await(fiber))._tag).toBe("Success")
          yield* Deferred.await(toolFinalized)
          expect(externalCounter).toBe(1)
          expect(lifecycle[0]).toBe("admission resolver finalized")
          expect(lifecycle[1]).toBe("external effect committed")
          expect(new Set(lifecycle.slice(2))).toEqual(
            new Set(["tool finalized", "service finalized", "execution resolver finalized"]),
          )
          const persistedTool = yield* store.getOperationByKey({
            runId: receipt.runId,
            operationKey: `${receipt.runId}:tool:0:0:external-counter-1:external_counter`,
          })
          expect(persistedTool?.status).toBe("unknown")
          const unknown = (yield* runtime.history({ runId: receipt.runId, cursor: -1, limit: 100 })).find(
            (event) => event._tag === "OperationUnknown",
          )
          expect(unknown?._tag).toBe("OperationUnknown")
          expect((yield* runtime.inspect(receipt.runId)).status).toBe("needs-resolution")
          if (unknown?._tag !== "OperationUnknown") return yield* Effect.die("unknown operation event missing")
          const operation = yield* store.getOperation({ runId: receipt.runId, operationId: unknown.operationId })
          expect(operation.status).toBe("unknown")
          expect(operation.replayPolicy).toBe("never")
          if (backend === "memory") {
            yield* runtime.resolveOperation({
              runId: receipt.runId,
              operationId: operation.operationId,
              idempotencyKey: "operator:committed",
              resolution: { _tag: "Succeeded", value: 1 },
            })
            yield* runtime.cancel({ runId: receipt.runId, reason: "settle after resolution" })
            expect((yield* runtime.inspect(receipt.runId)).status).toBe("cancelled")
          }
          return { runId: receipt.runId, operationId: operation.operationId }
        }).pipe(Effect.provide(layer()), Effect.scoped)

        if (backend === "sqlite") {
          yield* Effect.gen(function* () {
            const runtime = yield* Runtime.Runtime
            const store = yield* RunStore.RunStore
            expect((yield* runtime.inspect(first.runId)).status).toBe("needs-resolution")
            expect((yield* store.getOperation({ runId: first.runId, operationId: first.operationId })).status).toBe(
              "unknown",
            )
            expect(externalCounter).toBe(1)
            yield* runtime.resolveOperation({
              runId: first.runId,
              operationId: first.operationId,
              idempotencyKey: "operator:committed",
              resolution: { _tag: "Succeeded", value: 1 },
            })
            yield* runtime.cancel({ runId: first.runId, reason: "settle after resolution" })
            expect((yield* runtime.inspect(first.runId)).status).toBe("cancelled")
          }).pipe(Effect.provide(layer()), Effect.scoped)
        }
      }),
    )
  }

  it.effect("rejects stale execution checkpoint writers", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const receipt = yield* runtime.send({
        to: Address.make("agent:fence"),
        sessionId: "session:fence",
        idempotencyKey: "fence:1",
        prompt: "fence",
      })
      const first = yield* store.claimExecution({ runId: receipt.runId, ownerId: "worker-a" })
      const operation = yield* store.recordOperation({
        ...first,
        operationKey: "tool:fenced",
        kind: "tool",
        inputDigest: "fenced",
        input: {},
        replayPolicy: "never",
        attempt: 1,
      })
      yield* store.startOperation({ ...first, operationId: operation.operationId })
      yield* store.claimExecution({ runId: receipt.runId, ownerId: "worker-b" })
      const stale = yield* store
        .saveExecution({
          runId: receipt.runId,
          ownerId: "worker-a",
          attemptFence: first.attemptFence,
        })
        .pipe(Effect.flip)
      expect(stale._tag).toBe("@batonfx/runtime/StaleClaim")
      const staleRecovery = yield* store
        .expireRunningOperation({
          ...first,
          operationId: operation.operationId,
        })
        .pipe(Effect.flip)
      expect(staleRecovery._tag).toBe("@batonfx/runtime/StaleClaim")
      expect((yield* store.getOperation({ runId: receipt.runId, operationId: operation.operationId })).status).toBe(
        "running",
      )
    }).pipe(
      Effect.provide(
        Runtime.layerMemory({
          resolver: (() => {
            const agent = Agent.make({ name: "fence" })
            return ExecutableResolver.makeStatic([
              { executable: testExecutable(agent, "1"), agent: closedTestAgent(agent) },
            ])
          })(),
          addresses: (() => {
            const agent = Agent.make({ name: "fence" })
            return [
              {
                address: Address.make("agent:fence"),
                executable: testExecutable(agent, "1"),
                registrations: registrationsFor(testExecutable(agent, "1")),
              },
            ]
          })(),
        }),
      ),
    ),
  )

  it.effect("exposes only pre-commit or post-commit operation and checkpoint states", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const receipt = yield* runtime.send({
        to: Address.make("agent:atomic-operation"),
        sessionId: "session:atomic-operation",
        idempotencyKey: "atomic-operation",
        prompt: "handoff",
      })
      const claim = yield* store.claimExecution({ runId: receipt.runId, ownerId: "atomic-worker" })
      const operation = yield* store.recordOperation({
        ...claim,
        operationKey: "handoff:atomic",
        kind: "handoff",
        inputDigest: "handoff:atomic",
        input: { targetAgentPin: researcherRef.ref.active },
        replayPolicy: "pure",
        attempt: claim.attempt,
      })
      yield* store.startOperation({ ...claim, operationId: operation.operationId })

      expect((yield* store.getOperation({ runId: receipt.runId, operationId: operation.operationId })).status).toBe(
        "running",
      )
      expect((yield* store.loadExecution(receipt.runId)).executableRef).toEqual(assistantRef.ref)

      const checkpoint = {
        driverVersion: "1" as const,
        executable: researcherRef.ref,
        turn: 1,
        budget: { allocation: {}, remaining: {}, depth: 0 },
        state: {},
      }
      yield* store.completeOperation({
        ...claim,
        operationId: operation.operationId,
        outcome: { _tag: "Succeeded", value: { accepted: true } },
        checkpoint,
      })

      expect((yield* store.getOperation({ runId: receipt.runId, operationId: operation.operationId })).status).toBe(
        "succeeded",
      )
      const committed = yield* store.loadExecution(receipt.runId)
      expect(committed.checkpoint).toEqual(checkpoint)
      expect(committed.executableRef).toEqual(researcherRef.ref)
    }).pipe(
      Effect.provide(
        Runtime.layerMemory({
          resolver: ExecutableResolver.makeStatic([{ executable: assistantRef, agent: closedTestAgent(assistant) }]),
          addresses: [
            {
              address: Address.make("agent:atomic-operation"),
              executable: assistantRef,
              registrations: registrationsFor(assistantRef),
            },
          ],
        }),
      ),
    ),
  )

  it.effect("atomically commits failed, unknown, and suspended execution state", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const checkpoint = {
        driverVersion: "1" as const,
        executable: assistantRef.ref,
        turn: 2,
        budget: { allocation: {}, remaining: {}, depth: 0 },
        state: { committed: true },
      }
      for (const outcome of [{ _tag: "Failed" as const, error: { message: "failed" } }, { _tag: "Unknown" as const }]) {
        const receipt = yield* runtime.send({
          to: Address.make("agent:atomic-operation"),
          sessionId: `session:${outcome._tag}`,
          idempotencyKey: outcome._tag,
          prompt: outcome._tag,
        })
        const claim = yield* store.claimExecution({ runId: receipt.runId, ownerId: "atomic-worker" })
        const operation = yield* store.recordOperation({
          ...claim,
          operationKey: `tool:${outcome._tag}`,
          kind: "tool",
          inputDigest: outcome._tag,
          input: {},
          replayPolicy: "never",
          attempt: claim.attempt,
        })
        yield* store.startOperation({ ...claim, operationId: operation.operationId })
        expect((yield* store.loadExecution(receipt.runId)).checkpoint).toBeUndefined()
        yield* store.completeOperation({ ...claim, operationId: operation.operationId, outcome, checkpoint })
        expect((yield* store.getOperation({ runId: receipt.runId, operationId: operation.operationId })).status).toBe(
          outcome._tag === "Failed" ? "failed" : "unknown",
        )
        expect((yield* store.loadExecution(receipt.runId)).checkpoint).toEqual(checkpoint)
        expect((yield* runtime.inspect(receipt.runId)).status).toBe(
          outcome._tag === "Unknown" ? "needs-resolution" : "running",
        )
      }

      const receipt = yield* runtime.send({
        to: Address.make("agent:atomic-operation"),
        sessionId: "session:suspend",
        idempotencyKey: "suspend",
        prompt: "suspend",
      })
      const claim = yield* store.claimExecution({ runId: receipt.runId, ownerId: "atomic-worker" })
      const suspension = AgentEvent.AgentSuspended.make({
        token: "approval",
        reason: "approval",
        tool_call_id: "approval",
        tool_name: "approve",
        tool_params: {},
        tool_call_batch: [],
      })
      expect((yield* store.loadExecution(receipt.runId)).suspension).toBeUndefined()
      expect((yield* runtime.inspect(receipt.runId)).wait).toBeUndefined()
      yield* store.suspend({
        ...claim,
        suspension,
        checkpoint,
        transcript: Prompt.make("saved transcript"),
        wait: {
          waitId: "approval",
          reason: "approval",
          status: "open",
          openedAt: "2026-08-04T00:00:00.000Z",
        },
      })
      const execution = yield* store.loadExecution(receipt.runId)
      const inspection = yield* runtime.inspect(receipt.runId)
      expect(execution.suspension).toEqual(suspension)
      expect(execution.checkpoint).toEqual(checkpoint)
      expect(execution.transcript).toEqual(Prompt.make("saved transcript"))
      expect(inspection.status).toBe("waiting")
      expect(inspection.wait?.waitId).toBe("approval")
    }).pipe(
      Effect.provide(
        Runtime.layerMemory({
          resolver: ExecutableResolver.makeStatic([{ executable: assistantRef, agent: closedTestAgent(assistant) }]),
          addresses: [
            {
              address: Address.make("agent:atomic-operation"),
              executable: assistantRef,
              registrations: registrationsFor(assistantRef),
            },
          ],
        }),
      ),
    ),
  )

  it.effect("resolves the checkpoint active pin when recovering a Run", () => {
    let admitted: string | undefined
    let seen: string | undefined
    const resolver = ExecutableResolver.ExecutableResolver.of({
      resolve: (input) =>
        isAdmission(input)
          ? Effect.sync(() => {
              admitted = input.ref.active
              return {
                _tag: "Agent" as const,
                agent: closedTestAgent(assistant),
                attestation: { ref: input.ref, manifest: input.manifest },
              }
            })
          : Effect.sync(() => {
              seen = input.ref.active
            }).pipe(Effect.andThen(Errors.ExecutablePinMissing.make({ runId: input.runId, ref: input.ref }))),
    })
    return Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const host = yield* ExecutionHost.ExecutionHost
      const receipt = yield* runtime.send({
        to: Address.make("agent:handoff-recovery"),
        sessionId: "session:handoff-recovery",
        idempotencyKey: "handoff-recovery",
        prompt: "handoff",
      })
      const claim = yield* store.claimExecution({ runId: receipt.runId, ownerId: "handoff-recovery" })
      yield* store.saveExecution({
        ...claim,
        checkpoint: {
          driverVersion: "1",
          executable: researcherRef.ref,
          turn: 1,
          budget: { allocation: {}, remaining: {}, depth: 0 },
          state: {},
        },
      })
      yield* host.execute(claim)
      expect(admitted).toBe(assistantRef.ref.active)
      expect(seen).toBe(researcherRef.ref.active)
    }).pipe(
      Effect.provide(
        Runtime.layerMemory({
          resolver,
          addresses: [
            {
              address: Address.make("agent:handoff-recovery"),
              executable: assistantRef,
              registrations: registrationsFor(assistantRef),
            },
          ],
        }),
      ),
    )
  })
})
