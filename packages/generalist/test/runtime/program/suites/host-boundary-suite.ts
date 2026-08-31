import { describe, expect, it, layer } from "@effect/vitest"
import { Deferred, Effect, Fiber, Layer, Schema } from "effect"
import { provideScoped } from "../../execution/scoped-provide.js"
import { Prompt } from "effect/unstable/ai"
import {
  AgentProgram,
  ExecutableManifest,
  Pins,
  ProgramHandlers,
  ProgramCapabilities,
  CodeExecutor,
} from "../../../../src/index.js"
import { Address, RunExecutor, ExecutableResolver, Runtime, RunStore } from "../../../../src/runtime/index.js"
import type { ToolCallInput } from "../../../../src/core/program/capabilities.js"
import type { StaticExecutable } from "../../../../src/runtime/executable/resolver.js"
import { registrationsFor } from "../../execution/fixtures.js"

const makeFixture = (
  name: string,
  execute: CodeExecutor.TestExecute,
  options?: {
    readonly outputBytes?: number
    readonly wallClockMillis?: number
    readonly services?: Layer.Layer<never>
    readonly toolOutput?: { readonly value: number; readonly excess?: boolean }
  },
) => {
  const program = AgentProgram.make({
    name,
    source: "host protocol fixture",
    sandbox: Pins.makeCapability({ sandbox: "ignores-validation-and-limits" }),
    input: Prompt.Prompt,
    inputPin: Pins.makeCapability({ codec: "prompt" }),
    output: Schema.Json,
    outputPin: Pins.makeCapability({ codec: "json" }),
    tools: [{ name: "echo", pin: Pins.makeCapability({ tool: "echo" }) }],
    steps: [],
    agents: [],
    budget: {
      agentRuns: 0,
      concurrency: 1,
      toolCalls: 4,
      tokens: 0,
      wallClockMillis: options?.wallClockMillis ?? 60_000,
      logBytes: 1_000,
      outputBytes: options?.outputBytes ?? 1_000,
    },
  })
  const executable = ExecutableManifest.make({
    root: program.pinned.pin,
    entries: [{ _tag: "Program", ...program.pinned }],
  })
  const handlers = ProgramHandlers.make({
    tools: [
      ProgramHandlers.tool({
        name: "echo",
        pin: program.pinned.manifest.capabilities.tools[0]!.pin,
        input: Schema.Struct({ value: Schema.Finite }),
        output: Schema.Struct({ value: Schema.Finite }),
        replay: "recorded",
        authorize: () => Effect.succeed(true),
        execute: () => Effect.succeed(options?.toolOutput ?? { value: 1 }),
      }),
    ],
    steps: [],
    agents: [],
  })
  const address = Address.make(`program:${name}`)
  const registrationBase: StaticExecutable = {
    _tag: "Program",
    executable,
    program,
    executor: CodeExecutor.makeTest(execute),
    handlers,
  }
  const registration: StaticExecutable =
    options?.services === undefined ? registrationBase : { ...registrationBase, services: options.services }
  return {
    address,
    layer: Runtime.layerMemory({
      addresses: [{ address, executable, registrations: registrationsFor(executable) }],
    }).pipe(Layer.provide(ExecutableResolver.layerStatic([registration]).pipe(Layer.orDie))),
  }
}

const execute = (address: Address.Address) =>
  Effect.gen(function* () {
    const runtime = yield* Runtime.Runtime
    const store = yield* RunStore.RunStore
    const host = yield* RunExecutor.RunExecutor
    const receipt = yield* runtime.send({ to: address, sessionId: address, idempotencyKey: address, prompt: "run" })
    yield* host.execute(yield* store.claimExecution({ runId: receipt.runId, ownerId: address }))
    return { runId: receipt.runId, outcome: (yield* runtime.snapshot(receipt.runId)).outcome }
  })

describe("durable Program host boundary", () => {
  interface ExcessToolCallInput extends ToolCallInput {
    readonly excess: boolean
  }
  const makeRequest = (input: ExcessToolCallInput): ToolCallInput => input
  for (const [name, request] of [
    ["malformed-name", { operation: "bad name", tool: "echo", input: { value: 1 } }],
    ["excess-field", makeRequest({ operation: "echo", tool: "echo", input: { value: 1 }, excess: true })],
    ["undefined-input", { operation: "echo", tool: "echo", input: undefined }],
    ["non-json-input", { operation: "echo", tool: "echo", input: { value: undefined } }],
  ] as const) {
    const fixture = makeFixture(name, () =>
      Effect.flatMap(ProgramCapabilities.ProgramCapabilities, (host) => host.callTool(request)),
    )
    layer(fixture.layer)(`rejects ${name} before journal access`, (suite) => {
      suite.effect(`rejects ${name} before journal access`, () =>
        Effect.gen(function* () {
          const result = yield* execute(fixture.address)
          const store = yield* RunStore.RunStore
          expect(result.outcome).toMatchObject({
            _tag: "Failed",
            error: { _tag: "generalist/core/ProgramSchemaFailure" },
          })
          expect(yield* store.getProgramOperation({ runId: result.runId, operation: "echo" })).toBeUndefined()
        }),
      )
    })
  }

  it.effect("rejects result excess fields and replay divergence", () => {
    let calls = 0
    const excess = makeFixture(
      "result-excess",
      () =>
        Effect.flatMap(ProgramCapabilities.ProgramCapabilities, (host) =>
          host.callTool({ operation: "echo", tool: "echo", input: { value: 1 } }),
        ),
      { toolOutput: { value: 1, excess: true } },
    )
    const replay = makeFixture("result-and-replay", () =>
      Effect.gen(function* () {
        const host = yield* ProgramCapabilities.ProgramCapabilities
        yield* host.callTool({ operation: "echo", tool: "echo", input: { value: ++calls } })
        return yield* host.callTool({ operation: "echo", tool: "echo", input: { value: ++calls } })
      }),
    )
    return provideScoped(
      excess.layer,
      execute(excess.address).pipe(
        Effect.tap(({ outcome }) =>
          Effect.sync(() =>
            expect(outcome).toMatchObject({ _tag: "Failed", error: { _tag: "generalist/core/ProgramSchemaFailure" } }),
          ),
        ),
      ),
    ).pipe(
      Effect.andThen(
        provideScoped(
          replay.layer,
          execute(replay.address).pipe(
            Effect.tap(({ outcome }) =>
              Effect.sync(() =>
                expect(outcome).toMatchObject({
                  _tag: "Failed",
                  error: { _tag: "generalist/core/ProgramReplayDivergence" },
                }),
              ),
            ),
          ),
        ),
      ),
    )
  })

  it.live("enforces wall-clock and output limits when the sandbox ignores them", () => {
    const wall = makeFixture("wall-limit", () => Effect.never, { wallClockMillis: 5 })
    const output = makeFixture("output-limit", () => Effect.succeed("too large"), { outputBytes: 3 })
    return provideScoped(
      wall.layer,
      execute(wall.address).pipe(
        Effect.tap(({ outcome }) =>
          Effect.sync(() => expect(outcome).toMatchObject({ _tag: "Failed", error: { dimension: "wallClockMillis" } })),
        ),
      ),
    ).pipe(
      Effect.andThen(
        provideScoped(
          output.layer,
          execute(output.address).pipe(
            Effect.tap(({ outcome }) =>
              Effect.sync(() => expect(outcome).toMatchObject({ _tag: "Failed", error: { dimension: "outputBytes" } })),
            ),
          ),
        ),
      ),
    )
  })

  it.effect("interrupts the sandbox and finalizes resources before terminal settlement", () => {
    const lifecycle: Array<string> = []
    let runId = ""
    let store: RunStore.Service
    let started: Deferred.Deferred<void>
    const statusAtFinalizer = (name: string) =>
      store.inspect(runId).pipe(
        Effect.tap((inspection) => Effect.sync(() => lifecycle.push(`${name}:${inspection.status}`))),
        Effect.orDie,
        Effect.asVoid,
      )
    const services = Layer.effectDiscard(Effect.acquireRelease(Effect.void, () => statusAtFinalizer("service")))
    const fixture = makeFixture(
      "cancellation-finalizers",
      ({ signal }) =>
        Effect.addFinalizer(() => statusAtFinalizer(`sandbox-${signal.aborted ? "aborted" : "active"}`)).pipe(
          Effect.andThen(Deferred.succeed(started, undefined)),
          Effect.andThen(Effect.never),
        ),
      { services },
    )
    return provideScoped(
      fixture.layer,
      Effect.gen(function* () {
        started = yield* Deferred.make<void>()
        const runtime = yield* Runtime.Runtime
        store = yield* RunStore.RunStore
        const host = yield* RunExecutor.RunExecutor
        const receipt = yield* runtime.send({
          to: fixture.address,
          sessionId: "cancel",
          idempotencyKey: "cancel",
          prompt: "run",
        })
        runId = receipt.runId
        const fiber = yield* host
          .execute(yield* store.claimExecution({ runId, ownerId: "cancel" }))
          .pipe(Effect.forkChild({ startImmediately: true }))
        yield* Deferred.await(started)
        yield* runtime.cancel({ runId, reason: "stop" })
        yield* Fiber.await(fiber)
        expect((yield* runtime.inspect(runId)).status).toBe("cancelled")
        expect(lifecycle).toEqual(["service:cancelling", "sandbox-active:cancelling"])
      }),
    )
  })
})
