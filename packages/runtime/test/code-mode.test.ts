import { describe, expect, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Layer, Schema, Scope, Stream } from "effect"
import { LanguageModel, Prompt, Response } from "effect/unstable/ai"
import {
  Agent,
  AgentManifest,
  AgentProgram,
  ExecutableManifest,
  Pins,
  ProgramBindings,
  ProgramCapabilities,
  SandboxExecutor,
} from "@batonfx/core"
import { CodeMode, ExecutableResolver, LocalScheduler, RunStore, Runtime } from "../src/index.js"
import type { ExecutionRecord, Interface as RunStoreInterface } from "../src/run-store.js"
import { make as makeExecutionHost } from "../src/execution-host.js"
import { layer as activeExecutionsLayer } from "../src/active-executions.js"
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

describe("Runtime code_mode Program children", () => {
  for (const backend of ["memory", "sqlite"] as const) {
    it.live(`${backend} admits one exact Program child and resumes the same root Run`, () => {
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
        yield* Effect.forEach([0, 1, 2, 3], () => scheduler.tick, { discard: true })
        expect((yield* runtime.inspect(rootRunId)).status).toBe("succeeded")
        expect((yield* runtime.snapshot(rootRunId)).outcome).toMatchObject({
          _tag: "Succeeded",
          result: { text: "root-complete" },
        })
        expect((yield* runtime.inspectTree(rootRunId)).runs).toHaveLength(2)
      })
      if (backend === "memory") {
        return admit.pipe(Effect.andThen(finishRun), Effect.provide(Runtime.layerMemory(options)), Effect.scoped)
      }
      return admit.pipe(
        Effect.provide(Runtime.layerSqlite({ ...options, filename })),
        Effect.scoped,
        Effect.andThen(finishRun.pipe(Effect.provide(Runtime.layerSqlite({ ...options, filename })), Effect.scoped)),
      )
    })

    it.live(`${backend} propagates root cancellation to an admitted code_mode Program child`, () => {
      const { resolver } = fixture()
      const options = { resolver, addresses: [], scheduler: { pollInterval: "1 day" as const } }
      const layer =
        backend === "memory"
          ? Runtime.layerMemory(options)
          : Runtime.layerSqlite({ ...options, filename: tempDbPath("code-mode-cancel") })
      return Effect.gen(function* () {
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
        const childRunId = (yield* runtime.inspectTree(rootRunId)).runs.find((run) => run.parentRunId === rootRunId)!
          .run.runId
        yield* runtime.cancel({ runId: rootRunId, reason: "operator cancelled" })
        expect((yield* runtime.inspect(rootRunId)).status).toBe("cancelled")
        expect((yield* runtime.inspect(childRunId)).status).toBe("cancelled")
      }).pipe(Effect.provide(layer), Effect.scoped)
    })
  }

  for (const crashPoint of ["before-admission", "after-atomic-admission"] as const) {
    it.live(`sqlite preserves the Code Mode boundary after a crash ${crashPoint}`, () => {
      const filename = tempDbPath(`code-mode-${crashPoint}`)
      const { resolver, counts } = fixture()
      const options = { resolver, addresses: [], scheduler: { pollInterval: "1 day" as const } }
      let rootRunId = ""
      let childRunId = ""
      const crash = Effect.scoped(
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
            Effect.provide(activeExecutionsLayer),
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
        }).pipe(Effect.provide(Runtime.layerSqlite({ ...options, filename }))),
      )
      const reopen = Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        if (crashPoint === "before-admission") {
          expect((yield* runtime.inspectTree(rootRunId)).runs).toHaveLength(1)
          expect(counts.model).toBe(1)
          expect(counts.capability).toBe(0)
          return
        }
        const scheduler = yield* LocalScheduler.LocalScheduler
        yield* Effect.forEach([0, 1, 2, 3, 4, 5, 6, 7], () => scheduler.tick, { discard: true })
        expect(counts.model).toBe(2)
        expect(counts.capability).toBe(1)
        expect((yield* runtime.inspect(rootRunId)).status).toBe("succeeded")
        const tree = yield* runtime.inspectTree(rootRunId)
        expect(tree.runs).toHaveLength(2)
        const recoveredChild = tree.runs.find((run) => run.parentRunId === rootRunId)!.run.runId
        const expectedChild = `run_code_${Pins.digest({ parentRunId: rootRunId, toolCallId: "code-1" }).slice(0, 32)}`
        expect(recoveredChild).toBe(expectedChild)
        if (childRunId !== "") expect(recoveredChild).toBe(childRunId)
      }).pipe(Effect.provide(Runtime.layerSqlite({ ...options, filename })), Effect.scoped)
      return crash.pipe(Effect.andThen(reopen))
    })
  }

  it.live("sqlite resumes once after a crash with a completed Code Mode child", () => {
    const filename = tempDbPath("code-mode-child-complete")
    const { resolver, counts } = fixture()
    const options = { resolver, addresses: [], scheduler: { pollInterval: "1 day" as const } }
    let rootRunId = ""
    let childRunId = ""
    const completeChild = Effect.gen(function* () {
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
      childRunId = (yield* runtime.inspectTree(rootRunId)).runs.find((run) => run.parentRunId === rootRunId)!.run.runId
      yield* scheduler.tick
      expect((yield* runtime.inspect(rootRunId)).status).toBe("waiting")
      expect((yield* runtime.inspect(childRunId)).status).toBe("succeeded")
      expect(counts.model).toBe(1)
      expect(counts.capability).toBe(1)
    }).pipe(Effect.provide(Runtime.layerSqlite({ ...options, filename })), Effect.scoped)
    const reopen = Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const scheduler = yield* LocalScheduler.LocalScheduler
      yield* Effect.forEach([0, 1, 2], () => scheduler.tick, { discard: true })
      expect((yield* runtime.inspect(rootRunId)).status).toBe("succeeded")
      expect((yield* runtime.inspect(childRunId)).status).toBe("succeeded")
      expect(counts.model).toBe(2)
      expect(counts.capability).toBe(1)
    }).pipe(Effect.provide(Runtime.layerSqlite({ ...options, filename })), Effect.scoped)
    return completeChild.pipe(Effect.andThen(reopen))
  })

  it.effect("requires the sandbox and every bounded authority registration at exact root admission", () => {
    const { resolver } = fixture()
    return Effect.gen(function* () {
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
      expect(failure).toMatchObject({ _tag: "@batonfx/runtime/ExecutableRegistrationMissing", pin: sandboxPin })
    }).pipe(Effect.provide(Runtime.layerMemory({ resolver, addresses: [] })), Effect.scoped)
  })

  it.effect("returns typed failures when source, capabilities, or budgets exceed ProgramAuthority", () => {
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
        failure: { _tag: "@batonfx/runtime/ProgramAuthorityExceeded", dimension: "sourceBytes" },
      })
      const capability = yield* invoke({ tools: ["shell"] })
      expect(capability).toMatchObject({
        _tag: "DomainFailure",
        failure: { _tag: "@batonfx/runtime/ProgramAuthorityExceeded", dimension: "tools" },
      })
      const overBudget = yield* invoke({ budget: { ...budget, toolCalls: 1 } })
      expect(overBudget).toMatchObject({
        _tag: "DomainFailure",
        failure: { _tag: "@batonfx/runtime/ProgramAuthorityExceeded", dimension: "toolCalls" },
      })
    })
  })
})
