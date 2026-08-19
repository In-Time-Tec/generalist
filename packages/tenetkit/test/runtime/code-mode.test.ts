import { describe, expect, it as standalone, layer } from "@effect/vitest"
import { Deferred, Effect, Fiber, Layer, Schema, Scope, Stream } from "effect"
import { LanguageModel, Prompt, Response, Tool } from "effect/unstable/ai"
import {
  Agent,
  AgentManifest,
  AgentProgram,
  ExecutableManifest,
  Pins,
  ProgramBindings,
  ProgramCapabilities,
  SandboxExecutor,
} from "tenetkit"
import { CodeMode, ExecutableResolver, LocalScheduler, RunStore, Runtime } from "../../src/runtime/index.js"
import type { ExecutionRecord, Interface as RunStoreInterface } from "../../src/runtime/run-store.js"
import { make as makeExecutionHost } from "../../src/runtime/execution-host.js"
import { layer as activeExecutionsLayer } from "../../src/runtime/active-executions.js"
import { tempDbPath } from "./sqlite-helpers.js"

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
const rootAgent = Agent.make({ name: "code-mode-root" })
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

const fixture = () => {
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
                    Response.makePart("tool-call", {
                      id: "code-1",
                      name: "code_mode",
                      params: {
                        source: "return 'program-result'",
                        input: "run program",
                        tools: [],
                        agents: [],
                        steps: [],
                        budget,
                      },
                      providerExecuted: false,
                    }),
                    finish,
                  ]
                : [Response.makePart("text-delta", { id: "answer", delta: "root-complete" }), finish],
            ),
          ),
          Stream.unwrap,
        ),
    }),
  )
  const sandbox = SandboxExecutor.makeTest(
    () =>
      Effect.flatMap(ProgramCapabilities.ProgramCapabilities, () =>
        Effect.sync(() => {
          counts.capability++
          return "program-result"
        }),
      ),
    { ...SandboxExecutor.testIdentity, fixture: "code-mode" },
  )
  const staticRoot = ExecutableResolver.makeStatic([{ executable, agent: Agent.close(rootAgent, model) }])
  const resolver = ExecutableResolver.ExecutableResolver.of({
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
        sandbox,
        bindings: ProgramBindings.make({ tools: [], agents: [], steps: [] }),
        attestation: { ref: input.ref, manifest: input.manifest },
      })
    },
  })
  return { resolver, counts }
}

const withLayer =
  <A2, E2, R2>(layerValue: Layer.Layer<A2, E2, R2>) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.scoped(
      Layer.build(layerValue).pipe(Effect.flatMap((context) => effect.pipe(Effect.provideContext(context)))),
    )

describe("Runtime code_mode Program children", () => {
  for (const backend of ["memory", "sqlite"] as const) {
    standalone.live(`${backend} admits one exact Program child and resumes the same root Run`, () => {
      const filename = tempDbPath("code-mode")
      const { resolver } = fixture()
      const options = { resolver, addresses: [], scheduler: { pollInterval: "1 day" as const } }
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
        const tree = yield* runtime.inspectTree(rootRunId)
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
        expect((yield* runtime.inspectTree(rootRunId)).runs).toHaveLength(2)
      })
      if (backend === "memory") {
        return withLayer(Runtime.layerMemory(options))(admit.pipe(Effect.andThen(finishRun)))
      }
      return withLayer(Runtime.layerSqlite({ ...options, filename }))(admit).pipe(
        Effect.andThen(withLayer(Runtime.layerSqlite({ ...options, filename }))(finishRun)),
      )
    })

    {
      const { resolver } = fixture()
      const options = { resolver, addresses: [], scheduler: { pollInterval: "1 day" as const } }
      const runtimeLayer =
        backend === "memory"
          ? Runtime.layerMemory(options)
          : Runtime.layerSqlite({ ...options, filename: tempDbPath("code-mode-cancel") })
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
            const childRunId = (yield* runtime.inspectTree(rootRunId)).runs.find(
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
      const { resolver, counts } = fixture()
      const options = { resolver, addresses: [], scheduler: { pollInterval: "1 day" as const } }
      let rootRunId = ""
      let childRunId = ""
      const crash = withLayer(Runtime.layerSqlite({ ...options, filename }))(
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
          const host = yield* makeExecutionHost({ workerId: `crash:${crashPoint}`, resolver }).pipe(
            Effect.provideService(RunStore.RunStore, crashStore),
            Effect.provideContext(yield* Layer.build(activeExecutionsLayer)),
          )
          const claim = yield* store.claimExecution({ runId: rootRunId, ownerId: `crash:${crashPoint}` })
          const scope = yield* Scope.make()
          const fiber = yield* host.execute(claim).pipe(Effect.forkIn(scope))
          yield* Deferred.await(reached)
          const tree = yield* runtime.inspectTree(rootRunId)
          expect(counts.model).toBe(1)
          expect(counts.capability).toBe(0)
          expect(tree.runs).toHaveLength(crashPoint === "before-admission" ? 1 : 2)
          if (crashPoint === "after-atomic-admission") {
            expect((yield* runtime.inspect(rootRunId)).status).toBe("waiting")
            childRunId = tree.runs.find((run) => run.parentRunId === rootRunId)!.run.runId
          }
          yield* Fiber.interrupt(fiber)
          yield* Scope.close(scope, Effect.void as never)
        }),
      )
      const reopen = withLayer(Runtime.layerSqlite({ ...options, filename }))(
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          if (crashPoint === "before-admission") {
            expect((yield* runtime.inspectTree(rootRunId)).runs).toHaveLength(1)
            expect(counts.model).toBe(1)
            expect(counts.capability).toBe(0)
            return
          }
          const scheduler = yield* LocalScheduler.LocalScheduler
          yield* Effect.forEach([0, 1, 2, 3, 4, 5, 6, 7], () => scheduler.tick.pipe(Effect.andThen(scheduler.idle)), {
            discard: true,
          })
          expect(counts.model).toBe(2)
          expect(counts.capability).toBe(1)
          expect((yield* runtime.inspect(rootRunId)).status).toBe("succeeded")
          const tree = yield* runtime.inspectTree(rootRunId)
          expect(tree.runs).toHaveLength(2)
          const recoveredChild = tree.runs.find((run) => run.parentRunId === rootRunId)!.run.runId
          const expectedChild = `run_code_${Pins.digest({ parentRunId: rootRunId, toolCallId: "code-1" }).slice(0, 32)}`
          expect(recoveredChild).toBe(expectedChild)
          if (childRunId !== "") expect(recoveredChild).toBe(childRunId)
        }),
      )
      return crash.pipe(Effect.andThen(reopen))
    })
  }

  standalone.live("sqlite resumes once after a crash with a completed Code Mode child", () => {
    const filename = tempDbPath("code-mode-child-complete")
    const { resolver, counts } = fixture()
    const options = { resolver, addresses: [], scheduler: { pollInterval: "1 day" as const } }
    let rootRunId = ""
    let childRunId = ""
    const completeChild = withLayer(Runtime.layerSqlite({ ...options, filename }))(
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
        childRunId = (yield* runtime.inspectTree(rootRunId)).runs.find((run) => run.parentRunId === rootRunId)!.run
          .runId
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
    const reopen = withLayer(Runtime.layerSqlite({ ...options, filename }))(
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
    const { resolver } = fixture()
    layer(Runtime.layerMemory({ resolver, addresses: [] }))(
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
    const authority = {
      ...root.manifest.programAuthority!,
      tools: [{ name: "shell.run", pin: Pins.makeCapability({ tool: "shell.run" }) }],
      agents: [{ selection: "researcher", agent: root.pin, input: inputPin }],
      steps: [{ name: "load.dataset", pin: Pins.makeCapability({ step: "load.dataset" }) }],
      budget: { ...budget, agentRuns: 2, toolCalls: 3 },
    }
    const declaration = CodeMode.makeTool(authority)
    const modelSchema = Tool.getJsonSchema(declaration)
    expect(modelSchema).toMatchObject({
      properties: {
        source: { type: "string", allOf: [{ maxLength: 1_000 }] },
        tools: { items: { anyOf: [{ type: "string", enum: ["shell.run"] }] }, allOf: [{ maxItems: 64 }] },
        agents: { items: { anyOf: [{ type: "string", enum: ["researcher"] }] }, allOf: [{ maxItems: 64 }] },
        steps: { items: { anyOf: [{ type: "string", enum: ["load.dataset"] }] }, allOf: [{ maxItems: 64 }] },
        budget: {
          properties: {
            agentRuns: { type: "integer", allOf: [{ minimum: 0 }, { maximum: 2 }] },
            concurrency: { type: "integer", allOf: [{ minimum: 1 }, { maximum: 1 }] },
            toolCalls: { type: "integer", allOf: [{ minimum: 0 }, { maximum: 3 }] },
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
      expect(yield* Schema.decodeUnknownEffect(declaration.parametersSchema)(exact)).toEqual(exact)
      const unknownSelection = yield* Effect.flip(
        Schema.decodeUnknownEffect(declaration.parametersSchema)({ ...exact, tools: ["shell"] }),
      )
      expect(String(unknownSelection)).toContain('Expected "shell.run"')
      expect(String(unknownSelection)).toContain('["tools"][0]')
      const excessiveBudget = yield* Effect.flip(
        Schema.decodeUnknownEffect(declaration.parametersSchema)({
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
      const modelSchema = Tool.getJsonSchema(declaration) as Record<string, unknown>
      const invalid: Array<string> = []
      const walk = (node: unknown, path: string): void => {
        if (typeof node !== "object" || node === null) return
        if (Array.isArray(node)) {
          node.forEach((child, index) => walk(child, `${path}[${index}]`))
          return
        }
        const schema = node as Record<string, unknown>
        if ("not" in schema) invalid.push(`${path}.not`)
        if (schema["type"] === "array") {
          const items = schema["items"]
          const typed =
            typeof items === "object" && items !== null && ("type" in items || "anyOf" in items || "$ref" in items)
          if (!typed) invalid.push(`${path}.items`)
        }
        for (const [key, value] of Object.entries(schema)) walk(value, `${path}.${key}`)
      }
      walk(modelSchema, "$")
      expect(invalid).toEqual([])
      for (const dimension of ["tools", "agents", "steps"] as const) {
        expect((modelSchema["properties"] as Record<string, unknown>)[dimension]).toMatchObject({
          type: "array",
          items: { type: "string" },
          allOf: [{ maxItems: 0 }],
        })
      }
      const exact = { source: "return input", input: "input", tools: [], agents: [], steps: [], budget }
      return Effect.gen(function* () {
        expect(yield* Schema.decodeUnknownEffect(declaration.parametersSchema)(exact)).toEqual(exact)
        for (const dimension of ["tools", "agents", "steps"] as const) {
          const rejected = yield* Effect.flip(
            Schema.decodeUnknownEffect(declaration.parametersSchema)({ ...exact, [dimension]: ["anything"] }),
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
    const bounded = AgentManifest.make({
      ...root.manifest,
      programAuthority: { ...root.manifest.programAuthority!, tools },
    })
    expect(() =>
      AgentManifest.make({
        ...root.manifest,
        programAuthority: {
          ...root.manifest.programAuthority!,
          tools: [...tools, { name: "tool-64", pin: Pins.makeCapability({ tool: 64 }) }],
        },
      }),
    ).toThrow()
    expect(() =>
      AgentManifest.make({
        ...root.manifest,
        programAuthority: {
          ...root.manifest.programAuthority!,
          tools: [{ name: "x".repeat(129), pin: Pins.makeCapability({ tool: "too-long" }) }],
        },
      }),
    ).toThrow()
    const implementation = CodeMode.make({
      claim: { runId: "root", ownerId: "worker", attemptFence: 1 },
      claimed: {} as ExecutionRecord,
      authority: bounded.manifest.programAuthority!,
      store: {} as RunStoreInterface,
    })
    return Effect.gen(function* () {
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
    })
  })

  standalone.effect("returns typed failures when source, capabilities, or budgets exceed ProgramAuthority", () => {
    const implementation = CodeMode.make({
      claim: { runId: "root", ownerId: "worker", attemptFence: 1 },
      claimed: {} as ExecutionRecord,
      authority: root.manifest.programAuthority!,
      store: {} as RunStoreInterface,
    })
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
    return Effect.gen(function* () {
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
    })
  })
})
