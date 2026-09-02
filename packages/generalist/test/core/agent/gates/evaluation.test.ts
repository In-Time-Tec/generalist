/* oxlint-disable effecttsgo/strict-effect-provide -- tests provide scripted models and gate requirements at the process boundary. */
import { expect, it } from "@effect/vitest"
import { Context, Effect, Layer, Schema, Stream } from "effect"
import { Response, Tool, Toolkit } from "effect/unstable/ai"
import { Agent, DurableDriver, ExecutableManifest, Gate, Hooks, RunBudget } from "../../../../src/index.js"
import { ExecutableResolver, RunExecutor, RunStore, Runtime } from "../../../../src/runtime/index.js"
import { make as makeSandbox, type SandboxService } from "../../../../src/sandbox/index.js"
import { TestModel } from "../../../../src/testing/index.js"
import { allowAllAuthorization } from "../../../authorization.js"
import { provideScoped } from "../../../runtime/execution/scoped-provide.js"

type EffectRequirements<Value> =
  Value extends Effect.Effect<unknown, unknown, infer Requirements> ? Requirements : never
type IsAssignable<Source, Target> = Source extends Target ? true : false
type Assert<Value extends true> = Value

class GateDependency extends Context.Service<GateDependency, { readonly allowed: boolean }>()(
  "generalist/test/core/agent/gates/evaluation.test/GateDependency",
) {}

const stringify = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))

const dependentAgent = Agent.make({
  name: "dependent-gate",
  gates: [
    Gate.predicate({ name: "dependent", check: () => GateDependency.pipe(Effect.map(({ allowed }) => allowed)) }),
  ],
})
const dependentRun = Agent.run(dependentAgent, "check")
type _GateRequirementsAreInferred = Assert<IsAssignable<GateDependency, EffectRequirements<typeof dependentRun>>>

void (() => {
  Agent.make({
    name: "mismatched-gate-output",
    output: Schema.String,
    // @ts-expect-error Predicate input must match the Agent's decoded output.
    gates: [Gate.predicate({ name: "number-only", check: (output: number) => output > 0 })],
  })
})

const sandbox = (
  execute: () => { readonly stdout: string; readonly stderr: string; readonly exitCode: number },
): SandboxService =>
  makeSandbox({
    isolation: "process",
    limits: {},
    capabilities: {
      commands: ["Process"],
      files: false,
      pause: false,
      resume: false,
      snapshot: false,
      fork: false,
      limits: [],
    },
    start: () => Effect.succeed({ events: Stream.empty, result: Effect.sync(execute) }),
    files: Effect.die("unused"),
    pause: Effect.die("unused"),
    resume: Effect.die("unused"),
    snapshot: Effect.die("unused"),
    fork: () => Effect.die("unused"),
  })

it.effect("runs all gates in declaration order before completion", () =>
  Effect.gen(function* () {
    const order: Array<string> = []
    const fixture = yield* TestModel.make([TestModel.text("done")])
    const agent = Agent.make({
      name: "all-gates-pass",
      gates: [
        Gate.predicate({
          name: "first",
          check: () => {
            order.push("first")
            return true
          },
        }),
        Gate.predicate({
          name: "second",
          check: () => {
            order.push("second")
            return true
          },
        }),
      ],
    })

    const events = yield* Agent.stream(agent, "finish").pipe(Stream.runCollect, Effect.provide(fixture.layer))
    expect(order).toEqual(["first", "second"])
    expect(events.filter((event) => event._tag === "GateResult")).toMatchObject([
      { name: "first", verdict: "pass" },
      { name: "second", verdict: "pass" },
    ])
    expect(events.at(-1)).toMatchObject({ _tag: "Completed", output: "done" })
  }),
)

it.effect("fences structured output before onRunEnd", () =>
  Effect.gen(function* () {
    const order: Array<string> = []
    const fixture = yield* TestModel.make([
      TestModel.text("drafting"),
      TestModel.object({ output: { answer: "done" } }),
    ])
    const agent = Agent.make({
      name: "structured-gate",
      output: Schema.Struct({ answer: Schema.String }),
      gates: [
        Gate.predicate({
          name: "answer",
          check: (output: { readonly answer: string }) => {
            order.push(`gate:${output.answer}`)
            return true
          },
        }),
      ],
    })
    const hooks = Hooks.layer([
      Hooks.onRunEnd(({ output }) =>
        Effect.sync(() => {
          order.push(`onRunEnd:${stringify(output)}`)
        }),
      ),
    ])

    expect(yield* Agent.run(agent, "finish").pipe(Effect.provide(Layer.merge(fixture.layer, hooks)))).toEqual({
      answer: "done",
    })
    expect(order).toEqual(["gate:done", 'onRunEnd:{"answer":"done"}'])
  }),
)

it.effect("retries with command evidence and completes only after the command passes", () =>
  Effect.gen(function* () {
    let commands = 0
    const commandSandbox = sandbox(() => {
      commands += 1
      return commands === 1
        ? { stdout: "", stderr: "tests failed", exitCode: 1 }
        : { stdout: "tests passed", stderr: "", exitCode: 0 }
    })
    const fixture = yield* TestModel.make([TestModel.text("first answer"), TestModel.text("corrected answer")])
    const agent = Agent.make({
      name: "command-retry",
      gates: [Gate.command({ name: "tests", run: "bun test" })],
      onGateFailure: "retry",
      sandbox: commandSandbox,
    })

    const events = yield* Agent.stream(agent, "finish").pipe(Stream.runCollect, Effect.provide(fixture.layer))
    expect(commands).toBe(2)
    expect(events.filter((event) => event._tag === "GateResult")).toMatchObject([
      { name: "tests", verdict: "fail", evidence: { exitCode: 1, stderr: "tests failed" } },
      { name: "tests", verdict: "pass", evidence: { exitCode: 0, stdout: "tests passed" } },
    ])
    expect(events.at(-1)).toMatchObject({ _tag: "Completed", output: "corrected answer", turns: 2 })
    const requests = yield* fixture.requests
    expect(stringify(requests[1]?.prompt)).toContain("tests failed")
  }),
)

it.effect("fails when an independent verifier scores below its threshold", () =>
  Effect.gen(function* () {
    const fixture = yield* TestModel.make([
      TestModel.text("candidate"),
      TestModel.text("checking"),
      TestModel.object({ output: { score: 0.4, evidence: "missing proof" } }),
    ])
    const verifier = Agent.make({ name: "gate-verifier", output: Gate.VerifierOutput })
    const agent = Agent.make({
      name: "verified",
      gates: [Gate.verifier({ name: "quality", agent: verifier, threshold: 0.8 })],
      onGateFailure: "fail",
    })

    const failure = yield* Agent.run(agent, "finish").pipe(Effect.provide(fixture.layer), Effect.flip)
    expect(failure).toMatchObject({
      _tag: "generalist/core/GateFailed",
      gate: {
        name: "quality",
        verdict: "fail",
        evidence: { score: 0.4, threshold: 0.8, evidence: "missing proof" },
      },
    })
  }),
)

it.effect("fails immediately in fail mode", () =>
  Effect.gen(function* () {
    const fixture = yield* TestModel.make([TestModel.text("candidate")])
    const agent = Agent.make({
      name: "predicate-fail",
      gates: [Gate.predicate({ name: "approved", check: () => false })],
      onGateFailure: "fail",
    })

    const failure = yield* Agent.run(agent, "finish").pipe(Effect.provide(fixture.layer), Effect.flip)
    expect(failure).toMatchObject({
      _tag: "generalist/core/GateFailed",
      gate: { name: "approved", verdict: "fail", evidence: { passed: false } },
    })
  }),
)

it.effect("replays a checkpointed gate result without executing its predicate again", () =>
  Effect.gen(function* () {
    let checks = 0
    let checkpoint: DurableDriver.DriverCheckpoint | undefined
    const fixture = yield* TestModel.make([TestModel.text("first"), TestModel.text("replayed")])
    const agent = Agent.make({
      name: "gate-replay",
      gates: [
        Gate.predicate({
          name: "once",
          check: () => {
            checks += 1
            return true
          },
        }),
      ],
    })
    const executable = ExecutableManifest.makeTest(agent.name, undefined)
    const journal: DurableDriver.Journal = {
      onScheduled: () => Effect.void,
      onCompleted: () => Effect.void,
      onCheckpoint: (current) =>
        Effect.sync(() => {
          checkpoint = current
        }),
    }
    yield* Agent.stream(agent, "finish", { executableRef: executable.ref }).pipe(
      Stream.runDrain,
      Effect.provide(fixture.layer),
      Effect.provideService(DurableDriver.DriverJournal, journal),
    )
    expect(checks).toBe(1)
    expect(checkpoint).toBeDefined()

    const replayed = yield* Agent.stream(agent, "finish", {
      driverCheckpoint: checkpoint!,
      executableRef: executable.ref,
    }).pipe(Stream.runCollect, Effect.provide(fixture.layer))
    expect(checks).toBe(1)
    expect(replayed.find((event) => event._tag === "GateResult")).toMatchObject({ name: "once", verdict: "pass" })
    expect(replayed.at(-1)?._tag).toBe("Completed")
  }),
)

it.effect("gives a verifier neither proposer history nor tools", () =>
  Effect.gen(function* () {
    const lookup = Tool.make("lookup", { parameters: Schema.Struct({ query: Schema.String }), success: Schema.String })
    const toolkit = Toolkit.make(lookup)
    const fixture = yield* TestModel.make([
      TestModel.text("candidate"),
      TestModel.text("checking"),
      TestModel.object({ output: { score: 1, evidence: "verified" } }),
    ])
    const verifier = Agent.make({ name: "isolated-verifier", output: Gate.VerifierOutput, toolkit })
    const agent = Agent.make({
      name: "private-proposer",
      gates: [Gate.verifier({ name: "isolated", agent: verifier, threshold: 0.9 })],
    })

    const output = yield* Agent.run(agent, "TOP SECRET PROPOSER HISTORY").pipe(
      Effect.provide(Layer.merge(fixture.layer, toolkit.toLayer({ lookup: () => Effect.succeed("unused") }))),
    )
    expect(output).toBe("candidate")
    const requests = yield* fixture.requests
    const verifierRequests = requests.slice(1)
    expect(verifierRequests).toHaveLength(2)
    expect(verifierRequests.every((request) => request.tools.length === 0)).toBe(true)
    expect(stringify(verifierRequests.map((request) => request.prompt))).not.toContain("TOP SECRET")
    expect(stringify(verifierRequests[0]?.prompt)).toContain("candidate")
  }),
)

it.effect("suspends on retry budget exhaustion without false completion", () =>
  Effect.gen(function* () {
    const usage = (input: number, output: number) =>
      Response.Usage.make({
        inputTokens: { total: input, uncached: input, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: output, text: output, reasoning: undefined },
      })
    const fixture = yield* TestModel.make([
      TestModel.turn([TestModel.text("candidate")], { usage: usage(1, 1) }),
      TestModel.turn([TestModel.text("fixed")], { usage: usage(1, 0) }),
    ])
    const agent = Agent.make({
      name: "gate-budget",
      gates: [Gate.predicate({ name: "quality", check: (output) => output === "fixed" })],
      onGateFailure: "retry",
    })
    const runtimeLayer = Layer.merge(
      Runtime.layerMemory({ addresses: [], scheduler: { pollInterval: "1 hour" } }).pipe(
        Layer.provide(ExecutableResolver.layerStatic([]).pipe(Layer.orDie)),
      ),
      allowAllAuthorization,
    )

    yield* provideScoped(
      Layer.merge(runtimeLayer, fixture.layer),
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const executor = yield* RunExecutor.RunExecutor
        const store = yield* RunStore.RunStore
        yield* runtime.register(agent)
        const handle = yield* runtime.start(agent, "finish", { budget: RunBudget.make({ tokens: 2 }) })
        yield* executor.execute(yield* store.claimExecution({ runId: handle.runId, ownerId: "gate-budget-test" }))

        const inspection = yield* runtime.inspect(handle.runId)
        expect((yield* runtime.snapshot(handle.runId)).outcome).toBeUndefined()
        expect(inspection).toMatchObject({
          status: "waiting",
          suspension: { _tag: "BudgetExhausted", budget: "tokens" },
          gates: [{ name: "quality", verdict: "fail" }],
        })
        const history = yield* runtime.history({ runId: handle.runId, limit: 100 })
        expect(history.some((event) => event._tag === "GateResult")).toBe(true)
        expect(history.some((event) => event._tag === "RunCompleted")).toBe(false)
        expect(yield* fixture.requests.pipe(Effect.map((requests) => requests.length))).toBe(1)

        yield* runtime.extendBudget(handle.runId, { tokens: 2 })
        yield* executor.execute(yield* store.claimExecution({ runId: handle.runId, ownerId: "gate-budget-resume" }))
        expect(yield* handle.await).toBe("fixed")
        expect((yield* runtime.inspect(handle.runId)).gates).toMatchObject([
          { name: "quality", verdict: "fail" },
          { name: "quality", verdict: "pass" },
        ])
        const requests = yield* fixture.requests
        expect(stringify(requests[1]?.prompt)).toContain("gate_evidence")
      }),
    )
  }),
)

it("rejects command gates without a Process Sandbox while constructing the Agent", () => {
  expect(() => Agent.make({ name: "missing-sandbox", gates: [Gate.command({ name: "tests", run: "true" })] })).toThrow(
    "Agent command gates require a Sandbox",
  )
})
