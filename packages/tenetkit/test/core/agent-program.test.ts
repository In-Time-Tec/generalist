import { it } from "@effect/vitest"
import {
  AgentManifest,
  AgentProgram,
  ExecutableManifest,
  Pins,
  ProgramBindings,
  ProgramCapabilities,
  ProgramHost,
  SandboxExecutor,
} from "../../src/core/index.js"
import { Deferred, Effect, Fiber, Function, Layer, Schema, Scope } from "effect"
import { expect } from "vitest"

const Input = Schema.Struct({ value: Schema.Finite })
const Output = Schema.Struct({ value: Schema.Finite })
const inputPin = Pins.makeCapability({ schema: "program-input", version: 2 })
const outputPin = Pins.makeCapability({ schema: "program-output", version: 2 })
const toolPin = Pins.makeCapability({ tool: "increment", version: 2 })
const stepPin = Pins.makeCapability({ step: "double", version: 2 })
const agentPin = AgentManifest.make({
  name: "worker",
  model: Pins.makeModel({ model: "test" }),
  tools: [],
  skills: [],
  services: [],
  policy: { _tag: "Pinned", pin: Pins.makeCapability({ policy: "test" }) },
  toolScheduling: { maxConcurrency: 1, parallelSafe: [] },
  budget: {},
  children: [],
}).pin
const agentInputPin = Pins.makeCapability({ schema: "worker-input", version: 2 })
const budget = {
  agentRuns: 6,
  concurrency: 2,
  toolCalls: 3,
  tokens: 40,
  wallClockMillis: 1_000,
  logBytes: 1_000,
  outputBytes: 1_000,
}
const allow = () => Effect.succeed(true)

const program = (
  source: string,
  options?: {
    readonly tools?: boolean
    readonly steps?: boolean
    readonly agents?: boolean
    readonly budget?: typeof budget
  },
) =>
  AgentProgram.make({
    name: "program",
    source,
    sandbox: Pins.makeCapability({ sandbox: "test-v1" }),
    input: Input,
    inputPin,
    output: Output,
    outputPin,
    tools: options?.tools === false ? [] : [{ name: "increment", pin: toolPin }],
    steps: options?.steps === false ? [] : [{ name: "double", pin: stepPin }],
    agents: options?.agents === false ? [] : [{ selection: "worker", agent: agentPin, input: agentInputPin }],
    budget: options?.budget ?? budget,
  })

const incrementTool = (
  overrides: {
    readonly authorize?: ProgramBindings.Authorize<number>
    readonly execute?: (value: number) => Effect.Effect<number, unknown>
  } = {},
) =>
  ProgramBindings.tool({
    name: "increment",
    pin: toolPin,
    input: Schema.Finite,
    output: Schema.Finite,
    replay: "idempotent",
    authorize: overrides.authorize ?? allow,
    execute: overrides.execute ?? ((value: number): Effect.Effect<number, unknown> => Effect.succeed(value + 1)),
  })

const workerAgent = (
  overrides: {
    readonly execute?: (input: string) => Effect.Effect<ProgramCapabilities.AgentRunResult, unknown>
  } = {},
) =>
  ProgramBindings.agent({
    selection: "worker",
    agent: agentPin,
    inputPin: agentInputPin,
    input: Schema.String,
    replay: "recorded",
    authorize: allow,
    execute:
      overrides.execute ??
      ((input: string): Effect.Effect<ProgramCapabilities.AgentRunResult, unknown> =>
        Effect.succeed({ text: input, turns: 1, tokenUsage: { input: 2, output: 3 } })),
  })

const bindings = (options?: { readonly toolOutput?: number; readonly agentDelay?: number }) =>
  ProgramBindings.make({
    tools: [
      incrementTool(
        options?.toolOutput === undefined
          ? {}
          : { execute: (): Effect.Effect<number, unknown> => Effect.succeed(options.toolOutput as number) },
      ),
    ],
    steps: [
      ProgramBindings.step({
        name: "double",
        pin: stepPin,
        input: Schema.Finite,
        output: Schema.Finite,
        replay: "recorded",
        authorize: allow,
        execute: (value) => Effect.succeed(value * 2),
      }),
    ],
    agents: [
      workerAgent(
        options?.agentDelay === undefined
          ? {}
          : {
              execute: (input): Effect.Effect<ProgramCapabilities.AgentRunResult, unknown> =>
                Effect.succeed({ text: input, turns: 1, tokenUsage: { input: 2, output: 3 } }).pipe(
                  Effect.delay(options.agentDelay as number),
                ),
            },
      ),
    ],
  })

const provideScoped = Function.dual<
  <A2, E2, R2>(
    provided: Layer.Layer<A2, E2, R2>,
  ) => <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E | E2, Scope.Scope | R2 | Exclude<R, A2>>,
  <A, E, R, A2, E2, R2>(
    provided: Layer.Layer<A2, E2, R2>,
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | E2, Scope.Scope | R2 | Exclude<R, A2>>
>(
  2,
  <A, E, R, A2, E2, R2>(
    provided: Layer.Layer<A2, E2, R2>,
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E | E2, Scope.Scope | R2 | Exclude<R, A2>> =>
    Effect.scoped(Effect.flatMap(Layer.build(provided), (context) => effect.pipe(Effect.provideContext(context)))),
)

const runWith =
  <E>(
    fixture: SandboxExecutor.TestExecute,
    live = bindings(),
  ): ((
    effect: Effect.Effect<{ readonly value: number }, E, ProgramHost.ProgramHost | import("effect").Scope.Scope>,
  ) => Effect.Effect<{ readonly value: number }, E, import("effect").Scope.Scope>) =>
  (effect) =>
    provideScoped(
      ProgramHost.layerDirect({
        sandbox: SandboxExecutor.makeTest(fixture, { ...SandboxExecutor.testIdentity, fixture: "agent-program" }),
        bindings: live,
      }),
      effect,
    )

it.effect("runs sequential typed tools and steps while filtering a large intermediate", () =>
  Effect.scoped(
    AgentProgram.run(program("trusted fixture"), { value: 20 }).pipe(
      runWith(
        (request) =>
          Effect.gen(function* () {
            const capabilities = yield* ProgramCapabilities.ProgramCapabilities
            const input = request.input as { readonly value: number }
            expect(yield* capabilities.discoverTools).toEqual([{ name: "increment" }])
            expect(yield* capabilities.describeTool("increment")).toMatchObject({ name: "increment" })
            const large = yield* capabilities.callTool({ operation: "load", tool: "increment", input: input.value })
            expect(large).toBe(10_000)
            const output = yield* capabilities.callStep({ operation: "shape", step: "double", input: input.value + 1 })
            yield* capabilities.log({ operation: "complete", level: "info", message: "complete" })
            return { value: output }
          }),
        bindings({ toolOutput: 10_000 }),
      ),
      Effect.map((result) => expect(result).toEqual({ value: 42 })),
    ),
  ),
)

it.effect("denies bindings outside the exact manifest closure and rejects pin mismatches", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const closed = program("closed", { steps: false, agents: false })
      const fixture = SandboxExecutor.makeTest(() => Effect.succeed({ value: 1 }), {
        ...SandboxExecutor.testIdentity,
        fixture: "closed-program",
      })
      const extra = yield* provideScoped(
        ProgramHost.layerDirect({ sandbox: fixture, bindings: bindings() }),
        AgentProgram.run(closed, { value: 1 }),
      ).pipe(Effect.flip)
      expect(extra).toBeInstanceOf(ProgramHost.ProgramBindingMismatch)

      const wrong = ProgramBindings.make({
        tools: [{ ...bindings().tools[0]!, pin: Pins.makeCapability({ wrong: true }) }],
        steps: [],
        agents: [],
      })
      const mismatch = yield* provideScoped(
        ProgramHost.layerDirect({ sandbox: fixture, bindings: wrong }),
        AgentProgram.run(closed, { value: 1 }),
      ).pipe(Effect.flip)
      expect(mismatch).toBeInstanceOf(ProgramHost.ProgramBindingMismatch)
    }),
  ),
)

it.effect("schema-validates every capability argument and result", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const badInput = yield* AgentProgram.run(program("bad input"), { value: 1 }).pipe(
        runWith(() =>
          Effect.gen(function* () {
            const capabilities = yield* ProgramCapabilities.ProgramCapabilities
            yield* capabilities.callTool({ operation: "badInput", tool: "increment", input: "not-a-number" })
            return { value: 1 }
          }),
        ),
        Effect.flip,
      )
      expect(badInput).toBeInstanceOf(ProgramCapabilities.ProgramSchemaFailure)

      const badBindings = bindings()
      const invalidOutput = ProgramBindings.make({
        ...badBindings,
        tools: [
          incrementTool({
            execute: (): Effect.Effect<number, unknown> => Effect.succeed("wrong" as unknown as number),
          }),
        ],
      })
      const badOutput = yield* AgentProgram.run(program("bad output"), { value: 1 }).pipe(
        runWith(
          () =>
            Effect.gen(function* () {
              const capabilities = yield* ProgramCapabilities.ProgramCapabilities
              yield* capabilities.callTool({ operation: "badOutput", tool: "increment", input: 1 })
              return { value: 1 }
            }),
          invalidOutput,
        ),
        Effect.flip,
      )
      expect(badOutput).toBeInstanceOf(ProgramCapabilities.ProgramSchemaFailure)
    }),
  ),
)

it.effect("keeps host authorization and handler failures distinct", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const live = bindings()
      const denied = ProgramBindings.make({
        ...live,
        tools: [incrementTool({ authorize: () => Effect.succeed(false) })],
      })
      const fixture = () =>
        Effect.gen(function* () {
          const capabilities = yield* ProgramCapabilities.ProgramCapabilities
          yield* capabilities.callTool({ operation: "authorized", tool: "increment", input: 1 })
          return { value: 1 }
        })
      const denial = yield* AgentProgram.run(program("denied"), { value: 1 }).pipe(
        runWith(fixture, denied),
        Effect.flip,
      )
      expect(denial).toBeInstanceOf(ProgramCapabilities.ProgramCapabilityDenied)

      let executed = false
      const suspended = ProgramBindings.make({
        ...live,
        tools: [
          incrementTool({
            authorize: ({ operation }) =>
              Effect.fail(
                ProgramCapabilities.ProgramSuspended.make({ operation, reason: "approval", token: "approval-1" }),
              ),
            execute: () =>
              Effect.sync(() => {
                executed = true
                return 1
              }),
          }),
        ],
      })
      const suspension = yield* AgentProgram.run(program("suspended"), { value: 1 }).pipe(
        runWith(fixture, suspended),
        Effect.flip,
      )
      expect(suspension).toBeInstanceOf(ProgramCapabilities.ProgramSuspended)
      expect(executed).toBe(false)

      const cause = { code: "tool-down" }
      const failed = ProgramBindings.make({
        ...live,
        tools: [incrementTool({ execute: () => Effect.fail(cause) })],
      })
      const failure = yield* AgentProgram.run(program("failed"), { value: 1 }).pipe(
        runWith(fixture, failed),
        Effect.flip,
      )
      expect(failure).toBeInstanceOf(ProgramCapabilities.ProgramToolFailure)
      expect((failure as { readonly cause: unknown }).cause).toBe(cause)
    }),
  ),
)

it("round-trips typed Program failures through the durable schema", () => {
  const failure = ProgramCapabilities.ProgramSuspended.make({
    operation: "approval",
    reason: "approval",
    token: "approval-1",
  })
  const encoded = Schema.encodeUnknownSync(ProgramHost.ExecutionFailure)(failure)
  expect(Schema.decodeUnknownSync(ProgramHost.ExecutionFailure)(encoded)).toEqual(failure)
})

it.effect("runs bounded parallel Agents in deterministic member order", () =>
  Effect.scoped(
    Effect.gen(function* () {
      let active = 0
      let maximum = 0
      const gate = yield* Deferred.make<void>()
      const live = bindings()
      const measured = ProgramBindings.make({
        ...live,
        agents: [
          workerAgent({
            execute: (input: string) =>
              Effect.acquireUseRelease(
                Effect.sync(() => {
                  active += 1
                  maximum = Math.max(maximum, active)
                }).pipe(Effect.tap(() => (active === 2 ? Deferred.succeed(gate, undefined) : Effect.void))),
                () =>
                  Deferred.await(gate).pipe(Effect.as({ text: input, turns: 1, tokenUsage: { input: 1, output: 1 } })),
                () =>
                  Effect.sync(() => {
                    active -= 1
                  }),
              ),
          }),
        ],
      })
      const result = yield* AgentProgram.run(program("map"), { value: 0 }).pipe(
        runWith(
          () =>
            Effect.gen(function* () {
              const capabilities = yield* ProgramCapabilities.ProgramCapabilities
              const results = yield* capabilities.mapAgents({
                operation: "workers",
                selection: "worker",
                members: [
                  { member: "z", input: "last" },
                  { member: "a", input: "first" },
                  { member: "m", input: "middle" },
                ],
              })
              expect(results.map(({ member }) => member)).toEqual(["a", "m", "z"])
              const fanOut = yield* capabilities.fanOutAgents({
                operation: "reviewers",
                members: [
                  { member: "second", selection: "worker", input: "second" },
                  { member: "first", selection: "worker", input: "first" },
                ],
              })
              expect(fanOut.map(({ member }) => member)).toEqual(["first", "second"])
              return { value: results.length + fanOut.length }
            }),
          measured,
        ),
      )
      expect(result.value).toBe(5)
      expect(maximum).toBe(2)
    }),
  ),
)

it.effect("enforces tool, Agent token, log, wall-clock, and output budgets", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const toolFailure = yield* AgentProgram.run(program("tool budget"), { value: 1 }).pipe(
        runWith(() =>
          Effect.gen(function* () {
            const capabilities = yield* ProgramCapabilities.ProgramCapabilities
            for (let index = 0; index < 4; index++)
              yield* capabilities.callTool({ operation: `tool${index}`, tool: "increment", input: 1 })
            return { value: 1 }
          }),
        ),
        Effect.flip,
      )
      expect(Schema.is(ProgramCapabilities.ProgramBudgetExhausted)(toolFailure)).toBe(true)
      if (Schema.is(ProgramCapabilities.ProgramBudgetExhausted)(toolFailure)) {
        expect(toolFailure.dimension).toBe("toolCalls")
      }

      const agentRunFailure = yield* AgentProgram.run(program("Agent run budget"), { value: 1 }).pipe(
        runWith(() =>
          Effect.gen(function* () {
            const capabilities = yield* ProgramCapabilities.ProgramCapabilities
            yield* capabilities.mapAgents({
              operation: "tooManyAgents",
              selection: "worker",
              members: Array.from({ length: 7 }, (_, index) => ({ member: `member${index}`, input: "x" })),
            })
            return { value: 1 }
          }),
        ),
        Effect.flip,
      )
      expect(Schema.is(ProgramCapabilities.ProgramBudgetExhausted)(agentRunFailure)).toBe(true)
      if (Schema.is(ProgramCapabilities.ProgramBudgetExhausted)(agentRunFailure)) {
        expect(agentRunFailure.dimension).toBe("agentRuns")
      }

      const live = bindings()
      const expensiveAgent = ProgramBindings.make({
        ...live,
        agents: [
          workerAgent({
            execute: (): Effect.Effect<ProgramCapabilities.AgentRunResult, unknown> =>
              Effect.succeed({ text: "x", turns: 1, tokenUsage: { input: 30, output: 20 } }),
          }),
        ],
      })
      const tokenFailure = yield* AgentProgram.run(program("token budget"), { value: 1 }).pipe(
        runWith(
          () =>
            Effect.gen(function* () {
              const capabilities = yield* ProgramCapabilities.ProgramCapabilities
              yield* capabilities.runAgent({ operation: "agent", selection: "worker", input: "x" })
              return { value: 1 }
            }),
          expensiveAgent,
        ),
        Effect.flip,
      )
      expect(Schema.is(ProgramCapabilities.ProgramBudgetExhausted)(tokenFailure)).toBe(true)
      if (Schema.is(ProgramCapabilities.ProgramBudgetExhausted)(tokenFailure)) {
        expect(tokenFailure.dimension).toBe("tokens")
      }

      const logFailure = yield* AgentProgram.run(program("log budget"), { value: 1 }).pipe(
        runWith(() =>
          Effect.gen(function* () {
            const capabilities = yield* ProgramCapabilities.ProgramCapabilities
            yield* capabilities.log({ operation: "hugeLog", level: "info", message: "x".repeat(2_000) })
            return { value: 1 }
          }),
        ),
        Effect.flip,
      )
      expect(Schema.is(ProgramCapabilities.ProgramBudgetExhausted)(logFailure)).toBe(true)
      if (Schema.is(ProgramCapabilities.ProgramBudgetExhausted)(logFailure)) {
        expect(logFailure.dimension).toBe("logBytes")
      }

      const wallFailure = yield* AgentProgram.run(
        program("wall budget", { budget: { ...budget, wallClockMillis: 0 } }),
        { value: 1 },
      ).pipe(
        runWith(() => Effect.never),
        Effect.flip,
      )
      expect(Schema.is(ProgramCapabilities.ProgramBudgetExhausted)(wallFailure)).toBe(true)
      if (Schema.is(ProgramCapabilities.ProgramBudgetExhausted)(wallFailure)) {
        expect(wallFailure.dimension).toBe("wallClockMillis")
      }

      const outputFailure = yield* AgentProgram.run(program("output budget"), { value: 1 }).pipe(
        runWith(() => Effect.succeed({ value: 1, ignored: "x".repeat(2_000) })),
        Effect.flip,
      )
      expect(Schema.is(ProgramCapabilities.ProgramBudgetExhausted)(outputFailure)).toBe(true)
      if (Schema.is(ProgramCapabilities.ProgramBudgetExhausted)(outputFailure)) {
        expect(outputFailure.dimension).toBe("outputBytes")
      }
    }),
  ),
)

it.effect("interrupts the sandbox and aborts its explicit signal", () =>
  Effect.scoped(
    Effect.gen(function* () {
      let signal: AbortSignal | undefined
      const running = AgentProgram.run(program("wait"), { value: 1 }).pipe(
        runWith((request) => {
          signal = request.signal
          return Effect.never
        }),
        Effect.forkChild,
      )
      const fiber = yield* running
      yield* Effect.yieldNow
      yield* Fiber.interrupt(fiber)
      expect(signal?.aborted).toBe(true)
    }),
  ),
)

it.effect("exposes no ambient host authority across the trusted sandbox seam", () =>
  Effect.scoped(
    AgentProgram.run(program("protocol"), { value: 1 }).pipe(
      runWith((request) => {
        expect(Object.keys(request).toSorted()).toEqual([
          "capabilities",
          "deadlineMillis",
          "entrypoint",
          "input",
          "inputCodec",
          "limits",
          "modules",
          "outputCodec",
          "protocolVersion",
          "requestId",
          "signal",
          "sourceDigest",
        ])
        expect(request).not.toHaveProperty("bindings")
        expect(request).not.toHaveProperty("sandbox")
        expect(request).not.toHaveProperty("process")
        return Effect.succeed({ value: 1 })
      }),
      Effect.map((result) => expect(result.value).toBe(1)),
    ),
  ),
)

it.effect("rejects a forged Program manifest pin before sandbox execution", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const first = program("first")
      const second = program("second")
      const forged = { ...first, pinned: { ...first.pinned, pin: second.pinned.pin } }
      const failure = yield* AgentProgram.run(forged, { value: 1 }).pipe(
        runWith(() => Effect.succeed({ value: 1 })),
        Effect.flip,
      )
      expect(failure).toBeInstanceOf(ProgramHost.ProgramIdentityMismatch)
    }),
  ),
)

it("pins version-2 manifests, exact source, steps, and tagged executable identity", () => {
  const first = program("return input")
  const second = program("return { value: input.value + 1 }")
  const firstExecutable = ExecutableManifest.make({
    root: first.pinned.pin,
    entries: [
      { _tag: "Program", ...first.pinned },
      {
        _tag: "Agent",
        ...AgentManifest.make({
          name: "worker",
          model: Pins.makeModel({ model: "test" }),
          tools: [],
          skills: [],
          services: [],
          policy: { _tag: "Pinned", pin: Pins.makeCapability({ policy: "test" }) },
          toolScheduling: { maxConcurrency: 1, parallelSafe: [] },
          budget: {},
          children: [],
        }),
      },
    ],
  })
  expect(first.pinned.manifest.version).toBe("1")
  expect(first.pinned.manifest.capabilities.steps[0]?.name).toBe("double")
  expect(first.pinned.pin).not.toBe(second.pinned.pin)
  expect(firstExecutable.manifest.entries.find(({ _tag }) => _tag === "Program")?._tag).toBe("Program")
})

it("rejects blank, ambiguous, and unbounded operation and member keys", () => {
  for (const invalid of ["", "two words", "a/b", "a.b", "_hidden", `a${"x".repeat(64)}`]) {
    expect(() => Schema.decodeUnknownSync(ProgramCapabilities.ProgramOperationName)(invalid)).toThrow()
    expect(() => Schema.decodeUnknownSync(ProgramCapabilities.ProgramMemberKey)(invalid)).toThrow()
  }
  expect(Schema.decodeUnknownSync(ProgramCapabilities.ProgramOperationName)("step_1-ok")).toBe("step_1-ok")
})
