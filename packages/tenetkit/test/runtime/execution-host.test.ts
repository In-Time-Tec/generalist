import { Database } from "bun:sqlite"
import { describe, expect, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Layer, Option, Ref, Schema, Scope, Stream } from "effect"
import { AiError, LanguageModel, Prompt, Response, Tool, Toolkit } from "effect/unstable/ai"
import {
  Agent,
  AgentEvent,
  AgentManifest,
  AgentProgram,
  Compaction,
  ExecutableManifest,
  Pins,
  ProgramBindings,
  ProgramCapabilities,
  SandboxExecutor,
  Session,
  Handoff,
  ToolContext,
  ToolExecutor,
} from "tenetkit"
import { closedTestAgent, pinnedTestAgent, testExecutable } from "./identity.js"
import {
  Address,
  ChildRuns,
  ExecutionHost,
  LocalScheduler,
  Cursor,
  Errors,
  ExecutableRegistration,
  ExecutableResolver,
  Runtime,
  RunStore,
} from "../../src/runtime/index.js"
import { assistant, assistantRef, registrationsFor, researcherRef } from "./helpers.js"
import { provideScoped } from "./scoped-provide.js"
import { tempDbPath } from "./sqlite-helpers.js"

import { Runtime as SqliteRuntime } from "../../src/runtime/sqlite-bun.js"
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

const scopedWith =
  <A, E>(layerValue: Layer.Layer<A, E, never>) =>
  <B, E2, R2 extends A | Scope.Scope>(effect: Effect.Effect<B, E2, R2>) =>
    Effect.scoped(Effect.flatMap(Layer.build(layerValue), (context) => effect.pipe(Effect.provideContext(context))))

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
            const policy = Schema.decodeUnknownOption(ExecutableRegistration.CompactionPolicy)(
              registration?.payload,
            ).pipe(Option.getOrUndefined)
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
                  Compaction.layer({ strategy, keepRecentTokens: policy?.keepRecentTokens ?? 0 }),
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

      yield* scopedWith(runtimeLayer)(
        Effect.gen(function* () {
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
        }),
      )

      expect(observed).toMatchObject({ contextWindow: 32_768, reserveTokens: 2_048 })
      expect(observedKeepRecent).toBe(777)
    }),
  )

  it.effect("keeps a valid conversation after every execution record is dropped", () =>
    Effect.gen(function* () {
      const filename = tempDbPath("session-record-independence")
      const resolver = ExecutableResolver.ExecutableResolver.of({ resolve: () => Effect.die("unused") })
      const layerSqlite = () => SqliteRuntime.layerSqlite({ filename, addresses: [], resolver })
      const user = (text: string) => Prompt.makeMessage("user", { content: [Prompt.makePart("text", { text })] })

      const withSession = <A>(body: (session: Session.Interface) => Effect.Effect<A>) =>
        Effect.scoped(
          Effect.gen(function* () {
            const store = yield* RunStore.RunStore
            const session = yield* store.sessionStore("thread:independence")
            if (Option.isNone(session)) return yield* Effect.die("expected a durable Session")
            return yield* body(session.value)
          }).pipe((effect) => provideScoped(layerSqlite(), effect), Effect.scoped),
        )

      yield* withSession((session) => session.append({ _tag: "Message", message: user("m1") }).pipe(Effect.orDie))
      yield* withSession((session) => session.append({ _tag: "Message", message: user("m2") }).pipe(Effect.orDie))

      // Conversation and execution are separate logs. Dropping the execution journal must leave the
      // conversation whole; if this fails, orchestration state leaked into conversation state.
      const database = new Database(filename)
      for (const table of [
        "tenetkit_run_events",
        "tenetkit_run_operations",
        "tenetkit_run_steering",
        "tenetkit_run_waits",
        "tenetkit_run_links",
        "tenetkit_tree_event_index",
        "tenetkit_run_registrations",
        "tenetkit_runs",
        "tenetkit_lanes",
      ]) {
        database.run(`DELETE FROM ${table}`)
      }
      database.close()

      const path = yield* withSession((session) => session.path().pipe(Effect.orDie))
      expect(path).toHaveLength(2)
      expect(Session.buildContext(path).content).toHaveLength(2)
    }),
  )

  it.effect("round-trips a checkpoint whose telemetry carries absent usage fields", () =>
    Effect.gen(function* () {
      const filename = tempDbPath("session-usage-roundtrip")
      const resolver = ExecutableResolver.ExecutableResolver.of({ resolve: () => Effect.die("unused") })
      const layerSqlite = () => SqliteRuntime.layerSqlite({ filename, addresses: [], resolver })
      const user = (text: string) => Prompt.makeMessage("user", { content: [Prompt.makePart("text", { text })] })

      const withSession = <A>(body: (session: Session.Interface) => Effect.Effect<A>) =>
        Effect.scoped(
          Effect.gen(function* () {
            const store = yield* RunStore.RunStore
            const session = yield* store.sessionStore("thread:usage")
            if (Option.isNone(session)) return yield* Effect.die("expected a durable Session")
            return yield* body(session.value)
          }).pipe((effect) => provideScoped(layerSqlite(), effect), Effect.scoped),
        )

      // A real provider reports partial usage. These fields are UndefinedOr, so the key must survive
      // persistence even when its value is undefined.
      const telemetry = [
        {
          _tag: "ModelAttemptCompleted" as const,
          deliveryId: "delivery-1",
          turn: 0,
          modelCallId: "call-1",
          modelAttemptId: "attempt-1",
          attempt: 0,
          modelId: "test",
          providerId: "test",
          usage: Response.Usage.make({
            inputTokens: { uncached: undefined, total: 5, cacheRead: undefined, cacheWrite: undefined },
            outputTokens: { total: undefined, text: undefined, reasoning: undefined },
          }),
          usageAt: 1,
          finishReason: "stop" as const,
          completedAt: 2,
        },
      ]

      const id = yield* withSession((session) => session.reserveEntryId.pipe(Effect.orDie))
      yield* withSession((session) =>
        session
          .appendCheckpoint({ id, parentId: null, projectedHistory: Prompt.fromMessages([user("kept")]), telemetry })
          .pipe(Effect.orDie),
      )
      const path = yield* withSession((session) => session.path().pipe(Effect.orDie))
      const checkpoint = path.at(-1)

      expect(checkpoint?._tag).toBe("Compaction")
      if (checkpoint?._tag === "Compaction") {
        expect(checkpoint.telemetry).toHaveLength(1)
        expect(Session.buildContext(path).content).toHaveLength(1)
      }
    }),
  )

  it.effect("appends and reads one durable Session across store reopens", () =>
    Effect.gen(function* () {
      const filename = tempDbPath("durable-session-store")
      const resolver = ExecutableResolver.ExecutableResolver.of({ resolve: () => Effect.die("unused") })
      const layerSqlite = () => SqliteRuntime.layerSqlite({ filename, addresses: [], resolver })
      const user = (text: string) => Prompt.makeMessage("user", { content: [Prompt.makePart("text", { text })] })

      const withSession = <A>(body: (session: Session.Interface) => Effect.Effect<A>) =>
        Effect.scoped(
          Effect.gen(function* () {
            const store = yield* RunStore.RunStore
            const session = yield* store.sessionStore("thread:direct")
            if (Option.isNone(session)) return yield* Effect.die("expected a durable Session")
            return yield* body(session.value)
          }).pipe((effect) => provideScoped(layerSqlite(), effect), Effect.scoped),
        )

      const first = yield* withSession((session) =>
        session.append({ _tag: "Message", message: user("m1") }).pipe(Effect.orDie),
      )
      const second = yield* withSession((session) =>
        session.append({ _tag: "Message", message: user("m2") }).pipe(Effect.orDie),
      )
      const path = yield* withSession((session) => session.path().pipe(Effect.orDie))

      expect(first.parentId).toBeNull()
      expect(second.parentId).toBe(first.id)
      expect(path).toHaveLength(2)
      expect(path.map((entry) => entry.id)).toEqual([first.id, second.id])
    }),
  )

  it.effect("continues one durable Session across separate Runs and a store reopen without Compaction", () =>
    Effect.gen(function* () {
      const filename = tempDbPath("durable-session-continuity")
      const prompts: Array<string> = []
      const agent = Agent.make({ name: "durable-session-agent", instructions: "Stay consistent." })
      const model = Pins.makeModel({ model: "conversation", route: "conversation-route:v1" })
      const pinned = AgentManifest.fromLiveAgent(agent, {
        model,
        tools: [],
        skills: [],
        services: [],
        policy: { _tag: "Portable", policy: { _tag: "Forever" } },
        budget: {},
        children: [],
      })
      const executable = ExecutableManifest.make({ root: pinned.pin, entries: [{ _tag: "Agent", ...pinned }] })
      const registrations = [
        { pin: model, codec: "test-model", version: "1", payload: { route: "conversation-route:v1" } },
      ]
      const resolver = ExecutableResolver.ExecutableResolver.of({
        resolve: () =>
          Effect.succeed({
            _tag: "Agent" as const,
            agent: Agent.close(
              agent,
              Layer.effect(
                LanguageModel.LanguageModel,
                LanguageModel.make({
                  generateText: () => Effect.succeed([]),
                  streamText: (options) => {
                    prompts.push(JSON.stringify(options.prompt.content))
                    return Stream.fromIterable<Response.StreamPartEncoded>([
                      Response.makePart("text-start", { id: "text" }),
                      Response.makePart("text-delta", { id: "text", delta: `reply ${prompts.length}` }),
                      Response.makePart("text-end", { id: "text" }),
                      finish,
                    ])
                  },
                }),
              ),
            ),
            attestation: executable,
          }),
      })
      const layerSqlite = () => SqliteRuntime.layerSqlite({ filename, addresses: [], resolver })
      const turn = (idempotencyKey: string, prompt: string) =>
        Effect.scoped(
          Effect.gen(function* () {
            const runtime = yield* Runtime.Runtime
            const receipt = yield* runtime.start({
              executable,
              registrations,
              sessionId: "thread:durable-continuity",
              idempotencyKey,
              prompt,
            })
            const host = yield* ExecutionHost.ExecutionHost
            const store = yield* RunStore.RunStore
            yield* host.execute(yield* store.claimExecution({ runId: receipt.runId, ownerId: idempotencyKey }))
          }).pipe((effect) => provideScoped(layerSqlite(), effect), Effect.scoped),
        )

      yield* turn("turn-1", "first question")
      yield* turn("turn-2", "second question")
      yield* turn("turn-3", "third question")
      expect(prompts).toHaveLength(3)
      expect(prompts[0]).toContain("first question")
      expect(prompts[0]).not.toContain("second question")
      expect(prompts[1]).toContain("first question")
      expect(prompts[1]).toContain("reply 1")
      expect(prompts[1]).toContain("second question")
      expect(prompts[2]).toContain("first question")
      expect(prompts[2]).toContain("reply 1")
      expect(prompts[2]).toContain("second question")
      expect(prompts[2]).toContain("reply 2")
      expect(prompts[2]).toContain("third question")

      const database = new Database(filename)
      const runColumns = database.query<{ name: string }, []>("PRAGMA table_info(tenetkit_runs)").all()
      expect(runColumns.map((column) => column.name)).not.toContain("transcript_json")
      database.exec(`
        PRAGMA foreign_keys = OFF;
        DELETE FROM tenetkit_run_events;
        DELETE FROM tenetkit_run_operations;
        DELETE FROM tenetkit_runs;
      `)
      database.close()

      const projection = yield* Effect.gen(function* () {
        const store = yield* RunStore.RunStore
        const session = yield* store.sessionStore("thread:durable-continuity")
        if (Option.isNone(session)) return yield* Effect.die("expected durable Session")
        return Session.buildContext(yield* session.value.path())
      }).pipe((effect) => provideScoped(layerSqlite(), effect), Effect.scoped)
      expect(projection.content).toHaveLength(6)
      const projectionJson = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(projection.content)
      expect(projectionJson).toContain("first question")
      expect(projectionJson).toContain("reply 2")
      expect(projectionJson).toContain("third question")
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
            const policy = Schema.decodeUnknownOption(ExecutableRegistration.CompactionPolicy)(
              policyRegistration?.payload,
            ).pipe(Option.getOrUndefined)
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
                    keepRecentTokens: policy?.keepRecentTokens ?? 0,
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
      const layerSqlite = () => SqliteRuntime.layerSqlite({ filename, addresses: [], resolver })
      const receipt = yield* scopedWith(layerSqlite())(
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          return yield* runtime.start({
            executable,
            registrations,
            sessionId: "session:sqlite-pinned-compaction",
            idempotencyKey: "sqlite-pinned-compaction",
            prompt: "old context that must be summarized",
          })
        }),
      )
      yield* scopedWith(layerSqlite())(
        Effect.gen(function* () {
          const host = yield* ExecutionHost.ExecutionHost
          const store = yield* RunStore.RunStore
          yield* host.execute(yield* store.claimExecution({ runId: receipt.runId, ownerId: "reopened-compaction" }))
        }),
      )
      const snapshot = yield* scopedWith(layerSqlite())(
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          return yield* runtime.snapshot(receipt.runId)
        }),
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

      yield* scopedWith(runtimeLayer)(
        Effect.gen(function* () {
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
        }),
      )
    }),
  )

  it.effect("releases an abandoned claim only after resolver finalization", () =>
    Effect.gen(function* () {
      const resolving = yield* Deferred.make<void>()
      const finalizing = yield* Deferred.make<void>()
      const finishFinalizer = yield* Deferred.make<void>()
      const finalized = yield* Deferred.make<void>()
      const modelCalls = yield* Ref.make(0)
      const resolverCalls = yield* Ref.make(0)
      const agent = Agent.make({ name: "blocked-resolver" })
      const executable = testExecutable(agent, "blocked-v1")
      const address = Address.make("agent:blocked-resolver")
      const model = Layer.effect(
        LanguageModel.LanguageModel,
        LanguageModel.make({
          generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
          streamText: () =>
            Stream.fromEffect(Ref.update(modelCalls, (count) => count + 1)).pipe(
              Stream.drain,
              Stream.concat(
                Stream.fromIterable<Response.StreamPartEncoded>([
                  Response.makePart("text-delta", { id: "answer", delta: "done" }),
                  finish,
                ]),
              ),
            ),
        }),
      )
      const resolution = { _tag: "Agent" as const, agent: Agent.close(agent, model), attestation: executable }
      const resolver = ExecutableResolver.ExecutableResolver.of({
        resolve: (input) =>
          Effect.gen(function* () {
            if (isAdmission(input)) return resolution
            const call = yield* Ref.getAndUpdate(resolverCalls, (count) => count + 1)
            if (call > 0) return resolution
            yield* Effect.addFinalizer(() =>
              Deferred.succeed(finalizing, undefined).pipe(
                Effect.andThen(Deferred.await(finishFinalizer)),
                Effect.andThen(Deferred.succeed(finalized, undefined)),
              ),
            )
            yield* Deferred.succeed(resolving, undefined)
            return yield* Effect.never
          }),
      })
      const runtimeLayer = Runtime.layerMemory({
        resolver,
        addresses: [{ address, executable, registrations: registrationsFor(executable) }],
        scheduler: { pollInterval: "1 day" },
      })

      yield* scopedWith(runtimeLayer)(
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const host = yield* ExecutionHost.ExecutionHost
          const scheduler = yield* LocalScheduler.LocalScheduler
          const store = yield* RunStore.RunStore
          const receipt = yield* runtime.send({
            to: address,
            sessionId: "session:blocked-resolver",
            idempotencyKey: "blocked-resolver:1",
            prompt: "resolve after recovery",
          })
          const abandoned = yield* store.claimExecution({ runId: receipt.runId, ownerId: "blocked-resolver" })
          const execution = yield* host.execute(abandoned).pipe(Effect.forkChild({ startImmediately: true }))
          yield* Deferred.await(resolving)
          yield* Effect.sync(() => execution.interruptUnsafe())
          yield* Deferred.await(finalizing)
          expect(yield* store.loadExecution(receipt.runId)).toMatchObject({
            ownerId: abandoned.ownerId,
            attemptFence: abandoned.attemptFence,
          })
          yield* Deferred.succeed(finishFinalizer, undefined)
          yield* Fiber.await(execution)
          yield* Deferred.await(finalized)

          expect((yield* runtime.inspect(receipt.runId)).status).toBe("running")
          expect((yield* store.loadExecution(receipt.runId)).ownerId).toBeUndefined()
          expect(yield* Ref.get(modelCalls)).toBe(0)

          const replacement = yield* store.claimExecution({ runId: receipt.runId, ownerId: "replacement" })
          yield* store.releaseExecution(abandoned)
          expect(yield* store.loadExecution(receipt.runId)).toMatchObject({
            ownerId: replacement.ownerId,
            attemptFence: replacement.attemptFence,
          })
          yield* store.releaseExecution(replacement)
          yield* scheduler.tick
          yield* scheduler.idle

          expect((yield* runtime.inspect(receipt.runId)).status).toBe("succeeded")
          expect(yield* store.loadExecution(receipt.runId)).toMatchObject({
            attemptFence: replacement.attemptFence + 1,
          })
          expect((yield* store.loadExecution(receipt.runId)).ownerId).toBeUndefined()
          expect(yield* Ref.get(resolverCalls)).toBe(2)
          expect(yield* Ref.get(modelCalls)).toBe(1)
        }),
      )
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

      yield* scopedWith(
        Runtime.layerMemory({
          resolver,
          addresses: [{ address, executable, registrations: registrationsFor(executable) }],
        }),
      )(
        Effect.gen(function* () {
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
        }),
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
      })

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
      yield* scopedWith(
        Runtime.layerMemory({
          resolver: missing,
          addresses: [{ address, executable, registrations: registrationsFor(executable) }],
        }),
      )(
        verify(
          missing,
          "tenetkit/runtime/ExecutablePinMissing",
          "missing",
          missingFinalized,
          missingAdmissionFinalized,
        ),
      )
      yield* scopedWith(
        Runtime.layerMemory({
          resolver: mismatched,
          addresses: [{ address, executable, registrations: registrationsFor(executable) }],
        }),
      )(
        verify(
          mismatched,
          "tenetkit/runtime/ExecutableIdentityMismatch",
          "mismatch",
          mismatchFinalized,
          mismatchAdmissionFinalized,
        ),
      )
    })
  })

  it.effect("persists operations and resumes a suspended Agent in the same Run", () => {
    let phase: "suspend" | "resume" = "suspend"
    let modelCalls = 0
    let suspensionAtFinalModel: unknown
    let inspectFinalModel: Effect.Effect<void> = Effect.void
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
          const response = Stream.fromIterable<Response.StreamPartEncoded>(
            modelCalls <= 9
              ? [
                  Response.makePart("tool-call", {
                    id: `advance-call-${modelCalls}`,
                    name: "wait_for_human",
                    params: { question: `Advance ${modelCalls}` },
                    providerExecuted: false,
                  }),
                  finish,
                ]
              : modelCalls === 10
                ? [
                    Response.makePart("tool-call", {
                      id: "wait-call-10",
                      name: "wait_for_human",
                      params: { question: "Continue?" },
                      providerExecuted: false,
                    }),
                    finish,
                  ]
                : [Response.makePart("text-delta", { id: "answer", delta: "continued" }), finish],
          )
          return modelCalls === 11
            ? Stream.fromEffect(inspectFinalModel).pipe(Stream.drain, Stream.concat(response))
            : response
        },
      }),
    )
    const executor = ToolExecutor.layerTest({
      execute: (request) =>
        String((request.call.params as { readonly question?: string }).question).startsWith("Advance ") ||
        phase === "resume"
          ? Effect.succeed({ _tag: "Success", result: "approved", encodedResult: "approved" })
          : Effect.succeed({ _tag: "Suspend", token: "approval-token" }),
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

    return scopedWith(runtimeLayer)(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const host = yield* ExecutionHost.ExecutionHost
        const store = yield* RunStore.RunStore
        const receipt = yield* runtime.send({
          to: address,
          sessionId: "session:durable",
          idempotencyKey: "message:1",
          prompt: "Wait and then continue.",
        })
        inspectFinalModel = store.loadExecution(receipt.runId).pipe(
          Effect.tap((execution) =>
            Effect.sync(() => {
              suspensionAtFinalModel = execution.suspension
            }),
          ),
          Effect.asVoid,
          Effect.orDie,
        )
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
        expect(waiting.wait?.waitId).toBe("wait-call-10")
        const persisted = yield* store.loadExecution(receipt.runId)
        expect(persisted.checkpoint !== undefined && "driverVersion" in persisted.checkpoint).toBe(true)
        if (persisted.checkpoint === undefined || !("driverVersion" in persisted.checkpoint)) return
        expect(persisted.checkpoint.driverVersion).toBe("1")
        expect(persisted.checkpoint.turn).toBe(9)
        expect(persisted.checkpoint.executable).toEqual(ref.ref)
        const durableSession = yield* store.sessionStore("session:durable")
        expect(Option.isSome(durableSession)).toBe(true)
        if (Option.isSome(durableSession)) {
          expect(Session.buildContext(yield* durableSession.value.path()).content.length).toBeGreaterThan(0)
        }
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
          waitId: "wait-call-10",
          idempotencyKey: "response:1",
          resolution: { _tag: "ToolResult", result: "approved", encodedResult: "approved" },
        })
        expect((yield* store.loadExecution(receipt.runId)).suspension).toBeDefined()
        const resumeClaim = yield* store.claimExecution({ runId: receipt.runId, ownerId: "memory" })
        yield* host.execute(resumeClaim)

        const completed = yield* runtime.inspect(receipt.runId)
        expect((yield* store.loadExecution(receipt.runId)).suspension).toBeUndefined()
        expect(suspensionAtFinalModel).toMatchObject({ token: "approval-token", tool_call_id: "wait-call-10" })
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
        for (const event of replay.filter((candidate) => candidate._tag === "TurnCompleted"))
          expect(event).not.toHaveProperty("transcript")
        const terminal = replay.find((event) => event._tag === "RunCompleted")
        expect(terminal?._tag === "RunCompleted" ? terminal.result : undefined).toMatchObject({
          session: { sessionId: "session:durable" },
        })
        expect(terminal?._tag === "RunCompleted" ? terminal.result : undefined).not.toHaveProperty("transcript")
        const inlineMessageCounts: Array<number> = []
        for (const event of replay.filter((candidate) => candidate._tag === "ModelResponseCommitted")) {
          if (event._tag !== "ModelResponseCommitted") continue
          const operation = yield* store.getOperationByKey({
            runId: receipt.runId,
            operationKey: event.operationKey,
          })
          if (
            typeof operation?.result === "object" &&
            operation.result !== null &&
            "messages" in operation.result &&
            Array.isArray(operation.result.messages)
          )
            inlineMessageCounts.push(operation.result.messages.length)
        }
        expect(inlineMessageCounts).toEqual([])
        expect(replay.map((event) => event.sequence)).toEqual(replay.map((_, index) => index))
        expect(new Set(replay.map((event) => event.runId))).toEqual(new Set([receipt.runId]))
        expect(
          replay
            .filter((event) => event._tag === "TurnStarted")
            .map((event) => (event._tag === "TurnStarted" ? event.turn : -1)),
        ).toEqual(Array.from({ length: 11 }, (_, turn) => turn))
        const resumedTool = replay.find(
          (event) => event._tag === "ToolExecutionCompleted" && event.call.id === "wait-call-10",
        )
        expect(resumedTool?._tag === "ToolExecutionCompleted" ? resumedTool.turn : undefined).toBe(9)
        const nextCall = replay.find((event) => event._tag === "ModelCallStarted" && event.turn === 10)
        expect(nextCall?._tag === "ModelCallStarted" ? nextCall.turn : undefined).toBe(10)
        expect(modelCalls).toBe(11)
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
      }),
    )
  })

  it.effect("hosts blocking run_child_group across a SQLite reopen and resumes the same Run", () => {
    const filename = tempDbPath("hosted-child-group")
    const address = Address.make("agent:hosted-child-group")
    const advertisedTools: Array<ReadonlyArray<string>> = []
    const prompts: Array<string> = []
    let modelCalls = 0
    const model = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
        streamText: (options) => {
          modelCalls += 1
          advertisedTools.push(options.tools.map((tool) => tool.name))
          prompts.push(JSON.stringify(options.prompt.content))
          return Stream.fromIterable<Response.StreamPartEncoded>(
            modelCalls === 1
              ? [
                  Response.makePart("tool-call", {
                    id: "hosted-group-call",
                    name: ChildRuns.runGroupToolName,
                    params: {
                      concurrency: 2,
                      members: [
                        {
                          key: "research",
                          selection: "researcher",
                          label: "Research card",
                          prompt: "research",
                        },
                        {
                          key: "analysis",
                          selection: "analyst",
                          label: "Analysis card",
                          prompt: "analyze",
                        },
                      ],
                    },
                    providerExecuted: false,
                  }),
                  finish,
                ]
              : [
                  Response.makePart("text-start", { id: "answer" }),
                  Response.makePart("text-delta", { id: "answer", delta: "parent resumed" }),
                  Response.makePart("text-end", { id: "answer" }),
                  finish,
                ],
          )
        },
      }),
    )
    const resolver = ExecutableResolver.makeStatic([{ executable: assistantRef, agent: Agent.close(assistant, model) }])
    const layerSqlite = () =>
      SqliteRuntime.layerSqlite({
        filename,
        resolver,
        addresses: [{ address, executable: assistantRef, registrations: registrationsFor(assistantRef) }],
        scheduler: { pollInterval: "1 day" },
      })

    return Effect.gen(function* () {
      const admitted = yield* Effect.scoped(
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const host = yield* ExecutionHost.ExecutionHost
          const store = yield* RunStore.RunStore
          const parent = yield* runtime.send({
            to: address,
            sessionId: "session:hosted-child-group",
            idempotencyKey: "hosted-child-group",
            prompt: "delegate",
            treePolicy: { maxDepth: 1, maxSubagents: 2 },
          })
          yield* host.execute(yield* store.claimExecution({ runId: parent.runId, ownerId: "parent:first" }))
          expect(yield* runtime.inspect(parent.runId)).toMatchObject({
            status: "waiting",
            wait: { waitId: "hosted-group-call", status: "open" },
          })
          const history = yield* runtime.history({ runId: parent.runId, limit: 100 })
          const fanOut = history.find((event) => event._tag === "FanOutAdmitted")
          if (fanOut?._tag !== "FanOutAdmitted") return yield* Effect.die("hosted child group was not admitted")
          return { parentRunId: parent.runId, fanOutId: fanOut.fanOutId }
        }).pipe((effect) => provideScoped(layerSqlite(), effect), Effect.scoped),
      )

      yield* Effect.scoped(
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const host = yield* ExecutionHost.ExecutionHost
          const store = yield* RunStore.RunStore
          const group = yield* runtime.inspectFanOut(admitted.fanOutId)
          expect(group.members.map(({ key, label, depth }) => ({ key, label, depth }))).toEqual([
            { key: "research", label: "Research card", depth: 1 },
            { key: "analysis", label: "Analysis card", depth: 1 },
          ])
          yield* store.fail({
            ...(yield* store.claimExecution({ runId: group.members[1]!.childRunId, ownerId: "child:analysis" })),
            error: Errors.AgentExecutionFailure.make({ message: "second child failed" }),
          })
          expect((yield* runtime.inspect(admitted.parentRunId)).status).toBe("waiting")
          yield* store.complete({
            ...(yield* store.claimExecution({ runId: group.members[0]!.childRunId, ownerId: "child:research" })),
            result: {
              text: "first child complete",
              turns: 1,
              session: { sessionId: "first-child", leafId: null },
            },
          })
          expect((yield* runtime.inspect(admitted.parentRunId)).status).toBe("running")
          expect((yield* store.loadExecution(admitted.parentRunId)).suspension).toBeDefined()
          yield* host.execute(yield* store.claimExecution({ runId: admitted.parentRunId, ownerId: "parent:resumed" }))
          expect((yield* runtime.inspect(admitted.parentRunId)).status).toBe("succeeded")
          expect((yield* store.loadExecution(admitted.parentRunId)).suspension).toBeUndefined()
          expect((yield* store.snapshot(admitted.parentRunId)).outcome).toMatchObject({
            _tag: "Succeeded",
            result: { text: "parent resumed" },
          })
          const history = yield* runtime.history({ runId: admitted.parentRunId, limit: 200 })
          expect(history.filter((event) => event._tag === "RunWaiting")).toHaveLength(1)
          expect(history.filter((event) => event._tag === "RunResumed")).toHaveLength(1)
        }).pipe((effect) => provideScoped(layerSqlite(), effect), Effect.scoped),
      )

      expect(advertisedTools[0]).toEqual(expect.arrayContaining(["run_child", "run_child_group"]))
      expect(prompts[1]).toContain("first child complete")
      expect(prompts[1]).toContain("second child failed")
      expect(modelCalls).toBe(2)
    })
  })

  it.effect("advertises recursive child tools only while persisted tree capacity remains", () => {
    const ordinaryTool = Tool.make("typescript", {
      parameters: Schema.Struct({ code: Schema.String }),
      success: Schema.String,
    })
    const ordinaryToolkit = Toolkit.make(ordinaryTool)
    const profile = Agent.make({ name: "recursive-profile", toolkit: ordinaryToolkit })
    const pinned = pinnedTestAgent(profile, "recursive-profile-v1", [{ selection: "recursive" }])
    const executable = ExecutableManifest.make({
      root: pinned.pin,
      profiles: [{ selection: "recursive", agent: pinned.pin }],
      entries: [{ _tag: "Agent", ...pinned }],
    })
    const advertisedTools: Array<ReadonlyArray<string>> = []
    const model = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
        streamText: (options) => {
          advertisedTools.push(options.tools.map((tool) => tool.name).toSorted())
          return Stream.make(finish)
        },
      }),
    )
    const environment = Layer.merge(
      model,
      ordinaryToolkit.toLayer({ typescript: () => Effect.die("typescript must not execute") }),
    )
    const runtimeLayer = Runtime.layerMemory({
      resolver: ExecutableResolver.makeStatic([{ executable, agent: Agent.close(profile, environment) }]),
      addresses: [],
      scheduler: { pollInterval: "1 day" },
    })
    return Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const host = yield* ExecutionHost.ExecutionHost
      let sequence = 0
      const root = (treePolicy: { readonly maxDepth: number; readonly maxSubagents: number }) =>
        runtime.start({
          executable,
          registrations: registrationsFor(executable),
          sessionId: `recursive-tools:${sequence}`,
          idempotencyKey: `recursive-tools:${sequence++}`,
          prompt: "run",
          treePolicy,
        })
      const execute = (runId: string) =>
        Effect.flatMap(store.claimExecution({ runId, ownerId: `host:${runId}` }), host.execute)

      const allowed = yield* root({ maxDepth: 2, maxSubagents: 2 })
      const child = yield* runtime.spawn({
        parentRunId: allowed.runId,
        invocationId: "depth-1",
        selection: "recursive",
        prompt: "depth 1",
      })
      const grandchild = yield* runtime.spawn({
        parentRunId: child.runId,
        invocationId: "depth-2",
        selection: "recursive",
        prompt: "depth 2",
      })
      expect(
        (yield* Effect.forEach([allowed.runId, child.runId, grandchild.runId], store.loadExecution)).map(
          ({ depth, executableRef }) => ({ depth, active: executableRef.active }),
        ),
      ).toEqual([
        { depth: 0, active: pinned.pin },
        { depth: 1, active: pinned.pin },
        { depth: 2, active: pinned.pin },
      ])
      yield* execute(allowed.runId)
      yield* execute(child.runId)
      yield* execute(grandchild.runId)

      const disabled = yield* root({ maxDepth: 2, maxSubagents: 0 })
      yield* execute(disabled.runId)

      const exhausted = yield* root({ maxDepth: 2, maxSubagents: 1 })
      yield* runtime.spawn({
        parentRunId: exhausted.runId,
        invocationId: "quota",
        selection: "recursive",
        prompt: "use quota",
      })
      yield* execute(exhausted.runId)

      expect(advertisedTools).toEqual([
        ["run_child", "run_child_group", "typescript"],
        ["run_child", "run_child_group", "typescript"],
        ["typescript"],
        ["typescript"],
        ["typescript"],
      ])
    }).pipe((effect) => provideScoped(runtimeLayer, effect), Effect.scoped)
  })

  it.effect("persists distinct suspension checkpoints when one turn suspends twice after a resume", () => {
    let modelCalls = 0
    const agent = Agent.make({ name: "durable-double-suspension", toolkit: Toolkit.make(waitTool) })
    const ref = testExecutable(agent, "double-suspension-v1")
    const address = Address.make("agent:durable-double-suspension")
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
                    params: { question: "First?" },
                    providerExecuted: false,
                  }),
                  finish,
                ]
              : modelCalls === 2
                ? [
                    Response.makePart("tool-call", {
                      id: "wait-call-2",
                      name: "wait_for_human",
                      params: { question: "Second?" },
                      providerExecuted: false,
                    }),
                    finish,
                  ]
                : modelCalls === 3
                  ? [
                      Response.makePart("tool-call", {
                        id: "wait-call-3",
                        name: "wait_for_human",
                        params: { question: "Third?" },
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
      execute: (request) =>
        (request.call.params as { readonly question?: string }).question === "First?"
          ? Effect.succeed({ _tag: "Success", result: "first", encodedResult: "first" })
          : Effect.succeed({ _tag: "Suspend", token: `token:${request.call.id}` }),
    })
    const handlers = Toolkit.make(waitTool).toLayer({
      wait_for_human: () => Effect.die("ToolExecutor test layer owns execution"),
    })
    const resolver = ExecutableResolver.ExecutableResolver.of({
      resolve: () =>
        Effect.succeed({
          _tag: "Agent" as const,
          agent: Agent.close(agent, Layer.mergeAll(model, executor, handlers)),
          attestation: ref,
        }),
    })
    const runtimeLayer = Runtime.layerMemory({
      resolver,
      addresses: [{ address, executable: ref, registrations: registrationsFor(ref) }],
      scheduler: { pollInterval: "1 day" },
    })

    return Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const host = yield* ExecutionHost.ExecutionHost
      const store = yield* RunStore.RunStore
      const receipt = yield* runtime.send({
        to: address,
        sessionId: "session:double-suspension",
        idempotencyKey: "message:double-suspension",
        prompt: "Wait twice and continue.",
      })
      const execute = (ownerId: string) =>
        store.claimExecution({ runId: receipt.runId, ownerId }).pipe(Effect.flatMap((claim) => host.execute(claim)))

      yield* execute("first")
      expect(yield* runtime.inspect(receipt.runId)).toMatchObject({
        status: "waiting",
        wait: { waitId: "wait-call-2" },
      })
      yield* runtime.respond({
        runId: receipt.runId,
        waitId: "wait-call-2",
        idempotencyKey: "response:first",
        resolution: { _tag: "ToolResult", result: "second", encodedResult: "second" },
      })
      yield* execute("second")
      expect(yield* runtime.inspect(receipt.runId)).toMatchObject({
        status: "waiting",
        wait: { waitId: "wait-call-3" },
      })
      yield* runtime.respond({
        runId: receipt.runId,
        waitId: "wait-call-3",
        idempotencyKey: "response:second",
        resolution: { _tag: "ToolResult", result: "third", encodedResult: "third" },
      })

      yield* execute("third")
      expect(yield* runtime.inspect(receipt.runId)).toMatchObject({ status: "succeeded" })
      expect(modelCalls).toBe(4)
    }).pipe(scopedWith(runtimeLayer))
  })

  it.effect("preserves structured run-budget exhaustion details", () => {
    const agent = Agent.make({ name: "budget-exhausted", budget: { modelCalls: 0 } })
    const ref = testExecutable(agent, "budget-exhausted-v1")
    const address = Address.make("agent:budget-exhausted")
    const resolver = ExecutableResolver.makeStatic([{ executable: ref, agent: closedTestAgent(agent) }])
    const runtimeLayer = Runtime.layerMemory({
      resolver,
      addresses: [{ address, executable: ref, registrations: registrationsFor(ref) }],
      scheduler: { pollInterval: "1 day" },
    })

    return Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const host = yield* ExecutionHost.ExecutionHost
      const store = yield* RunStore.RunStore
      const receipt = yield* runtime.send({
        to: address,
        sessionId: "session:budget-exhausted",
        idempotencyKey: "message:budget-exhausted",
        prompt: "run",
      })
      yield* host.execute(yield* store.claimExecution({ runId: receipt.runId, ownerId: "budget" }))
      const history = yield* store.history({ runId: receipt.runId, cursor: Cursor.origin, limit: 100 })
      const failed = history.find((event) => event._tag === "RunFailed")
      expect(failed?._tag).toBe("RunFailed")
      if (failed?._tag !== "RunFailed") return expect.unreachable()
      expect(failed.error).toMatchObject({
        _tag: "tenetkit/runtime/AgentExecutionFailure",
        message: expect.stringMatching(/\S/),
        failure: {
          _tag: "tenetkit/core/RunBudgetExhausted",
          dimension: "modelCalls",
          requested: 1,
          remaining: 0,
        },
      })
    }).pipe(scopedWith(runtimeLayer))
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
      yield* scopedWith(runtimeLayer)(
        Effect.gen(function* () {
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
        }),
      )
    }),
  )

  it.live("keeps a host-interrupted never-replay model operation in needs-resolution after reopen", () =>
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
      const runId = yield* scopedWith(
        SqliteRuntime.layerSqlite({
          filename,
          resolver: firstResolver,
          addresses: [{ address, executable, registrations: registrationsFor(executable) }],
          scheduler: { pollInterval: "1 hour" },
        }),
      )(
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
        }),
      )

      let recoveredModelCalls = 0
      const recoveredModel = Layer.effect(
        LanguageModel.LanguageModel,
        LanguageModel.make({
          generateText: () => Effect.never,
          streamText: () => {
            recoveredModelCalls += 1
            return Stream.never
          },
        }),
      )
      const secondResolver = ExecutableResolver.makeStatic([{ executable, agent: Agent.close(agent, recoveredModel) }])
      yield* scopedWith(
        SqliteRuntime.layerSqlite({
          filename,
          resolver: secondResolver,
          addresses: [{ address, executable, registrations: registrationsFor(executable) }],
          scheduler: { pollInterval: "1 hour" },
        }),
      )(
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          expect((yield* runtime.inspect(runId)).status).toBe("needs-resolution")
          const history = yield* runtime.history({ runId, limit: 100 })
          expect(history.map((event) => event._tag)).toContain("OperationUnknown")
          expect(history.map((event) => event._tag)).not.toContain("RunFailed")
          expect(recoveredModelCalls).toBe(0)
        }),
      )
    }),
  )

  it.effect("interrupts active tool execution while preserving uncertainty", () =>
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
            const context0 = yield* Effect.context<never>()
            context.signal.addEventListener("abort", () => {
              Effect.runSyncWith(context0)(Ref.set(interrupted, true))
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
      yield* scopedWith(runtimeLayer)(
        Effect.gen(function* () {
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
            operationKey: `${receipt.runId}:tool:0:block-1:block`,
            idempotencyKey: `${receipt.runId}:tool:0:block-1:block`,
            attempt: 1,
            admittedAt: expect.any(String),
            sessionId: "session:cancel-tool",
          })
          yield* runtime.cancel({ runId: receipt.runId, reason: "stop" })
          const exit = yield* Fiber.await(fiber)
          expect(exit._tag).toBe("Success")
          expect((yield* runtime.inspect(receipt.runId)).status).toBe("cancelled")
          expect(yield* Ref.get(interrupted)).toBe(true)
          const unknown = (yield* runtime.history({ runId: receipt.runId, cursor: -1, limit: 100 })).find(
            (event) => event._tag === "OperationUnknown",
          )
          if (unknown?._tag !== "OperationUnknown") return yield* Effect.die("unknown operation event missing")
          expect((yield* store.getOperation({ runId: receipt.runId, operationId: unknown.operationId })).status).toBe(
            "unknown",
          )
          expect(
            (yield* runtime.history({ runId: receipt.runId, cursor: -1, limit: 100 })).map((event) => event._tag),
          ).not.toContain("RunFailed")
        }),
      )
    }),
  )

  for (const backend of ["memory", "sqlite"] as const) {
    it.live(`${backend} records an interrupted external tool effect as unknown while cancellation settles`, () =>
      Effect.gen(function* () {
        const started = yield* Deferred.make<void>()
        const toolFinalized = yield* Deferred.make<void>()
        const lifecycle: Array<string> = []
        let externalCounter = 0
        const tool = Tool.make("external_counter", { parameters: Schema.Struct({}), success: Schema.Finite })
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
            : SqliteRuntime.layerSqlite({
                filename,
                resolver,
                addresses: [{ address, executable, registrations: registrationsFor(executable) }],
              })

        const first = yield* scopedWith(layer())(
          Effect.gen(function* () {
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
              operationKey: `${receipt.runId}:tool:0:external-counter-1:external_counter`,
            })
            expect(persistedTool?.status).toBe("unknown")
            const unknown = (yield* runtime.history({ runId: receipt.runId, cursor: -1, limit: 100 })).find(
              (event) => event._tag === "OperationUnknown",
            )
            expect(unknown?._tag).toBe("OperationUnknown")
            expect((yield* runtime.inspect(receipt.runId)).status).toBe("cancelled")
            if (unknown?._tag !== "OperationUnknown") return yield* Effect.die("unknown operation event missing")
            const operation = yield* store.getOperation({ runId: receipt.runId, operationId: unknown.operationId })
            expect(operation.status).toBe("unknown")
            expect(operation.replayPolicy).toBe("never")
            return { runId: receipt.runId, operationId: operation.operationId }
          }),
        )

        if (backend === "sqlite") {
          yield* scopedWith(layer())(
            Effect.gen(function* () {
              const runtime = yield* Runtime.Runtime
              const store = yield* RunStore.RunStore
              expect((yield* runtime.inspect(first.runId)).status).toBe("cancelled")
              expect((yield* store.getOperation({ runId: first.runId, operationId: first.operationId })).status).toBe(
                "unknown",
              )
              expect(externalCounter).toBe(1)
            }),
          )
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
      expect(stale._tag).toBe("tenetkit/runtime/StaleClaim")
      const staleRecovery = yield* store
        .expireRunningOperation({
          ...first,
          operationId: operation.operationId,
        })
        .pipe(Effect.flip)
      expect(staleRecovery._tag).toBe("tenetkit/runtime/StaleClaim")
      expect((yield* store.getOperation({ runId: receipt.runId, operationId: operation.operationId })).status).toBe(
        "running",
      )
    }).pipe(
      scopedWith(
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
      scopedWith(
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

  it.effect("atomically imports memory handoff projections with exact retry and divergent rollback", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const receipt = yield* runtime.send({
        to: Address.make("agent:atomic-operation"),
        sessionId: "session:memory-handoff-projection",
        idempotencyKey: "memory-handoff-projection",
        prompt: "supervisor sentinel",
      })
      const claim = yield* store.claimExecution({ runId: receipt.runId, ownerId: "atomic-worker" })
      const operationKey = "handoff:memory-projection"
      const operation = yield* store.recordOperation({
        ...claim,
        operationKey,
        kind: "handoff",
        inputDigest: "handoff:memory-projection",
        input: { targetAgentPin: researcherRef.ref.active },
        replayPolicy: "pure",
        attempt: claim.attempt,
      })
      yield* store.startOperation({ ...claim, operationId: operation.operationId })
      const projectedHistory = Prompt.make("projected-for-specialist")
      const commit: Handoff.HandoffCommit = {
        _tag: "HandoffCommit",
        state: {
          root: assistant.name,
          active: "specialist",
          path: [{ handoffId: operationKey, source: assistant.name, target: "specialist", turn: 0 }],
          edgeCounts: [{ source: assistant.name, target: "specialist", count: 1 }],
          handoffCount: 1,
          pendingContinuation: { prompt: Prompt.make("continue") },
        },
        sessionEntryId: `${operationKey}:session-projection`,
        sessionParentId: null,
        projectedHistory,
        targetAgentPin: researcherRef.ref.active as NonNullable<Handoff.HandoffCommit["targetAgentPin"]>,
      }
      const checkpoint = {
        driverVersion: "1" as const,
        executable: researcherRef.ref,
        turn: 1,
        budget: { allocation: {}, remaining: {}, depth: 0 },
        state: {},
      }
      const completion = {
        ...claim,
        operationId: operation.operationId,
        outcome: { _tag: "Succeeded" as const, value: commit },
        checkpoint,
      }
      const invalidProjection = yield* store
        .completeOperation({
          ...completion,
          outcome: {
            _tag: "Succeeded",
            value: {
              ...commit,
              projectedHistory: Prompt.fromMessages([Prompt.makeMessage("system", { content: "must not persist" })]),
            },
          },
        })
        .pipe(Effect.flip)
      expect(invalidProjection).toBeInstanceOf(Errors.RuntimeUnavailable)
      expect((yield* store.getOperation({ runId: receipt.runId, operationId: operation.operationId })).status).toBe(
        "running",
      )
      expect((yield* store.loadExecution(receipt.runId)).executableRef).toEqual(assistantRef.ref)
      yield* store.completeOperation(completion)
      yield* store.completeOperation(completion)
      const session = yield* store.sessionStore("session:memory-handoff-projection")
      if (Option.isNone(session)) return yield* Effect.die("expected memory Session")
      yield* session.value.append({ _tag: "Message", message: Prompt.make("descendant").content[0]! })
      yield* store.completeOperation(completion)
      const beforeDivergence = yield* session.value.path()
      const divergentCheckpoint = yield* store
        .completeOperation({ ...completion, checkpoint: { ...checkpoint, state: { divergent: true } } })
        .pipe(Effect.flip)
      expect(divergentCheckpoint).toBeInstanceOf(Errors.RuntimeUnavailable)
      const divergent = yield* store
        .completeOperation({
          ...completion,
          outcome: {
            _tag: "Succeeded",
            value: { ...commit, projectedHistory: Prompt.make("divergent projection") },
          },
        })
        .pipe(Effect.flip)
      expect(divergent).toBeInstanceOf(Errors.RuntimeUnavailable)
      expect(yield* session.value.path()).toEqual(beforeDivergence)
      expect(Session.buildContext(beforeDivergence)).toEqual(Prompt.concat(projectedHistory, Prompt.make("descendant")))
      expect((yield* store.loadExecution(receipt.runId)).executableRef).toEqual(researcherRef.ref)
    }).pipe(
      scopedWith(
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
        wait: {
          waitId: "approval",
          reason: {
            _tag: "Approval",
            request: { approvalId: "approval", operation: "approval", capability: "test", input: {} },
          },
          status: "open",
          openedAt: "2026-08-04T00:00:00.000Z",
        },
      })
      const execution = yield* store.loadExecution(receipt.runId)
      const inspection = yield* runtime.inspect(receipt.runId)
      expect(execution.suspension).toEqual(suspension)
      expect(execution.checkpoint).toEqual(checkpoint)
      expect(inspection.status).toBe("waiting")
      expect(inspection.wait?.waitId).toBe("approval")
    }).pipe(
      scopedWith(
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

  for (const earlyFailure of [
    {
      name: "resolver failure",
      expectedTag: "tenetkit/runtime/ExecutablePinMissing",
      expectedMessage: undefined,
      opensService: false,
    },
    {
      name: "executable identity mismatch",
      expectedTag: "tenetkit/runtime/ExecutableIdentityMismatch",
      expectedMessage: undefined,
      opensService: false,
    },
    {
      name: "compaction-options mismatch",
      expectedTag: "tenetkit/runtime/AgentExecutionFailure",
      expectedMessage: "Resolved compaction options do not match Agent manifest",
      opensService: true,
    },
    {
      name: "undecodable persisted resume suspension",
      expectedTag: "tenetkit/runtime/AgentExecutionFailure",
      expectedMessage: "Persisted suspension could not be decoded",
      opensService: true,
    },
  ] as const) {
    it.effect(`defers Program map child ${earlyFailure.name} until scoped finalizers close`, () => {
      let childRunId = ""
      let store: RunStore.Interface
      let bindingDispatches = 0
      let modelCalls = 0
      let serviceAcquisitions = 0
      const finalizerObservations: Array<{
        readonly name: "service" | "resolver"
        readonly status: string
        readonly eventTags: ReadonlyArray<string>
      }> = []
      const observeFinalizer = (name: "service" | "resolver") =>
        Effect.gen(function* () {
          const inspection = yield* store.inspect(childRunId)
          const history = yield* store.history({ runId: childRunId, cursor: Cursor.origin, limit: 100 })
          finalizerObservations.push({
            name,
            status: inspection.status,
            eventTags: history.map((event) => event._tag),
          })
        }).pipe(Effect.orDie)

      const child = Agent.make({ name: `early-failure-child:${earlyFailure.name}` })
      const pinnedChild = pinnedTestAgent(child, `early-failure-child:${earlyFailure.name}:v1`)
      const modelService = LanguageModel.make({
        generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
        streamText: () => {
          modelCalls += 1
          return Stream.fromIterable<Response.StreamPartEncoded>([finish])
        },
      })
      const model = Layer.effect(
        LanguageModel.LanguageModel,
        Effect.acquireRelease(
          Effect.sync(() => {
            serviceAcquisitions += 1
          }).pipe(Effect.andThen(modelService)),
          () => observeFinalizer("service"),
        ),
      )
      const closedChild = Agent.close(child, model)
      const program = AgentProgram.make({
        name: `early-failure-map:${earlyFailure.name}`,
        source: "return await agent.map('workers')",
        sandbox: Pins.makeCapability({ sandbox: `early-failure-map:${earlyFailure.name}:v1` }),
        input: Prompt.Prompt,
        inputPin: Pins.makeCapability({ codec: "prompt-v1" }),
        output: Schema.Array(Schema.String),
        outputPin: Pins.makeCapability({ codec: "strings-v1" }),
        tools: [],
        agents: [
          {
            selection: "worker",
            agent: pinnedChild.pin,
            input: Pins.makeCapability({ codec: "string-v1" }),
          },
        ],
        steps: [],
        budget: {
          agentRuns: 1,
          concurrency: 1,
          toolCalls: 0,
          tokens: 100,
          wallClockMillis: 10_000,
          logBytes: 100,
          outputBytes: 1_000,
        },
      })
      const executable = ExecutableManifest.make({
        root: program.pinned.pin,
        entries: [
          { _tag: "Program", ...program.pinned },
          { _tag: "Agent", ...pinnedChild },
        ],
      })
      const childExecutable = {
        ref: { executable: executable.ref.executable, active: pinnedChild.pin },
        manifest: executable.manifest,
      }
      const mismatchedExecutable = testExecutable(
        Agent.make({ name: `wrong-child:${earlyFailure.name}` }),
        `wrong-child:${earlyFailure.name}:v1`,
      )
      const bindings = ProgramBindings.make({
        tools: [],
        steps: [],
        agents: [
          ProgramBindings.agent({
            selection: "worker",
            agent: pinnedChild.pin,
            inputPin: program.pinned.manifest.capabilities.agents[0]!.input,
            input: Schema.String,
            replay: "non-idempotent",
            authorize: () => Effect.succeed(true),
            execute: () =>
              Effect.sync(() => {
                bindingDispatches += 1
                return { text: "binding must not execute", turns: 0, tokenUsage: { input: 0, output: 0 } }
              }),
          }),
        ],
      })
      const sandbox = SandboxExecutor.makeTest(
        () =>
          Effect.gen(function* () {
            const capabilities = yield* ProgramCapabilities.ProgramCapabilities
            const results = yield* capabilities.mapAgents({
              operation: "workers",
              selection: "worker",
              members: [{ member: "only", input: "perform child work" }],
            })
            return results.map((member) => member.result.text)
          }),
        { ...SandboxExecutor.testIdentity, fixture: `early-failure-map:${earlyFailure.name}` },
      )
      const staticResolver = ExecutableResolver.makeStatic([
        { _tag: "Program", executable, program, sandbox, bindings },
        { _tag: "Agent", executable: childExecutable, agent: closedChild },
      ])
      const resolver = ExecutableResolver.ExecutableResolver.of({
        resolve: (input) => {
          const resolution = staticResolver.resolve(input)
          if (input.runId === "pending" || input.ref.active !== pinnedChild.pin) return resolution
          const finalized = Effect.addFinalizer(() => observeFinalizer("resolver"))
          if (earlyFailure.name === "resolver failure") {
            return finalized.pipe(
              Effect.andThen(Errors.ExecutablePinMissing.make({ runId: input.runId, ref: input.ref })),
            )
          }
          if (earlyFailure.name === "executable identity mismatch") {
            return finalized.pipe(
              Effect.andThen(resolution),
              Effect.map((resolved) => ({ ...resolved, attestation: mismatchedExecutable })),
            )
          }
          if (earlyFailure.name === "compaction-options mismatch") {
            return finalized.pipe(
              Effect.andThen(resolution),
              Effect.map((resolved) =>
                resolved._tag === "Agent"
                  ? {
                      ...resolved,
                      runOptions: { compaction: { contextWindow: 32_768, reserveTokens: 2_048 } },
                    }
                  : resolved,
              ),
            )
          }
          return finalized.pipe(Effect.andThen(resolution))
        },
      })
      const address = Address.make(`program:early-failure-map:${earlyFailure.name}`)

      return scopedWith(
        Runtime.layerMemory({
          resolver,
          addresses: [{ address, executable, registrations: registrationsFor(executable) }],
          scheduler: { pollInterval: "1 day" },
        }),
      )(
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const host = yield* ExecutionHost.ExecutionHost
          store = yield* RunStore.RunStore
          const parent = yield* runtime.send({
            to: address,
            sessionId: `session:early-failure-map:${earlyFailure.name}`,
            idempotencyKey: `early-failure-map:${earlyFailure.name}`,
            prompt: "run the worker map",
          })
          yield* host.execute(yield* store.claimExecution({ runId: parent.runId, ownerId: "program-parent" }))

          const operation = yield* store.getProgramOperation({ runId: parent.runId, operation: "workers" })
          expect(operation).toMatchObject({
            kind: "agent-map",
            status: "waiting",
            childRunIds: [expect.any(String)],
          })
          if (operation === undefined || operation.childRunIds.length !== 1) {
            return yield* Effect.die("ProgramHost did not admit exactly one owned Agent child")
          }
          childRunId = operation.childRunIds[0]!
          const childExecution = yield* store.loadExecution(childRunId)
          expect(childExecution).toMatchObject({
            parentRunId: parent.runId,
            message: { metadata: { programOperation: "workers" } },
          })
          expect((yield* runtime.inspect(childRunId)).status).toBe("queued")
          expect(operation.childRunIds).toContain(childRunId)

          if (earlyFailure.name === "undecodable persisted resume suspension") {
            const preparationClaim = yield* store.claimExecution({ runId: childRunId, ownerId: "suspension-preparer" })
            yield* store.suspend({
              ...preparationClaim,
              suspension: { malformed: true } as never,
              wait: {
                waitId: "malformed-resume",
                reason: { _tag: "ToolWait" },
                status: "open",
                openedAt: "2026-08-05T00:00:00.000Z",
              },
            })
            expect((yield* store.loadExecution(childRunId)).suspension).toEqual({ malformed: true })
            yield* runtime.respond({
              runId: childRunId,
              waitId: "malformed-resume",
              idempotencyKey: "malformed-resume",
              resolution: { _tag: "ToolResult", result: "unused", encodedResult: "unused" },
            })
            expect((yield* runtime.inspect(childRunId)).status).toBe("running")
          }

          yield* host.execute(yield* store.claimExecution({ runId: childRunId, ownerId: "program-child" }))

          expect(finalizerObservations.map((observation) => observation.name)).toEqual(
            earlyFailure.opensService ? ["service", "resolver"] : ["resolver"],
          )
          for (const observation of finalizerObservations) {
            expect(observation.status).toBe("running")
            expect(observation.eventTags).not.toContain("RunFailed")
            expect(observation.eventTags).not.toContain("RunCompleted")
            expect(observation.eventTags).not.toContain("RunCancelled")
          }
          expect(serviceAcquisitions).toBe(earlyFailure.opensService ? 1 : 0)
          expect(modelCalls).toBe(0)
          expect(bindingDispatches).toBe(0)

          expect((yield* runtime.inspect(childRunId)).status).toBe("failed")
          const history = yield* runtime.history({ runId: childRunId, limit: 100 })
          const terminalEvents = history.filter(
            (event) => event._tag === "RunFailed" || event._tag === "RunCompleted" || event._tag === "RunCancelled",
          )
          expect(terminalEvents).toHaveLength(1)
          const failed = terminalEvents[0]
          expect(failed?._tag).toBe("RunFailed")
          if (failed?._tag !== "RunFailed") return yield* Effect.die("Program Agent child did not fail")
          expect(failed.error._tag).toBe(earlyFailure.expectedTag)
          if (earlyFailure.expectedMessage !== undefined) {
            expect(failed.error.message).toBe(earlyFailure.expectedMessage)
          }
        }),
      )
    })
  }

  for (const backend of ["memory", "sqlite"] as const) {
    it.effect(`${backend} finalizes a real Program map child before its RunFailed commit`, () => {
      let modelCalls = 0
      let childDispatches = 0
      let bindingDispatches = 0
      let sandboxCalls = 0
      let childRunId = ""
      let store: RunStore.Interface
      const providerRequests: Array<string> = []
      const finalizerObservations: Array<{
        readonly name: "service" | "resolver"
        readonly runStatus: string
        readonly operationStatus: string | undefined
        readonly eventTags: ReadonlyArray<string>
      }> = []
      const failedOperationKey = (runId: string) => `${runId}:model:1:1:conversation`
      const observeFinalizer = (name: "service" | "resolver", runId: string) =>
        Effect.gen(function* () {
          const inspection = yield* store.inspect(runId)
          const operation = yield* store.getOperationByKey({
            runId,
            operationKey: failedOperationKey(runId),
          })
          const history = yield* store.history({ runId, cursor: Cursor.origin, limit: 200 })
          finalizerObservations.push({
            name,
            runStatus: inspection.status,
            operationStatus: operation?.status,
            eventTags: history.map((event) => event._tag),
          })
        }).pipe(Effect.orDie)

      const childWork = Tool.make("child_work", { parameters: Schema.Struct({}), success: Schema.String })
      const toolkit = Toolkit.make(childWork)
      const child = Agent.make({ name: "failed-program-child", toolkit })
      const pinnedChild = pinnedTestAgent(child, "failed-program-child-v1")
      const escaped = AiError.make({
        module: "FailedProgramChildModel",
        method: "streamText",
        reason: AiError.RateLimitError.make({}),
      })
      const modelService = LanguageModel.make({
        generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
        streamText: (request) => {
          modelCalls += 1
          providerRequests.push(JSON.stringify(request.prompt.content))
          if (modelCalls === 1) {
            return Stream.fromIterable<Response.StreamPartEncoded>([
              Response.makePart("tool-call", {
                id: "child-work-1",
                name: "child_work",
                params: {},
                providerExecuted: false,
              }),
              finish,
            ])
          }
          const partial: Stream.Stream<Response.StreamPartEncoded, AiError.AiError> = Stream.make(
            Response.makePart("text-delta", { id: "failed-child", delta: "discard me" }),
          )
          return partial.pipe(Stream.concat(Stream.fail(escaped)))
        },
      })
      const model = Layer.effect(
        LanguageModel.LanguageModel,
        Effect.acquireRelease(modelService, () => observeFinalizer("service", childRunId)),
      )
      const executor = ToolExecutor.layerTest({
        execute: () =>
          Effect.sync(() => {
            childDispatches += 1
            return { _tag: "Success" as const, result: "child complete", encodedResult: "child complete" }
          }),
      })
      const handlers = toolkit.toLayer({ child_work: () => Effect.die("ToolExecutor owns child work") })
      const closedChild = Agent.close(child, Layer.mergeAll(model, executor, handlers))

      const program = AgentProgram.make({
        name: "failed-agent-map",
        source: "return await agent.map('workers')",
        sandbox: Pins.makeCapability({ sandbox: "failed-agent-map-v1" }),
        input: Prompt.Prompt,
        inputPin: Pins.makeCapability({ codec: "prompt-v1" }),
        output: Schema.Array(Schema.String),
        outputPin: Pins.makeCapability({ codec: "strings-v1" }),
        tools: [],
        agents: [
          {
            selection: "worker",
            agent: pinnedChild.pin,
            input: Pins.makeCapability({ codec: "string-v1" }),
          },
        ],
        steps: [],
        budget: {
          agentRuns: 1,
          concurrency: 1,
          toolCalls: 0,
          tokens: 100,
          wallClockMillis: 10_000,
          logBytes: 100,
          outputBytes: 1_000,
        },
      })
      const executable = ExecutableManifest.make({
        root: program.pinned.pin,
        entries: [
          { _tag: "Program", ...program.pinned },
          { _tag: "Agent", ...pinnedChild },
        ],
      })
      const childExecutable = {
        ref: { executable: executable.ref.executable, active: pinnedChild.pin },
        manifest: executable.manifest,
      }
      const bindings = ProgramBindings.make({
        tools: [],
        steps: [],
        agents: [
          ProgramBindings.agent({
            selection: "worker",
            agent: pinnedChild.pin,
            inputPin: program.pinned.manifest.capabilities.agents[0]!.input,
            input: Schema.String,
            replay: "non-idempotent",
            authorize: () => Effect.succeed(true),
            execute: () =>
              Effect.sync(() => {
                bindingDispatches += 1
                return { text: "wrong", turns: 0, tokenUsage: { input: 0, output: 0 } }
              }),
          }),
        ],
      })
      const sandbox = SandboxExecutor.makeTest(
        () =>
          Effect.gen(function* () {
            yield* Effect.sync(() => void ++sandboxCalls)
            const host = yield* ProgramCapabilities.ProgramCapabilities
            const results = yield* host.mapAgents({
              operation: "workers",
              selection: "worker",
              members: [{ member: "only", input: "perform child work" }],
            })
            return results.map((member) => `${member.member}:${member.result.text}`)
          }),
        { ...SandboxExecutor.testIdentity, fixture: "failed-agent-map" },
      )
      const staticResolver = ExecutableResolver.makeStatic([
        { _tag: "Program", executable, program, sandbox, bindings },
        { _tag: "Agent", executable: childExecutable, agent: closedChild },
      ])
      const resolver = ExecutableResolver.ExecutableResolver.of({
        resolve: (input) =>
          staticResolver
            .resolve(input)
            .pipe(
              Effect.tap(() =>
                input.ref.active === pinnedChild.pin
                  ? Effect.addFinalizer(() => observeFinalizer("resolver", input.runId))
                  : Effect.void,
              ),
            ),
      })
      const address = Address.make("program:failed-agent-map")
      const options = {
        resolver,
        addresses: [{ address, executable, registrations: registrationsFor(executable) }],
        scheduler: { pollInterval: "1 day" as const },
      }

      return scopedWith(
        backend === "memory"
          ? Runtime.layerMemory(options)
          : SqliteRuntime.layerSqlite({ ...options, filename: tempDbPath(`failed-agent-map-${backend}`) }),
      )(
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const host = yield* ExecutionHost.ExecutionHost
          store = yield* RunStore.RunStore
          const receipt = yield* runtime.send({
            to: address,
            sessionId: `session:failed-agent-map:${backend}`,
            idempotencyKey: "failed-agent-map",
            prompt: "run the worker map",
          })
          yield* host.execute(yield* store.claimExecution({ runId: receipt.runId, ownerId: "program-parent" }))

          const admitted = yield* store.getProgramOperation({ runId: receipt.runId, operation: "workers" })
          expect((yield* runtime.inspect(receipt.runId)).status).toBe("waiting")
          expect(admitted).toMatchObject({
            kind: "agent-map",
            status: "waiting",
            childRunIds: [expect.any(String)],
          })
          if (admitted?.fanOutId === undefined || admitted.childRunIds.length !== 1) {
            return yield* Effect.die("ProgramHost did not admit exactly one map child")
          }
          childRunId = admitted.childRunIds[0]!
          const fanOutId = admitted.fanOutId
          expect(yield* runtime.inspectFanOut(fanOutId)).toMatchObject({
            status: "running",
            members: [{ key: "only", childRunId, status: "running" }],
          })

          yield* host.execute(yield* store.claimExecution({ runId: childRunId, ownerId: "program-child" }))

          expect(finalizerObservations.map((observation) => observation.name)).toEqual(["service", "resolver"])
          for (const observation of finalizerObservations) {
            expect(observation.runStatus).toBe("running")
            expect(observation.operationStatus).toBe("running")
            expect(observation.eventTags).not.toContain("ModelResponseInterrupted")
            expect(observation.eventTags).not.toContain("RunFailed")
          }
          expect((yield* runtime.inspect(childRunId)).status).toBe("failed")
          expect(childDispatches).toBe(1)
          expect(modelCalls).toBe(2)
          expect(providerRequests.filter((request) => request.includes("child complete"))).toHaveLength(1)
          expect(providerRequests[1]).toContain("child complete")

          const childHistory = yield* runtime.history({ runId: childRunId, limit: 200 })
          expect(
            childHistory.filter((event) => event._tag === "RunAttemptStarted").map((event) => event.attempt),
          ).toEqual([1])
          const interruptedIndex = childHistory.findIndex((event) => event._tag === "ModelResponseInterrupted")
          const failedIndex = childHistory.findIndex((event) => event._tag === "RunFailed")
          expect(interruptedIndex).toBeGreaterThan(-1)
          expect(interruptedIndex).toBeLessThan(failedIndex)
          expect(childHistory[interruptedIndex]).toMatchObject({
            operationKey: failedOperationKey(childRunId),
            reason: "failure",
          })
          const interruptedEvent = childHistory[interruptedIndex]
          if (interruptedEvent?._tag !== "ModelResponseInterrupted") {
            return yield* Effect.die("Program child did not persist its interrupted response")
          }
          const interruptedEntry = yield* runtime.sessionEntry({
            sessionId: interruptedEvent.sessionId,
            entryId: interruptedEvent.sessionEntryId,
          })
          expect(
            interruptedEntry._tag === "ModelResponse" &&
              interruptedEntry.content.some((part) => part.type === "text" && part.text === "discard me"),
          ).toBe(true)
          const childFailed = childHistory[failedIndex]
          expect(childFailed?._tag).toBe("RunFailed")
          if (childFailed?._tag !== "RunFailed") return yield* Effect.die("Program child did not fail")
          expect(childFailed.error).toBeInstanceOf(Errors.AgentExecutionFailure)
          expect(childFailed.error.message).not.toBe("")
          expect(childHistory.filter((event) => event._tag === "RunCompleted")).toHaveLength(0)
          expect(new Set(childHistory.map((event) => event.runId))).toEqual(new Set([childRunId]))

          const failedOperation = yield* store.getOperationByKey({
            runId: childRunId,
            operationKey: failedOperationKey(childRunId),
          })
          expect(failedOperation).toMatchObject({
            operationKey: failedOperationKey(childRunId),
            kind: "model",
            replayPolicy: "never",
            input: { turn: 1, modelCallOrdinal: 1, purpose: "conversation" },
            status: "failed",
            error: { _tag: "tenetkit/runtime/AgentExecutionFailure" },
          })

          const joined = yield* runtime.inspectFanOut(fanOutId)
          expect(joined).toMatchObject({
            status: "failed",
            members: [
              {
                key: "only",
                childRunId,
                readiness: "settled",
                status: "failed",
                terminalEventId: childFailed.eventId,
                error: {
                  _tag: "tenetkit/runtime/AgentExecutionFailure",
                  message: childFailed.error.message,
                },
              },
            ],
          })
          expect(yield* runtime.inspect(receipt.runId)).toMatchObject({
            status: "running",
            wait: { status: "signaled" },
          })
          expect(yield* store.getProgramOperation({ runId: receipt.runId, operation: "workers" })).toMatchObject({
            status: "running",
            fanOutId,
            childRunIds: [childRunId],
          })

          yield* host.execute(yield* store.claimExecution({ runId: receipt.runId, ownerId: "program-parent-resumed" }))

          expect(sandboxCalls).toBe(2)
          expect(bindingDispatches).toBe(0)
          expect((yield* runtime.inspect(receipt.runId)).status).toBe("failed")
          const programOperation = yield* store.getProgramOperation({ runId: receipt.runId, operation: "workers" })
          expect(programOperation).toMatchObject({
            status: "failed",
            fanOutId,
            childRunIds: [childRunId],
            error: { _tag: "tenetkit/core/ProgramAgentFailure", operation: "workers", selection: "worker" },
          })
          expect((yield* store.loadProgramState(receipt.runId))?.activeSlots).toBe(0)
          expect(yield* runtime.inspectFanOut(fanOutId)).toEqual(joined)
          const parentHistory = yield* runtime.history({ runId: receipt.runId, limit: 200 })
          const parentFailed = parentHistory.find((event) => event._tag === "RunFailed")
          expect(parentFailed?._tag).toBe("RunFailed")
          if (parentFailed?._tag === "RunFailed") {
            expect(parentFailed.error).toMatchObject({
              _tag: "tenetkit/core/ProgramAgentFailure",
              operation: "workers",
              selection: "worker",
            })
          }
          expect(parentHistory.filter((event) => event._tag === "RunCompleted")).toHaveLength(0)
        }),
      )
    })
  }

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
      scopedWith(
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
