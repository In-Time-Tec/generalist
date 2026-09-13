import { BunCrypto } from "@effect/platform-bun"
import { describe, expect, it } from "@effect/vitest"
import { Context, Deferred, Effect, Layer, Result, Schema, Stream } from "effect"
import { LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
import { Agent, CodeExecutor, ProgramCapabilities } from "generalist"
import { ObjectStore } from "generalist/durability/object-store"
import { CodeMode, Runtime } from "generalist/runtime"
import { make as makeProgramManifest } from "../../src/core/durable/manifest/program-manifest.js"
import { durableIdentity } from "../../src/runtime/executable/registered-agent.js"
import { make as makeExecutable, type PinnedExecutable } from "../../src/runtime/executable/manifest.js"
import {
  narrow as narrowRegistrations,
  type ExecutableRegistration,
} from "../../src/runtime/executable/registration.js"
import type { ExecutableRegistrationInvalid, ExecutableRegistrationMissing } from "../../src/runtime/errors.js"
import { engineFor } from "../../src/runtime/hosting/application.js"
import { makeObjectStorage } from "./execution/object.js"

const usage = Response.Usage.make({
  inputTokens: { uncached: 1, total: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
})
const finish = Response.makePart("finish", { reason: "stop", usage, response: undefined })
const text = (value: string) => Stream.make(Response.makePart("text-delta", { id: "answer", delta: value }), finish)
const allowAll = {
  authorize: () => Effect.succeed({ _tag: "Execute" as const }),
}

const revisionBudget = {
  agentRuns: 0,
  concurrency: 1,
  toolCalls: 0,
  tokens: 100,
  wallClockMillis: 10_000,
  logBytes: 1_000,
  outputBytes: 4_096,
}

const OwnerPayload = Schema.Struct({
  pin: Schema.String,
  revision: Schema.String,
  ownerAgentName: Schema.String,
})

interface GeneratedProgramFixture {
  readonly executable: PinnedExecutable
  readonly registrations: ReadonlyArray<ExecutableRegistration>
  readonly sandbox: string
}

type PersistedOwner = typeof OwnerPayload.Type

const persistedOwner = (fixture: GeneratedProgramFixture): PersistedOwner => {
  const registration = fixture.registrations.find((entry) => entry.pin === fixture.sandbox)
  if (registration === undefined) throw new Error("generated Program has no sandbox registration")
  return Schema.decodeUnknownSync(OwnerPayload, { onExcessProperty: "error" })(registration.payload)
}

const withOwnerPayload = (
  fixture: GeneratedProgramFixture,
  payload: Schema.Json,
): ReadonlyArray<ExecutableRegistration> =>
  fixture.registrations.map((registration) =>
    registration.pin === fixture.sandbox ? { ...registration, payload } : registration,
  )

const versionedAgent = (version: string, result: string, executed: () => void) => {
  const step = CodeMode.step({
    name: "versioned_step",
    handlerVersion: version,
    input: Schema.String,
    output: Schema.String,
    failure: Schema.Never,
    replay: "idempotent",
    authorize: () => Effect.succeed(true),
    execute: () => Effect.sync(executed).pipe(Effect.as(result)),
  })
  return Agent.make({
    name: "cold-code-mode-owner",
    authorization: allowAll,
    codeMode: {
      tools: [],
      agents: [],
      steps: [step],
      executor: CodeExecutor.testIdentity,
      maxSourceBytes: 4_096,
      budget: revisionBudget,
    },
  })
}

const generatedProgram = (
  agent: Agent.Any,
  revision: string,
): Effect.Effect<GeneratedProgramFixture, ExecutableRegistrationInvalid | ExecutableRegistrationMissing> =>
  Effect.gen(function* () {
    const identity = durableIdentity(agent, [agent], revision)
    const active = identity.executable.manifest.entries.find((entry) => entry.pin === identity.executable.ref.active)
    if (active?._tag !== "Agent" || active.manifest.programAuthority === undefined) {
      return yield* Effect.die("expected a CodeMode Agent identity")
    }
    const authority = active.manifest.programAuthority
    const program = makeProgramManifest({
      name: "code_mode:cold-code-mode-1",
      source: { language: "javascript", text: "return await program(input)" },
      sandbox: authority.sandbox,
      input: authority.input,
      output: authority.output,
      capabilities: { tools: [], agents: [], steps: authority.steps },
      budget: authority.budget,
    })
    const executable = makeExecutable({ root: program.pin, entries: [{ _tag: "Program", ...program }] })
    const registrations = yield* narrowRegistrations(executable, identity.registrations)
    return { executable, registrations, sandbox: authority.sandbox }
  })

const modelForRevision = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: (request) => {
      const prompt = JSON.stringify(request.prompt.content)
      if (prompt.includes("historical-step")) return text("historical-finished")
      if (prompt.includes("current-step")) return text("current-finished")
      return Stream.make(
        Response.makePart("tool-call", {
          id: "cold-code-mode-1",
          name: "code_mode",
          params: {
            source: "return await program(input)",
            input: "cold program input",
            tools: [],
            agents: [],
            steps: ["versioned_step"],
            budget: revisionBudget,
          },
          providerExecuted: false,
        }),
        finish,
      )
    },
  }),
)

const completingExecutor = CodeExecutor.makeTest(() =>
  Effect.gen(function* () {
    const capabilities = yield* ProgramCapabilities.ProgramCapabilities
    const step = yield* capabilities.callStep({
      operation: "cold-versioned-step",
      step: "versioned_step",
      input: "run",
    })
    return { _tag: "cold-program-result", step }
  }),
)

const revisionServices = (executor: CodeExecutor.Service) =>
  Layer.merge(modelForRevision, Layer.succeed(CodeExecutor.CodeExecutor, executor))

describe("registered CodeMode declarations", () => {
  it.live("lowers an exact revision and calls only declared capabilities through fenced children", () =>
    Effect.gen(function* () {
      const echo = Tool.make("echo", { parameters: Schema.Struct({ value: Schema.Finite }), success: Schema.Finite })
      const hidden = Tool.make("hidden", { parameters: Schema.Void, success: Schema.String })
      const toolkit = Toolkit.make(echo, hidden)
      let echoCalls = 0
      let hiddenCalls = 0
      let stepCalls = 0
      let reviewerCalls = 0
      let executorCalls = 0
      let observedRequest: CodeExecutor.Request | undefined
      let missingCapability: string | undefined
      const reviewer = Agent.make({
        name: "reviewer",
        input: Schema.Struct({ draft: Schema.String }),
      })
      const double = CodeMode.step({
        name: "double",
        handlerVersion: "step-v1",
        input: Schema.Struct({ value: Schema.Finite }),
        output: Schema.Finite,
        failure: Schema.String,
        replay: "idempotent",
        authorize: () => Effect.succeed(true),
        execute: ({ value }) => Effect.sync(() => (stepCalls += 1)).pipe(Effect.as(value * 2)),
      })
      const budget = {
        agentRuns: 1,
        concurrency: 2,
        toolCalls: 1,
        tokens: 100,
        wallClockMillis: 10_000,
        logBytes: 1_000,
        outputBytes: 4_096,
      }
      const root = Agent.make({
        name: "code-mode-root",
        tools: [echo, hidden],
        authorization: allowAll,
        codeMode: {
          tools: [{ tool: echo, handlerVersion: "echo-v1", replay: "recorded" }],
          agents: [{ agent: reviewer, selection: "reviewer", handlerVersion: "reviewer-v1", replay: "recorded" }],
          steps: [double],
          executor: CodeExecutor.testIdentity,
          maxSourceBytes: 4_096,
          budget,
        },
      })
      const model = Layer.effect(
        LanguageModel.LanguageModel,
        LanguageModel.make({
          generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
          streamText: (request) => {
            const prompt = JSON.stringify(request.prompt.content)
            if (prompt.includes("review this")) {
              reviewerCalls += 1
              return text("reviewed")
            }
            if (prompt.includes("program-result")) return text("root-finished")
            return Stream.make(
              Response.makePart("tool-call", {
                id: "code-mode-1",
                name: "code_mode",
                params: {
                  source: "return await program(input)",
                  input: "program input",
                  tools: ["echo"],
                  agents: ["reviewer"],
                  steps: ["double"],
                  budget,
                },
                providerExecuted: false,
              }),
              finish,
            )
          },
        }),
      )
      const executor = CodeExecutor.makeTest((request) =>
        Effect.gen(function* () {
          executorCalls += 1
          observedRequest = request
          const capabilities = yield* ProgramCapabilities.ProgramCapabilities
          const absent = yield* Effect.result(capabilities.describeTool("hidden"))
          if (Result.isSuccess(absent)) return yield* Effect.die("hidden capability was unexpectedly declared")
          missingCapability = absent.failure._tag
          expect(yield* capabilities.discoverTools).toEqual([{ name: "echo" }])
          const toolResult = yield* capabilities.callTool({ operation: "echo-op", tool: "echo", input: { value: 2 } })
          const stepResult = yield* capabilities.callStep({
            operation: "step-op",
            step: "double",
            input: { value: 3 },
          })
          const agentResult = yield* capabilities.runAgent({
            operation: "agent-op",
            selection: "reviewer",
            input: { draft: "review this" },
          })
          return { _tag: "program-result", toolResult, stepResult, reviewer: agentResult.text }
        }),
      )
      const services = Layer.mergeAll(
        model,
        toolkit.toLayer({
          echo: ({ value }) => Effect.sync(() => ++echoCalls).pipe(Effect.as(value + 1)),
          hidden: () => Effect.sync(() => ++hiddenCalls).pipe(Effect.as("hidden")),
        }),
        Layer.succeed(CodeExecutor.CodeExecutor, executor),
      )
      const storage = makeObjectStorage()
      const runtimeLayer = Runtime.layer({
        agents: { "code-mode-root": root, reviewer },
        revision: "code-mode-declaration-v1",
        services,
        storage: Layer.merge(Layer.succeed(ObjectStore, storage.store), BunCrypto.layer),
        namespace: { environment: "test", tenant: "code-mode", partition: "local" },
        scheduler: { pollInterval: "10 millis" },
      })
      const context = yield* Layer.build(runtimeLayer)
      const runtime = Context.get(context, Runtime.Runtime)
      const run = yield* runtime.start(root, "use code mode", { idempotencyKey: "code-mode-declaration" })
      expect(yield* run.await).toBe("root-finished")
      expect({ echoCalls, hiddenCalls, stepCalls, reviewerCalls, executorCalls }).toEqual({
        echoCalls: 1,
        hiddenCalls: 0,
        stepCalls: 1,
        reviewerCalls: 1,
        executorCalls: 1,
      })
      expect(missingCapability).toBe("generalist/core/ProgramCapabilityMissing")
      expect(observedRequest?.capabilities).toEqual([
        { operation: "discoverTools", names: ["echo"] },
        { operation: "describeTool", names: ["echo"] },
        { operation: "callTool", names: ["echo"] },
        { operation: "callStep", names: ["double"] },
        { operation: "runAgent", names: ["reviewer"] },
        { operation: "mapAgents", names: ["reviewer"] },
        { operation: "fanOutAgents", names: ["reviewer"] },
        { operation: "log", names: [] },
      ])
      expect(observedRequest?.budget).toEqual(budget)
      expect(observedRequest).toBeDefined()
    }).pipe(Effect.scoped),
  )

  it.live("reopens a generated Program against its exact historical owner revision", () =>
    Effect.gen(function* () {
      const storage = makeObjectStorage()
      let historicalSteps = 0
      let currentSteps = 0
      const historical = versionedAgent("historical-v1", "historical-step", () => {
        historicalSteps += 1
      })
      const current = versionedAgent("current-v2", "current-step", () => {
        currentSteps += 1
      })
      const historicalRevision = "cold-code-mode-v1"
      const currentRevision = "cold-code-mode-v2"
      const expectedProgram = yield* generatedProgram(historical, historicalRevision)
      const programStarted = yield* Deferred.make<void>()
      const blockingExecutor = CodeExecutor.makeTest(() =>
        Deferred.succeed(programStarted, undefined).pipe(Effect.andThen(Effect.never)),
      )
      const runId = yield* Effect.gen(function* () {
        const context = yield* Layer.build(
          Runtime.layer({
            agents: { "cold-code-mode-owner": historical },
            revision: historicalRevision,
            services: revisionServices(blockingExecutor),
            storage: Layer.merge(Layer.succeed(ObjectStore, storage.store), BunCrypto.layer),
            namespace: { environment: "test", tenant: "code-mode-cold", partition: "local" },
            scheduler: { pollInterval: "5 millis" },
          }),
        )
        const runtime = Context.get(context, Runtime.Runtime)
        const run = yield* runtime.start(historical, "start historical code mode", {
          idempotencyKey: "cold-code-mode-root",
        })
        yield* Deferred.await(programStarted).pipe(Effect.timeout("5 seconds"))
        return run.runId
      }).pipe(Effect.scoped)

      const loaded: Array<Runtime.RevisionRequest> = []
      const output = yield* Effect.gen(function* () {
        const context = yield* Layer.build(
          Runtime.layer({
            agents: { "cold-code-mode-owner": current },
            revision: currentRevision,
            services: revisionServices(completingExecutor),
            storage: Layer.merge(Layer.succeed(ObjectStore, storage.store), BunCrypto.layer),
            namespace: { environment: "test", tenant: "code-mode-cold", partition: "local" },
            scheduler: { pollInterval: "5 millis" },
            loadRevision: (request) => {
              loaded.push(request)
              return request.revision === historicalRevision && request.agentName === historical.name
                ? Effect.succeed({
                    _tag: "Found" as const,
                    definition: {
                      agents: { "cold-code-mode-owner": historical },
                      revision: historicalRevision,
                      services: revisionServices(completingExecutor),
                    },
                  })
                : Effect.succeed({
                    _tag: "NotFound" as const,
                    revision: request.revision,
                    agentName: request.agentName,
                  })
            },
          }),
        )
        const runtime = yield* engineFor(Context.get(context, Runtime.Runtime))
        return yield* (yield* runtime.getRun(runId)).await.pipe(Effect.timeout("10 seconds"))
      }).pipe(Effect.scoped)

      expect(output).toBe("historical-finished")
      expect(historicalSteps).toBe(1)
      expect(currentSteps).toBe(0)
      expect(loaded).toContainEqual({
        revision: historicalRevision,
        agentName: historical.name,
        executablePin: expectedProgram.executable.ref.executable,
      })
    }),
  )

  it.live("fails live Program resolution for missing, wrong, or stale sandbox owner metadata", () =>
    Effect.gen(function* () {
      const revision = "live-owner-v1"
      const root = versionedAgent("live-owner-step", "current-step", () => undefined)
      const fixture = yield* generatedProgram(root, revision)
      const owner = persistedOwner(fixture)
      const cases: ReadonlyArray<{ readonly name: string; readonly payload: Schema.Json }> = [
        { name: "missing-owner", payload: { pin: owner.pin, revision: owner.revision } },
        { name: "wrong-owner", payload: { ...owner, ownerAgentName: "another-agent" } },
        { name: "wrong-revision", payload: { ...owner, revision: "stale-revision" } },
      ]
      let executorCalls = 0
      const executor = CodeExecutor.makeTest(() => Effect.sync(() => (executorCalls += 1)))
      const storage = makeObjectStorage()
      const context = yield* Layer.build(
        Runtime.layer({
          agents: { "cold-code-mode-owner": root },
          revision,
          services: revisionServices(executor),
          storage: Layer.merge(Layer.succeed(ObjectStore, storage.store), BunCrypto.layer),
          namespace: { environment: "test", tenant: "code-mode-live-owner", partition: "local" },
          scheduler: { pollInterval: "5 millis" },
        }),
      )
      const runtime = yield* engineFor(Context.get(context, Runtime.Runtime))
      for (const testCase of cases) {
        const admitted = yield* Effect.result(
          runtime.admit({
            executable: fixture.executable,
            registrations: withOwnerPayload(fixture, testCase.payload),
            sessionId: `code-mode-live-owner:${testCase.name}`,
            idempotencyKey: `code-mode-live-owner:${testCase.name}`,
            prompt: "run malformed owner fixture",
          }),
        )
        expect(Result.isFailure(admitted)).toBe(true)
        if (Result.isFailure(admitted)) {
          expect(admitted.failure).toMatchObject({
            _tag: "generalist/runtime/ExecutableRegistrationInvalid",
          })
        }
      }
      expect(executorCalls).toBe(0)
    }).pipe(Effect.scoped),
  )

  it.live("fails closed for missing and wrong historical Program owners without caching rejected loads", () =>
    Effect.gen(function* () {
      const historicalRevision = "historical-owner-v1"
      const currentRevision = "historical-owner-v2"
      const historical = versionedAgent("historical-owner-step", "historical-step", () => undefined)
      const current = versionedAgent("current-owner-step", "current-step", () => undefined)
      const fixture = yield* generatedProgram(historical, historicalRevision)
      const owner = persistedOwner(fixture)
      const cases = [
        {
          name: "missing-owner",
          payload: { pin: owner.pin, revision: owner.revision },
          error: "generalist/runtime/ExecutableRegistrationInvalid",
        },
        {
          name: "wrong-owner-first",
          payload: { ...owner, ownerAgentName: "wrong-owner" },
          error: "generalist/runtime/ExecutablePinMissing",
        },
        {
          name: "wrong-owner-second",
          payload: { ...owner, ownerAgentName: "wrong-owner" },
          error: "generalist/runtime/ExecutablePinMissing",
        },
      ] as const
      const loaded: Array<Runtime.RevisionRequest> = []
      const storage = makeObjectStorage()
      const context = yield* Layer.build(
        Runtime.layer({
          agents: { "cold-code-mode-owner": current },
          revision: currentRevision,
          services: revisionServices(completingExecutor),
          storage: Layer.merge(Layer.succeed(ObjectStore, storage.store), BunCrypto.layer),
          namespace: { environment: "test", tenant: "code-mode-historical-owner", partition: "local" },
          scheduler: { pollInterval: "5 millis" },
          loadRevision: (request) => {
            loaded.push(request)
            return Effect.succeed({
              _tag: "Found" as const,
              definition: {
                agents: { "cold-code-mode-owner": historical },
                revision: historicalRevision,
                services: revisionServices(completingExecutor),
              },
            })
          },
        }),
      )
      const runtime = yield* engineFor(Context.get(context, Runtime.Runtime))
      for (const testCase of cases) {
        const admitted = yield* Effect.result(
          runtime.admit({
            executable: fixture.executable,
            registrations: withOwnerPayload(fixture, testCase.payload),
            sessionId: `code-mode-historical-owner:${testCase.name}`,
            idempotencyKey: `code-mode-historical-owner:${testCase.name}`,
            prompt: "run historical owner fixture",
          }),
        )
        expect(Result.isFailure(admitted)).toBe(true)
        if (Result.isFailure(admitted)) {
          expect(admitted.failure).toMatchObject({ _tag: testCase.error })
        }
      }
      expect(loaded.map(({ agentName }) => agentName)).toEqual(["wrong-owner", "wrong-owner"])
    }).pipe(Effect.scoped),
  )

  it.live("rejects an executor service whose identity differs from the declaration", () =>
    Effect.gen(function* () {
      const root = Agent.make({
        name: "mismatched-code-mode-executor",
        codeMode: {
          tools: [],
          agents: [],
          steps: [],
          executor: CodeExecutor.testIdentity,
          maxSourceBytes: 1_024,
          budget: {
            agentRuns: 0,
            concurrency: 1,
            toolCalls: 0,
            tokens: 0,
            wallClockMillis: 1_000,
            logBytes: 0,
            outputBytes: 1_024,
          },
        },
      })
      const identity = CodeExecutor.declareIdentity({
        ...CodeExecutor.testIdentity,
        implementation: { ...CodeExecutor.testIdentity.implementation, version: "mismatch" },
      })
      const testExecutor = CodeExecutor.makeTest(() => Effect.die("mismatched executor must not run"))
      const executor = CodeExecutor.CodeExecutor.of({ ...testExecutor, identity })
      const model = Layer.effect(
        LanguageModel.LanguageModel,
        LanguageModel.make({
          generateText: () => Effect.die("mismatched Runtime must not start"),
          streamText: () => Stream.die("mismatched Runtime must not start"),
        }),
      )
      const storage = makeObjectStorage()
      const acquired = yield* Effect.result(
        Layer.build(
          Runtime.layer({
            agents: { "mismatched-code-mode-executor": root },
            revision: "mismatched-code-mode-executor-v1",
            services: Layer.merge(model, Layer.succeed(CodeExecutor.CodeExecutor, executor)),
            storage: Layer.merge(Layer.succeed(ObjectStore, storage.store), BunCrypto.layer),
            namespace: { environment: "test", tenant: "code-mode-mismatch", partition: "local" },
          }),
        ),
      )
      expect(Result.isFailure(acquired)).toBe(true)
      if (Result.isFailure(acquired)) {
        expect(acquired.failure).toMatchObject({
          _tag: "generalist/runtime/RuntimeOptionsInvalid",
          field: "agents",
        })
        expect(acquired.failure.message).toContain("executor/identity-invalid")
      }
    }).pipe(Effect.scoped),
  )
})
