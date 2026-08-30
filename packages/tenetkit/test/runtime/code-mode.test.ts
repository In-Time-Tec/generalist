import { describe, expect, it as standalone, layer } from "@effect/vitest"
import { Deferred, Effect, Exit, Fiber, Layer, Schema, Scope, Stream } from "effect"
import { LanguageModel, Prompt, Response, Tool } from "effect/unstable/ai"
import {
  Agent,
  AgentManifest,
  AgentProgram,
  ExecutableManifest,
  Pins,
  ProgramHandlers,
  ProgramCapabilities,
  CodeExecutor,
} from "../../src/index.js"
import { CodeMode, ExecutableResolver, LocalScheduler, RunStore, Runtime } from "../../src/runtime/index.js"
import { make as makeRunExecutor } from "../../src/runtime/execution/run-executor-internal.js"
import { layer as activeExecutionsLayer } from "../../src/runtime/execution/active-executions.js"
import { tempDbPath } from "./sql/scenario.js"

import { Runtime as SqliteRuntime } from "../../src/runtime/sqlite-bun.js"
const sandboxPin = Pins.makeCapability({ sandbox: "code-mode-test-v1" })
const inputPin = Pins.makeCapability({ codec: "prompt-v1" })
const outputPin = Pins.makeCapability({ codec: "unknown-v1" })
const modelPin = Pins.makeModel({ model: "code-mode-root-v1" })
const budget = {
  agentRuns: 0,
  concurrency: 1,
  toolCalls: 0,
  tokens: 0,
  wallClockMillis: 1_000,
  logBytes: 100,
  outputBytes: 1_000,
}
const rootAgent = Agent.make({
  name: "code-mode-root",
  toolScheduling: { maxConcurrency: 3, parallelSafe: [] },
})
const root = AgentManifest.fromLiveAgent(rootAgent, {
  model: modelPin,
  tools: [],
  skills: [],
  services: [],
  policy: { _tag: "Portable", policy: rootAgent.policy.snapshot! },
  budget: {},
  children: [],
  programAuthority: {
    sandbox: sandboxPin,
    input: inputPin,
    output: outputPin,
    maxSourceBytes: 1_000,
    tools: [],
    agents: [],
    steps: [],
    budget,
  },
})
const executable = ExecutableManifest.make({ root: root.pin, entries: [{ _tag: "Agent", ...root }] })
const registrations = [modelPin, sandboxPin, inputPin, outputPin].map((pin) => ({
  pin,
  codec: "test",
  version: "1",
  payload: { pin },
}))
const finish = Response.makePart("finish", {
  reason: "stop",
  usage: Response.Usage.make({
    inputTokens: { total: 1, uncached: 1, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 1, text: 1, reasoning: undefined },
  }),
  response: undefined,
})

const fixture = (options: { readonly calls?: number } = {}) => {
  const calls = options.calls ?? 1
  const counts = { model: 0, capability: 0 }
  const model = Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.succeed([]),
      streamText: () =>
        Effect.sync(() => counts.model++).pipe(
          Effect.map((call) =>
            Stream.fromIterable<Response.StreamPartEncoded>(
              call === 0
                ? [
                    ...Array.from({ length: calls }, (_, index) =>
                      Response.makePart("tool-call", {
                        id: `code-${index + 1}`,
                        name: "code_mode",
                        params: {
                          source: `return 'program-result-${index + 1}'`,
                          input: `run program ${index + 1}`,
                          tools: [],
                          agents: [],
                          steps: [],
                          budget,
                        },
                        providerExecuted: false,
                      }),
                    ),
                    finish,
                  ]
                : [Response.makePart("text-delta", { id: "answer", delta: "root-complete" }), finish],
            ),
          ),
          Stream.unwrap,
        ),
    }),
  )
  const executor = CodeExecutor.makeTest(() =>
    Effect.flatMap(ProgramCapabilities.ProgramCapabilities, () =>
      Effect.sync(() => {
        counts.capability++
        return "program-result"
      }),
    ),
  )
  const resolverLayer = Layer.effect(
    ExecutableResolver.ExecutableResolver,
    ExecutableResolver.makeStatic([{ executable, agent: Agent.close(rootAgent, model) }]).pipe(
      Effect.map((staticRoot) =>
        ExecutableResolver.ExecutableResolver.of({
          resolve: (input) => {
            const active = input.manifest.entries.find((entry) => entry.pin === input.ref.active)
            if (active?._tag !== "Program") return staticRoot.resolve(input)
            const program: AgentProgram.Program<Prompt.Prompt, Prompt.PromptEncoded, unknown, unknown> = {
              pinned: { pin: active.pin, manifest: active.manifest },
              input: Prompt.Prompt,
              output: Schema.Unknown,
            }
            return Effect.succeed({
              _tag: "Program" as const,
              program,
              executor,
              handlers: ProgramHandlers.make({ tools: [], agents: [], steps: [] }),
              attestation: { ref: input.ref, manifest: input.manifest },
            })
          },
        }),
      ),
    ),
  ).pipe(Layer.orDie)
  return { resolverLayer, counts }
}

const withLayer =
  <A2, E2, R2>(layerValue: Layer.Layer<A2, E2, R2>) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.scoped(
      Layer.build(layerValue).pipe(Effect.flatMap((context) => effect.pipe(Effect.provideContext(context)))),
    )

let codeModeFixtureId = 0
const makeCodeMode = (authority: AgentManifest.ProgramAuthority) =>
  Effect.gen(function* () {
    codeModeFixtureId += 1
    const runtime = yield* Runtime.Runtime
    const store = yield* RunStore.RunStore
    const runId = (yield* runtime.start({
      executable,
      registrations,
      sessionId: `code-mode-fixture:${codeModeFixtureId}`,
      idempotencyKey: "root",
      prompt: "fixture",
    })).runId
    const claim = yield* store.claimExecution({ runId, ownerId: "code-mode-fixture" })
    const claimed = yield* store.loadExecution(runId)
    return CodeMode.make({ claim, claimed, authority, store })
  })

const manifestWithAuthority = (programAuthority: AgentManifest.ProgramAuthority) =>
  AgentManifest.make({
    name: root.manifest.name,
    model: root.manifest.model,
    tools: root.manifest.tools,
    skills: root.manifest.skills,
    services: root.manifest.services,
    policy: root.manifest.policy,
    toolScheduling: root.manifest.toolScheduling,
    programAuthority,
    budget: root.manifest.budget,
    children: root.manifest.children,
  })

describe("Runtime code_mode Program children", () => {
  for (const backend of ["memory", "sqlite"] as const) {
    standalone.live(`${backend} admits one exact Program child and resumes the same root Run`, () => {
      const filename = tempDbPath("code-mode")
      const { resolverLayer } = fixture()
      const options = { addresses: [], scheduler: { pollInterval: "1 day" as const } }
      let rootRunId = ""
      const admit = Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const scheduler = yield* LocalScheduler.LocalScheduler
        rootRunId = (yield* runtime.start({
          executable,
          registrations,
          sessionId: `code-mode:${backend}`,
          idempotencyKey: "root",
          prompt: "use code mode",
        })).runId
        yield* scheduler.tick
        yield* scheduler.idle
        expect((yield* runtime.inspect(rootRunId)).status).toBe("waiting")
        const tree = (yield* runtime.treeCheckpoint(rootRunId)).inspection
        expect(tree.runs).toHaveLength(2)
        const children = tree.runs.filter((run) => run.parentRunId === rootRunId)
        expect(children).toHaveLength(1)
        expect(children[0]!.run.runId).toBe(
          `run_code_${Pins.digest({ parentRunId: rootRunId, toolCallId: "code-1" }).slice(0, 32)}`,
        )
      })
      const finishRun = Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const scheduler = yield* LocalScheduler.LocalScheduler
        yield* Effect.forEach([0, 1, 2, 3], () => scheduler.tick.pipe(Effect.andThen(scheduler.idle)), {
          discard: true,
        })
        expect((yield* runtime.inspect(rootRunId)).status).toBe("succeeded")
        expect((yield* runtime.snapshot(rootRunId)).outcome).toMatchObject({
          _tag: "Succeeded",
          result: { text: "root-complete" },
        })
        expect((yield* runtime.treeCheckpoint(rootRunId)).inspection.runs).toHaveLength(2)
      })
      if (backend === "memory") {
        return withLayer(Runtime.layerMemory(options).pipe(Layer.provide(resolverLayer)))(
          admit.pipe(Effect.andThen(finishRun)),
        )
      }
      const runtimeLayer = SqliteRuntime.layerSqlite({ ...options, filename }).pipe(Layer.provide(resolverLayer))
      return withLayer(runtimeLayer)(admit).pipe(Effect.andThen(withLayer(runtimeLayer)(finishRun)))
    })

    standalone.live(`${backend} atomically admits and settles simultaneous authored Code Mode children`, () => {
      const filename = tempDbPath("code-mode-plural")
      const { resolverLayer, counts } = fixture({ calls: 3 })
      const options = { addresses: [], scheduler: { pollInterval: "1 day" as const } }
      const scenario = Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        const scheduler = yield* LocalScheduler.LocalScheduler
        const rootRunId = (yield* runtime.start({
          executable,
          registrations,
          sessionId: `code-mode-plural:${backend}`,
          idempotencyKey: "root",
          prompt: "use code mode three times",
        })).runId
        const waitIds = ["code-1", "code-2", "code-3"].map(
          (toolCallId) => `${rootRunId}:tool:0:${toolCallId}:code_mode`,
        )

        yield* scheduler.tick
        yield* scheduler.idle

        const waiting = yield* runtime.inspect(rootRunId)
        expect(waiting.status).toBe("waiting")
        expect(waiting.waits.map(({ waitId, status }) => ({ waitId, status }))).toEqual(
          waitIds.map((waitId) => ({ waitId, status: "open" })),
        )
        const admitted = (yield* runtime.treeCheckpoint(rootRunId)).inspection.runs
        expect(admitted).toHaveLength(4)
        expect(admitted.filter((run) => run.parentRunId === rootRunId).map((run) => run.run.runId)).toEqual(
          ["code-1", "code-2", "code-3"].map(
            (toolCallId) => `run_code_${Pins.digest({ parentRunId: rootRunId, toolCallId }).slice(0, 32)}`,
          ),
        )
        expect(counts).toEqual({ model: 1, capability: 0 })
        const operationIds = yield* Effect.forEach(waitIds, (operationKey) =>
          store
            .getOperationByKey({ runId: rootRunId, operationKey })
            .pipe(
              Effect.flatMap((operation) =>
                operation === undefined
                  ? Effect.die(`missing Code Mode operation ${operationKey}`)
                  : Effect.succeed(operation.operationId),
              ),
            ),
        )
        expect(new Set(operationIds).size).toBe(3)

        yield* Effect.forEach(Array.from({ length: 12 }), () => scheduler.tick.pipe(Effect.andThen(scheduler.idle)), {
          discard: true,
        })

        expect(counts).toEqual({ model: 2, capability: 3 })
        expect((yield* runtime.inspect(rootRunId)).waits).toEqual([])
        expect((yield* runtime.inspect(rootRunId)).status).toBe("succeeded")
        expect(
          yield* Effect.forEach(waitIds, (operationKey) =>
            store
              .getOperationByKey({ runId: rootRunId, operationKey })
              .pipe(Effect.map((operation) => operation?.operationId)),
          ),
        ).toEqual(operationIds)
        expect(
          (yield* runtime.history({ runId: rootRunId, limit: 100 }))
            .filter((event) => event._tag === "RunResumed")
            .map((event) => event.waitId),
        ).toEqual(waitIds)
      })
      return backend === "memory"
        ? withLayer(Runtime.layerMemory(options).pipe(Layer.provide(resolverLayer)))(scenario)
        : withLayer(SqliteRuntime.layerSqlite({ ...options, filename }).pipe(Layer.provide(resolverLayer)))(scenario)
    })

    {
      const { resolverLayer } = fixture()
      const options = { addresses: [], scheduler: { pollInterval: "1 day" as const } }
      const runtimeLayer = (
        backend === "memory"
          ? Runtime.layerMemory(options)
          : SqliteRuntime.layerSqlite({ ...options, filename: tempDbPath("code-mode-cancel") })
      ).pipe(Layer.provide(resolverLayer))
      layer(runtimeLayer)(`${backend} propagates root cancellation to an admitted code_mode Program child`, (it) => {
        it.effect("propagates root cancellation to the child", () =>
          Effect.gen(function* () {
            const runtime = yield* Runtime.Runtime
            const scheduler = yield* LocalScheduler.LocalScheduler
            const rootRunId = (yield* runtime.start({
              executable,
              registrations,
              sessionId: `code-mode-cancel:${backend}`,
              idempotencyKey: "root",
              prompt: "use code mode",
            })).runId
            yield* scheduler.tick
            yield* scheduler.idle
            const childRunId = (yield* runtime.treeCheckpoint(rootRunId)).inspection.runs.find(
              (run) => run.parentRunId === rootRunId,
            )!.run.runId
            yield* runtime.cancel({ runId: rootRunId, reason: "operator cancelled" })
            expect((yield* runtime.inspect(rootRunId)).status).toBe("cancelled")
            expect((yield* runtime.inspect(childRunId)).status).toBe("cancelled")
          }),
        )
      })
    }
  }

  for (const crashPoint of ["before-admission", "after-atomic-admission"] as const) {
    standalone.live(`sqlite preserves the Code Mode boundary after a crash ${crashPoint}`, () => {
      const filename = tempDbPath(`code-mode-${crashPoint}`)
      const { resolverLayer, counts } = fixture({ calls: 3 })
      const options = { addresses: [], scheduler: { pollInterval: "1 day" as const } }
      let rootRunId = ""
      let childRunIds: ReadonlyArray<string> = []
      const runtimeLayer = SqliteRuntime.layerSqlite({ ...options, filename }).pipe(Layer.provide(resolverLayer))
      const crash = withLayer(runtimeLayer)(
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const store = yield* RunStore.RunStore
          rootRunId = (yield* runtime.start({
            executable,
            registrations,
            sessionId: `code-mode-crash:${crashPoint}`,
            idempotencyKey: "root",
            prompt: "use code mode",
          })).runId
          const reached = yield* Deferred.make<void>()
          const crashStore = RunStore.RunStore.of({
            ...store,
            admitProgramChildAndSuspend: (input) => {
              const admitted =
                crashPoint === "before-admission"
                  ? Effect.void
                  : store.admitProgramChildAndSuspend(input).pipe(Effect.asVoid)
              return admitted.pipe(Effect.andThen(Deferred.succeed(reached, undefined)), Effect.andThen(Effect.never))
            },
          })
          yield* withLayer(
            Layer.mergeAll(Layer.succeed(RunStore.RunStore, crashStore), activeExecutionsLayer, resolverLayer),
          )(
            Effect.gen(function* () {
              const host = yield* makeRunExecutor
              const claim = yield* store.claimExecution({ runId: rootRunId, ownerId: `crash:${crashPoint}` })
              const scope = yield* Scope.make()
              const fiber = yield* host.execute(claim).pipe(Effect.forkIn(scope))
              yield* Deferred.await(reached)
              const tree = (yield* runtime.treeCheckpoint(rootRunId)).inspection
              expect(counts.model).toBe(1)
              expect(counts.capability).toBe(0)
              expect(tree.runs).toHaveLength(crashPoint === "before-admission" ? 1 : 4)
              if (crashPoint === "after-atomic-admission") {
                expect((yield* runtime.inspect(rootRunId)).status).toBe("waiting")
                childRunIds = tree.runs.filter((run) => run.parentRunId === rootRunId).map((run) => run.run.runId)
              }
              yield* Fiber.interrupt(fiber)
              yield* Scope.close(scope, Exit.succeed(undefined))
            }),
          )
        }),
      )
      const reopen = withLayer(runtimeLayer)(
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          if (crashPoint === "before-admission") {
            expect((yield* runtime.treeCheckpoint(rootRunId)).inspection.runs).toHaveLength(1)
            expect(counts.model).toBe(1)
            expect(counts.capability).toBe(0)
            return
          }
          const scheduler = yield* LocalScheduler.LocalScheduler
          yield* Effect.forEach([0, 1, 2, 3, 4, 5, 6, 7], () => scheduler.tick.pipe(Effect.andThen(scheduler.idle)), {
            discard: true,
          })
          expect(counts.model).toBe(2)
          expect(counts.capability).toBe(3)
          expect((yield* runtime.inspect(rootRunId)).status).toBe("succeeded")
          const tree = (yield* runtime.treeCheckpoint(rootRunId)).inspection
          expect(tree.runs).toHaveLength(4)
          const recoveredChildren = tree.runs.filter((run) => run.parentRunId === rootRunId).map((run) => run.run.runId)
          const expectedChildren = ["code-1", "code-2", "code-3"].map(
            (toolCallId) => `run_code_${Pins.digest({ parentRunId: rootRunId, toolCallId }).slice(0, 32)}`,
          )
          expect(recoveredChildren).toEqual(expectedChildren)
          if (childRunIds.length > 0) expect(recoveredChildren).toEqual(childRunIds)
        }),
      )
      return crash.pipe(Effect.andThen(reopen))
    })
  }

  standalone.live("sqlite resumes once after a crash with a completed Code Mode child", () => {
    const filename = tempDbPath("code-mode-child-complete")
    const { resolverLayer, counts } = fixture()
    const options = { addresses: [], scheduler: { pollInterval: "1 day" as const } }
    let rootRunId = ""
    let childRunId = ""
    const runtimeLayer = SqliteRuntime.layerSqlite({ ...options, filename }).pipe(Layer.provide(resolverLayer))
    const completeChild = withLayer(runtimeLayer)(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const scheduler = yield* LocalScheduler.LocalScheduler
        rootRunId = (yield* runtime.start({
          executable,
          registrations,
          sessionId: "code-mode-child-complete",
          idempotencyKey: "root",
          prompt: "use code mode",
        })).runId
        yield* scheduler.tick
        yield* scheduler.idle
        childRunId = (yield* runtime.treeCheckpoint(rootRunId)).inspection.runs.find(
          (run) => run.parentRunId === rootRunId,
        )!.run.runId
        yield* scheduler.tick
        yield* scheduler.idle
        expect((yield* runtime.inspect(rootRunId)).status).toBe("running")
        expect((yield* runtime.inspect(childRunId)).status).toBe("succeeded")
        expect(
          (yield* runtime.history({ runId: rootRunId, limit: 100 })).filter((event) => event._tag === "RunResumed"),
        ).toHaveLength(1)
        expect(counts.model).toBe(1)
        expect(counts.capability).toBe(1)
      }),
    )
    const reopen = withLayer(runtimeLayer)(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const scheduler = yield* LocalScheduler.LocalScheduler
        yield* Effect.forEach([0, 1, 2], () => scheduler.tick.pipe(Effect.andThen(scheduler.idle)), { discard: true })
        expect((yield* runtime.inspect(rootRunId)).status).toBe("succeeded")
        expect((yield* runtime.inspect(childRunId)).status).toBe("succeeded")
        expect(
          (yield* runtime.history({ runId: rootRunId, limit: 100 })).filter((event) => event._tag === "RunResumed"),
        ).toHaveLength(1)
        expect(counts.model).toBe(2)
        expect(counts.capability).toBe(1)
      }),
    )
    return completeChild.pipe(Effect.andThen(reopen))
  })

  {
    const { resolverLayer } = fixture()
    layer(Runtime.layerMemory({ addresses: [] }).pipe(Layer.provide(resolverLayer)))(
      "requires the sandbox and every bounded authority registration at exact root admission",
      (it) => {
        it.effect("requires the sandbox and bounded authority registrations", () =>
          Effect.gen(function* () {
            const runtime = yield* Runtime.Runtime
            const failure = yield* Effect.flip(
              runtime.start({
                executable,
                registrations: registrations.filter((registration) => registration.pin !== sandboxPin),
                sessionId: "code-mode-missing-sandbox",
                idempotencyKey: "root",
                prompt: "use code mode",
              }),
            )
            expect(failure).toMatchObject({
              _tag: "tenetkit/runtime/ExecutableRegistrationMissing",
              pin: sandboxPin,
            })
          }),
        )
      },
    )
  }

  standalone.effect("advertises only exact ProgramAuthority selections and maxima in the model tool schema", () => {
    const base = root.manifest.programAuthority!
    const authority = {
      sandbox: base.sandbox,
      input: base.input,
      output: base.output,
      maxSourceBytes: base.maxSourceBytes,
      tools: [{ name: "shell.run", pin: Pins.makeCapability({ tool: "shell.run" }) }],
      agents: [{ selection: "researcher", agent: root.pin, input: inputPin }],
      steps: [{ name: "load.dataset", pin: Pins.makeCapability({ step: "load.dataset" }) }],
      budget: { ...budget, agentRuns: 2, toolCalls: 3 },
    }
    const declaration = CodeMode.makeTool(authority)
    const modelSchema = Tool.getJsonSchema(declaration)
    expect(modelSchema).toMatchObject({
      properties: {
        source: { type: "string", maxLength: 1_000 },
        tools: { items: { anyOf: [{ type: "string", enum: ["shell.run"] }] }, maxItems: 64 },
        agents: { items: { anyOf: [{ type: "string", enum: ["researcher"] }] }, maxItems: 64 },
        steps: { items: { anyOf: [{ type: "string", enum: ["load.dataset"] }] }, maxItems: 64 },
        budget: {
          properties: {
            agentRuns: { type: "integer", minimum: 0, maximum: 2 },
            concurrency: { type: "integer", minimum: 1, maximum: 1 },
            toolCalls: { type: "integer", minimum: 0, maximum: 3 },
          },
        },
      },
    })
    const exact = {
      source: "return input",
      input: "input",
      tools: ["shell.run"],
      agents: ["researcher"],
      steps: ["load.dataset"],
      budget: authority.budget,
    }
    return Effect.gen(function* () {
      expect(yield* Schema.decodeEffect(declaration.parametersSchema)(exact)).toEqual(exact)
      const unknownSelection = yield* Effect.flip(
        Schema.decodeEffect(declaration.parametersSchema)({ ...exact, tools: ["shell"] }),
      )
      expect(String(unknownSelection)).toContain('Expected "shell.run"')
      expect(String(unknownSelection)).toContain('["tools"][0]')
      const excessiveBudget = yield* Effect.flip(
        Schema.decodeEffect(declaration.parametersSchema)({
          ...exact,
          budget: { ...authority.budget, toolCalls: 4 },
        }),
      )
      expect(String(excessiveBudget)).toContain("Expected a value less than or equal to 3")
      expect(String(excessiveBudget)).toContain('["budget"]["toolCalls"]')
    })
  })

  standalone.effect(
    "emits a provider-valid typed schema when a ProgramAuthority grants an empty selection catalog",
    () => {
      const authority = root.manifest.programAuthority!
      expect(authority.tools).toEqual([])
      expect(authority.agents).toEqual([])
      expect(authority.steps).toEqual([])
      const declaration = CodeMode.makeTool(authority)
      const modelSchema = Tool.getJsonSchema(declaration)
      expect(JSON.stringify(modelSchema)).not.toContain('"not"')
      const selectionSchema = Schema.Struct({
        type: Schema.Literal("array"),
        items: Schema.Struct({ type: Schema.Literal("string") }),
        maxItems: Schema.Literal(0),
      })
      const properties = Schema.decodeUnknownSync(
        Schema.Struct({
          properties: Schema.Struct({
            tools: selectionSchema,
            agents: selectionSchema,
            steps: selectionSchema,
          }),
        }),
      )(modelSchema).properties
      for (const dimension of ["tools", "agents", "steps"] as const) {
        expect(properties[dimension]).toMatchObject({
          type: "array",
          items: { type: "string" },
          maxItems: 0,
        })
      }
      const exact = { source: "return input", input: "input", tools: [], agents: [], steps: [], budget }
      return Effect.gen(function* () {
        expect(yield* Schema.decodeEffect(declaration.parametersSchema)(exact)).toEqual(exact)
        for (const dimension of ["tools", "agents", "steps"] as const) {
          const rejected = yield* Effect.flip(
            Schema.decodeEffect(declaration.parametersSchema)({ ...exact, [dimension]: ["anything"] }),
          )
          expect(String(rejected)).toContain("Expected a value with a length of at most 0")
        }
      })
    },
  )

  standalone.effect("bounds ProgramAuthority catalogs and reports exact allowed selection IDs", () => {
    const tools = Array.from({ length: 64 }, (_, index) => ({
      name: `tool-${index}`,
      pin: Pins.makeCapability({ tool: index }),
    }))
    const base = root.manifest.programAuthority!
    const boundedAuthority = {
      sandbox: base.sandbox,
      input: base.input,
      output: base.output,
      maxSourceBytes: base.maxSourceBytes,
      agents: base.agents,
      steps: base.steps,
      budget: base.budget,
      tools,
    }
    const bounded = manifestWithAuthority(boundedAuthority)
    expect(() =>
      manifestWithAuthority({
        ...boundedAuthority,
        tools: [...tools, { name: "tool-64", pin: Pins.makeCapability({ tool: 64 }) }],
      }),
    ).toThrow()
    expect(() =>
      manifestWithAuthority({
        ...boundedAuthority,
        tools: [{ name: "x".repeat(129), pin: Pins.makeCapability({ tool: "too-long" }) }],
      }),
    ).toThrow()
    const { resolverLayer } = fixture()
    return withLayer(Runtime.layerMemory({ addresses: [] }).pipe(Layer.provide(resolverLayer)))(
      Effect.gen(function* () {
        const implementation = yield* makeCodeMode(bounded.manifest.programAuthority!)
        const result = yield* implementation.invoke({
          source: "return input",
          input: "input",
          tools: ["unknown-tool"],
          agents: [],
          steps: [],
          budget,
          toolCallId: "code-1",
        })
        expect(result).toMatchObject({
          _tag: "DomainFailure",
          failure: {
            _tag: "tenetkit/runtime/ProgramAuthorityExceeded",
            dimension: "tools",
            requestedId: "unknown-tool",
            allowedIds: bounded.manifest.programAuthority!.tools.map(({ name }) => name),
          },
        })
      }),
    )
  })

  standalone.effect("returns typed failures when source, capabilities, or budgets exceed ProgramAuthority", () =>
    withLayer(Runtime.layerMemory({ addresses: [] }).pipe(Layer.provide(fixture().resolverLayer)))(
      Effect.gen(function* () {
        const implementation = yield* makeCodeMode(root.manifest.programAuthority!)
        const invoke = (overrides: Partial<CodeMode.Parameters>) =>
          implementation.invoke({
            source: "return input",
            input: "input",
            tools: [],
            agents: [],
            steps: [],
            budget,
            toolCallId: "code-1",
            ...overrides,
          })
        const source = yield* invoke({ source: "x".repeat(1_001) })
        expect(source).toMatchObject({
          _tag: "DomainFailure",
          failure: { _tag: "tenetkit/runtime/ProgramAuthorityExceeded", dimension: "sourceBytes" },
        })
        const capability = yield* invoke({ tools: ["shell"] })
        expect(capability).toMatchObject({
          _tag: "DomainFailure",
          failure: {
            _tag: "tenetkit/runtime/ProgramAuthorityExceeded",
            dimension: "tools",
            requestedId: "shell",
            allowedIds: [],
          },
        })
        const overBudget = yield* invoke({ budget: { ...budget, toolCalls: 1 } })
        expect(overBudget).toMatchObject({
          _tag: "DomainFailure",
          failure: { _tag: "tenetkit/runtime/ProgramAuthorityExceeded", dimension: "toolCalls" },
        })
      }),
    ),
  )
})
