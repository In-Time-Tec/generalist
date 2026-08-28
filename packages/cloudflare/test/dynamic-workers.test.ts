/* oxlint-disable effecttsgo/abort-controller-in-effect, effecttsgo/async-function, effecttsgo/global-date, effecttsgo/global-date-in-effect, effecttsgo/new-promise, effecttsgo/prefer-schema-over-json, no-new-func */
import { expect, it } from "@effect/vitest"
import { Effect, Fiber, Schema } from "effect"
import { ProgramCapabilities, SandboxExecutor } from "tenetkit"
import { make, makeUnavailable, type CapabilityRpc, type WorkerCode } from "@tenetkit/cloudflare/dynamic-workers"
import { runner } from "../src/dynamic-workers/source.js"

const capabilities = ProgramCapabilities.ProgramCapabilities.of({
  discoverTools: Effect.succeed([]),
  describeTool: (name) => Effect.fail(ProgramCapabilities.ProgramCapabilityMissing.make({ capability: name })),
  callTool: (input) => Effect.succeed(input.input),
  callStep: (input) => Effect.succeed(input.input),
  runAgent: () => Effect.die("not used"),
  mapAgents: () => Effect.die("not used"),
  fanOutAgents: () => Effect.die("not used"),
  log: () => Effect.void,
})

const capabilityFailureId = (reason: Error): string => {
  const message = reason.message
  expect(message).toMatch(/^tenetkit-capability-failure:failure-\d+$/)
  return message.slice("tenetkit-capability-failure:".length)
}

const request = (signal = new AbortController().signal): SandboxExecutor.Request => {
  const modules = [{ name: "program.js", source: "export default async input => ({ value: input.value + 1 })" }]
  const identity = { modules, entrypoint: "program.js", inputCodec: "input:v1", outputCodec: "output:v1" }
  return {
    protocolVersion: "1",
    requestId: "run-1:attempt-1",
    sourceDigest: SandboxExecutor.sourceDigest(identity),
    ...identity,
    input: { value: 1 },
    signal,
    deadlineMillis: Date.now() + 10_000,
    limits: { cpuMillis: 50, subrequests: 3, outputBytes: 1_024 },
    capabilities: [{ operation: "callTool", names: ["echo"] }],
  }
}

it.effect("loads exact cold WorkerCode with only the capability binding and pinned constants", () =>
  Effect.gen(function* () {
    const loaded: Array<WorkerCode> = []
    const executor = make({
      compatibilityDate: "2026-08-19",
      capabilityBinding: (rpc) => rpc,
      loader: {
        load: (code) => {
          loaded.push(code)
          return {
            getEntrypoint: () => ({
              fetch: async (raw) => {
                const envelope = Schema.decodeUnknownSync(Schema.Struct({ input: Schema.Unknown }))(await raw.json())
                return Response.json({
                  protocolVersion: "1",
                  requestId: code.env.TENET_REQUEST_ID,
                  sourceDigest: code.env.TENET_SOURCE_DIGEST,
                  inputCodec: code.env.TENET_INPUT_CODEC,
                  outputCodec: code.env.TENET_OUTPUT_CODEC,
                  output: envelope.input,
                })
              },
            }),
          }
        },
      },
    })
    const first = yield* executor
      .execute(request())
      .pipe(Effect.provideService(ProgramCapabilities.ProgramCapabilities, capabilities))
    const second = yield* executor
      .execute(request())
      .pipe(Effect.provideService(ProgramCapabilities.ProgramCapabilities, capabilities))
    expect(first.output).toEqual({ value: 1 })
    expect(loaded).toHaveLength(2)
    expect(loaded[0]).toMatchObject({
      compatibilityDate: "2026-08-19",
      mainModule: "__tenetkit_runner.js",
      globalOutbound: null,
      limits: { cpuMs: 50, subrequests: 3 },
    })
    expect(Object.keys(loaded[0]!.env).toSorted()).toEqual([
      "TENET_CAPABILITIES",
      "TENET_INPUT_CODEC",
      "TENET_OUTPUT_CODEC",
      "TENET_PROTOCOL_VERSION",
      "TENET_REQUEST_ID",
      "TENET_SOURCE_DIGEST",
    ])
    expect(loaded[0]!.modules["__tenetkit_runner.js"]).toContain("capabilityFailureId")
    expect(second.requestId).toBe(first.requestId)
  }),
)

it.effect("rejects invalid source before WorkerLoader.load", () =>
  Effect.gen(function* () {
    let loads = 0
    const executor = make({
      compatibilityDate: "2026-08-19",
      capabilityBinding: (rpc: CapabilityRpc) => rpc,
      loader: {
        load: () => {
          loads += 1
          throw new Error("must not load")
        },
      },
    })
    const failure = yield* Effect.flip(
      executor
        .execute({ ...request(), sourceDigest: "invalid" })
        .pipe(Effect.provideService(ProgramCapabilities.ProgramCapabilities, capabilities)),
    )
    expect(failure).toBeInstanceOf(SandboxExecutor.SandboxSourceInvalid)
    expect(loads).toBe(0)
  }),
)

it.effect("normalizes the exact module graph and rejects unsupported imports before load", () =>
  Effect.gen(function* () {
    let loads = 0
    const executor = make({
      compatibilityDate: "2026-08-19",
      capabilityBinding: (rpc) => rpc,
      loader: {
        load: () => {
          loads += 1
          throw new Error("must not load")
        },
      },
    })
    const invalidModules: ReadonlyArray<ReadonlyArray<SandboxExecutor.Module>> = [
      [{ name: "program.js", source: 'import "node:fs"; export default () => null' }],
      [{ name: "program.js", source: 'const target = "./part.js"; export default () => import(target)' }],
      [
        { name: "program.js", source: "export default () => null" },
        { name: "Program.js", source: "export default 1" },
      ],
      [{ name: "../program.js", source: "export default () => null" }],
      [{ name: "__tenetkit_runner.js", source: "export default () => null" }],
      [{ name: "__TENETKIT_RUNNER.JS", source: "export default () => null" }],
      [
        { name: "program.js", source: 'import "./__tenetkit_runner.js"; export default () => null' },
        { name: "__tenetkit_runner.js", source: "export default 1" },
      ],
    ]
    for (const modules of invalidModules) {
      const candidate = {
        ...request(),
        modules,
        sourceDigest: SandboxExecutor.sourceDigest({
          modules,
          entrypoint: "program.js",
          inputCodec: "input:v1",
          outputCodec: "output:v1",
        }),
      }
      expect(
        yield* executor
          .execute(candidate)
          .pipe(Effect.provideService(ProgramCapabilities.ProgramCapabilities, capabilities), Effect.flip),
      ).toBeInstanceOf(SandboxExecutor.SandboxSourceInvalid)
    }
    expect(loads).toBe(0)
  }),
)

it.effect("strict-decodes, authorizes, and bounds every capability RPC call", () =>
  Effect.gen(function* () {
    let rpc: CapabilityRpc | undefined
    const executor = make({
      compatibilityDate: "2026-08-19",
      capabilityBinding: (value) => {
        rpc = value
        return value
      },
      loader: {
        load: (code) => ({
          getEntrypoint: () => ({
            fetch: async () => {
              await expect(
                rpc!.call({
                  protocolVersion: "1",
                  requestId: "run-1:attempt-1",
                  operation: "describeTool",
                  input: "not-granted",
                }),
              ).rejects.toThrow("capability name denied")
              await expect(
                rpc!.call({
                  protocolVersion: "1",
                  requestId: "run-1:attempt-1",
                  operation: "describeTool",
                  input: "echo",
                }),
              ).rejects.toThrow(/^tenetkit-capability-failure:failure-\d+$/)
              const invalidCall = {
                protocolVersion: "1" as const,
                requestId: "run-1:attempt-1",
                operation: "callTool" as const,
                input: { operation: "echo", tool: "echo", input: "ok", unexpected: true },
              }
              await expect(rpc!.call(invalidCall)).rejects.toThrow("capability request invalid")
              expect(
                await rpc!.call({
                  protocolVersion: "1",
                  requestId: "run-1:attempt-1",
                  operation: "callTool",
                  input: { operation: "echo", tool: "echo", input: "ok" },
                }),
              ).toBe("ok")
              return Response.json({
                protocolVersion: "1",
                requestId: code.env.TENET_REQUEST_ID,
                sourceDigest: code.env.TENET_SOURCE_DIGEST,
                inputCodec: code.env.TENET_INPUT_CODEC,
                outputCodec: code.env.TENET_OUTPUT_CODEC,
                output: "done",
              })
            },
          }),
        }),
      },
    })
    expect(
      (yield* executor
        .execute({
          ...request(),
          capabilities: [
            { operation: "describeTool", names: ["echo"] },
            { operation: "callTool", names: ["echo"] },
          ],
        })
        .pipe(Effect.provideService(ProgramCapabilities.ProgramCapabilities, capabilities))).output,
    ).toBe("done")
  }),
)

it.effect("filters tool discovery to the explicit request grant", () =>
  Effect.gen(function* () {
    let rpc: CapabilityRpc | undefined
    const executor = make({
      compatibilityDate: "2026-08-19",
      capabilityBinding: (value) => {
        rpc = value
        return value
      },
      loader: {
        load: (code) => ({
          getEntrypoint: () => ({
            fetch: async () => {
              expect(
                await rpc!.call({
                  protocolVersion: "1",
                  requestId: "run-1:attempt-1",
                  operation: "discoverTools",
                }),
              ).toEqual([{ name: "allowed" }])
              return Response.json({
                protocolVersion: "1",
                requestId: code.env.TENET_REQUEST_ID,
                sourceDigest: code.env.TENET_SOURCE_DIGEST,
                inputCodec: code.env.TENET_INPUT_CODEC,
                outputCodec: code.env.TENET_OUTPUT_CODEC,
                output: "done",
              })
            },
          }),
        }),
      },
    })
    const discovered = ProgramCapabilities.ProgramCapabilities.of({
      ...capabilities,
      discoverTools: Effect.succeed([{ name: "allowed" }, { name: "hidden" }]),
    })
    yield* executor
      .execute({ ...request(), capabilities: [{ operation: "discoverTools", names: ["allowed"] }] })
      .pipe(Effect.provideService(ProgramCapabilities.ProgramCapabilities, discovered))
  }),
)

it.effect("returns only the causally linked uncaught host capability failure", () =>
  Effect.gen(function* () {
    const failures: ReadonlyArray<ProgramCapabilities.CapabilityFailure> = [
      ProgramCapabilities.ProgramSuspended.make({ operation: "echo", reason: "agent", token: "resume" }),
      ProgramCapabilities.ProgramCancelled.make({ reason: "cancelled" }),
      ProgramCapabilities.ProgramAuthorizationFailure.make({ capability: "echo", operation: "echo", cause: "denied" }),
      ProgramCapabilities.ProgramBudgetExhausted.make({ dimension: "toolCalls", limit: 1 }),
    ]
    for (const expected of failures) {
      let rpc: CapabilityRpc | undefined
      const executor = make({
        compatibilityDate: "2026-08-19",
        capabilityBinding: (value) => {
          rpc = value
          return value
        },
        loader: {
          load: () => ({
            getEntrypoint: () => ({
              fetch: async () => {
                let failureId: string
                try {
                  await rpc!.call({
                    protocolVersion: "1",
                    requestId: "run-1:attempt-1",
                    operation: "callTool",
                    input: { operation: "echo", tool: "echo", input: "value" },
                  })
                  throw new Error("expected capability failure")
                } catch (error) {
                  failureId = capabilityFailureId(Schema.decodeUnknownSync(Schema.instanceOf(Error))(error))
                }
                return Response.json(
                  { error: "sandbox execution failed", capabilityFailureId: failureId },
                  { status: 500 },
                )
              },
            }),
          }),
        },
      })
      const failing = ProgramCapabilities.ProgramCapabilities.of({
        ...capabilities,
        callTool: () => Effect.fail(expected),
      })
      expect(
        yield* executor
          .execute(request())
          .pipe(Effect.provideService(ProgramCapabilities.ProgramCapabilities, failing), Effect.flip),
      ).toEqual(expected)
    }
  }),
)

it.effect("does not misattribute a caught capability failure to a later source failure", () =>
  Effect.gen(function* () {
    let rpc: CapabilityRpc | undefined
    const expected = ProgramCapabilities.ProgramCancelled.make({ reason: "cancelled" })
    const executor = make({
      compatibilityDate: "2026-08-19",
      capabilityBinding: (value) => {
        rpc = value
        return value
      },
      loader: {
        load: () => ({
          getEntrypoint: () => ({
            fetch: async () => {
              await rpc!
                .call({
                  protocolVersion: "1",
                  requestId: "run-1:attempt-1",
                  operation: "callTool",
                  input: { operation: "echo", tool: "echo", input: "value" },
                })
                .catch((error) => capabilityFailureId(Schema.decodeUnknownSync(Schema.instanceOf(Error))(error)))
              return Response.json({ error: "sandbox execution failed" }, { status: 500 })
            },
          }),
        }),
      },
    })
    const failing = ProgramCapabilities.ProgramCapabilities.of({
      ...capabilities,
      callTool: () => Effect.fail(expected),
    })
    expect(
      yield* executor
        .execute(request())
        .pipe(Effect.provideService(ProgramCapabilities.ProgramCapabilities, failing), Effect.flip),
    ).toBeInstanceOf(SandboxExecutor.SandboxExecutionFailure)
  }),
)

it.effect("correlates concurrent capability failures by opaque call identity", () =>
  Effect.gen(function* () {
    let rpc: CapabilityRpc | undefined
    const first = ProgramCapabilities.ProgramCancelled.make({ reason: "first" })
    const second = ProgramCapabilities.ProgramBudgetExhausted.make({ dimension: "toolCalls", limit: 2 })
    const executor = make({
      compatibilityDate: "2026-08-19",
      capabilityBinding: (value) => {
        rpc = value
        return value
      },
      loader: {
        load: () => ({
          getEntrypoint: () => ({
            fetch: async () => {
              const outcomes = await Promise.allSettled(
                ["first", "second"].map((tool) =>
                  rpc!.call({
                    protocolVersion: "1",
                    requestId: "run-1:attempt-1",
                    operation: "callTool",
                    input: { operation: tool, tool, input: "value" },
                  }),
                ),
              )
              const selected = outcomes[1]
              if (selected?.status !== "rejected") throw new Error("expected second capability failure")
              return Response.json(
                {
                  error: "sandbox execution failed",
                  capabilityFailureId: capabilityFailureId(
                    Schema.decodeUnknownSync(Schema.instanceOf(Error))(selected.reason),
                  ),
                },
                { status: 500 },
              )
            },
          }),
        }),
      },
    })
    const failing = ProgramCapabilities.ProgramCapabilities.of({
      ...capabilities,
      callTool: (input) => Effect.fail(input.tool === "first" ? first : second),
    })
    expect(
      yield* executor
        .execute({ ...request(), capabilities: [{ operation: "callTool", names: ["first", "second"] }] })
        .pipe(Effect.provideService(ProgramCapabilities.ProgramCapabilities, failing), Effect.flip),
    ).toEqual(second)
  }),
)

it.effect("keeps the runner capability brand private from copied errors", () =>
  Effect.sync(() => {
    const generated = runner("program.js")
    expect(generated).toContain("const capabilityFailures = new WeakMap()")
    expect(generated).toContain("capabilityFailures.get(error)")
    expect(generated).not.toContain("error.message.startsWith(capabilityFailurePrefix)")
  }),
)

it.effect("does not consume a typed capability envelope for a non-500 response", () =>
  Effect.gen(function* () {
    let rpc: CapabilityRpc | undefined
    const expected = ProgramCapabilities.ProgramCancelled.make({ reason: "cancelled" })
    const executor = make({
      compatibilityDate: "2026-08-19",
      capabilityBinding: (value) => {
        rpc = value
        return value
      },
      loader: {
        load: () => ({
          getEntrypoint: () => ({
            fetch: async () => {
              let failureId: string
              try {
                await rpc!.call({
                  protocolVersion: "1",
                  requestId: "run-1:attempt-1",
                  operation: "callTool",
                  input: { operation: "echo", tool: "echo", input: "value" },
                })
                throw new Error("expected capability failure")
              } catch (error) {
                failureId = capabilityFailureId(Schema.decodeUnknownSync(Schema.instanceOf(Error))(error))
              }
              return Response.json(
                { error: "sandbox execution failed", capabilityFailureId: failureId },
                { status: 418 },
              )
            },
          }),
        }),
      },
    })
    const failing = ProgramCapabilities.ProgramCapabilities.of({
      ...capabilities,
      callTool: () => Effect.fail(expected),
    })
    expect(
      yield* executor
        .execute(request())
        .pipe(Effect.provideService(ProgramCapabilities.ProgramCapabilities, failing), Effect.flip),
    ).toBeInstanceOf(SandboxExecutor.SandboxExecutionFailure)
  }),
)

it.effect("streams output through the byte bound before decoding", () =>
  Effect.gen(function* () {
    const executor = make({
      compatibilityDate: "2026-08-19",
      capabilityBinding: (rpc) => rpc,
      loader: {
        load: () => ({
          getEntrypoint: () => ({ fetch: async () => new Response("x".repeat(2_000)) }),
        }),
      },
    })
    const failure = yield* executor
      .execute({ ...request(), limits: { cpuMillis: 50, subrequests: 3, outputBytes: 128 } })
      .pipe(Effect.provideService(ProgramCapabilities.ProgramCapabilities, capabilities), Effect.flip)
    expect(failure).toMatchObject({ _tag: "@tenetkit/core/SandboxResourceExceeded", resource: "output", limit: 128 })
  }),
)

it.effect("fences a late Worker response after cancellation", () =>
  Effect.gen(function* () {
    const controller = new AbortController()
    let complete!: (response: Response) => void
    const executor = make({
      compatibilityDate: "2026-08-19",
      capabilityBinding: (rpc) => rpc,
      loader: {
        load: () => ({
          getEntrypoint: () => ({
            fetch: () =>
              new Promise<Response>((resolve) => {
                complete = resolve
              }),
          }),
        }),
      },
    })
    const fiber = yield* executor
      .execute(request(controller.signal))
      .pipe(Effect.provideService(ProgramCapabilities.ProgramCapabilities, capabilities), Effect.forkChild)
    yield* Effect.yieldNow
    controller.abort()
    const failure = yield* Fiber.join(fiber).pipe(Effect.flip)
    expect(failure).toBeInstanceOf(SandboxExecutor.SandboxCancelled)
    complete(Response.json({ output: "late" }))
  }),
)

it.effect("fences cancellation and deadline while reading a delayed response body", () =>
  Effect.gen(function* () {
    const execute = (input: SandboxExecutor.Request, reading: () => void) =>
      make({
        compatibilityDate: "2026-08-19",
        capabilityBinding: (rpc) => rpc,
        loader: {
          load: () => ({
            getEntrypoint: () => ({
              fetch: async () =>
                new Response(
                  new ReadableStream<Uint8Array>({
                    pull: reading,
                  }),
                ),
            }),
          }),
        },
      })
        .execute(input)
        .pipe(Effect.provideService(ProgramCapabilities.ProgramCapabilities, capabilities))

    const controller = new AbortController()
    let bodyReading!: () => void
    const bodyStarted = new Promise<void>((resolve) => {
      bodyReading = resolve
    })
    const cancelled = yield* execute(request(controller.signal), bodyReading).pipe(Effect.forkChild)
    yield* Effect.promise(() => bodyStarted)
    controller.abort()
    expect(yield* Fiber.join(cancelled).pipe(Effect.flip)).toBeInstanceOf(SandboxExecutor.SandboxCancelled)

    let deadlineReading!: () => void
    const deadlineBodyStarted = new Promise<void>((resolve) => {
      deadlineReading = resolve
    })
    const deadline = yield* execute({ ...request(), deadlineMillis: Date.now() + 50 }, deadlineReading).pipe(
      Effect.forkChild,
    )
    yield* Effect.promise(() => deadlineBodyStarted)
    expect(yield* Fiber.join(deadline).pipe(Effect.flip)).toBeInstanceOf(SandboxExecutor.SandboxDeadlineExceeded)
  }),
)

it.effect("provides an explicit typed unavailable executor", () =>
  Effect.gen(function* () {
    const unavailable = makeUnavailable("feature disabled")
    expect(unavailable.identity).toMatchObject({ available: false })
    expect(
      yield* unavailable
        .execute(request())
        .pipe(Effect.flip, Effect.provideService(ProgramCapabilities.ProgramCapabilities, capabilities)),
    ).toMatchObject({
      _tag: "@tenetkit/core/SandboxUnavailable",
      message: "feature disabled",
    })
  }),
)

it.effect("turns hostile loader failures into bounded typed diagnostics", () =>
  Effect.gen(function* () {
    const hostile = new Proxy(new Error("hostile"), {
      getPrototypeOf: () => {
        throw new Error("prototype trap")
      },
      get: () => {
        throw new Error("property trap")
      },
    })
    const executor = make({
      compatibilityDate: "2026-08-19",
      capabilityBinding: (rpc) => rpc,
      loader: {
        load: () => {
          throw hostile
        },
      },
    })
    const failure = yield* executor
      .execute(request())
      .pipe(Effect.provideService(ProgramCapabilities.ProgramCapabilities, capabilities), Effect.flip)
    expect(failure).toBeInstanceOf(SandboxExecutor.SandboxExecutionFailure)
    expect(failure.message).toContain("uninspectable failure")
    expect(failure.message.length).toBeLessThan(220)
  }),
)

it.effect("redacts credentials from loader and fetch diagnostics before truncation", () =>
  Effect.gen(function* () {
    const diagnostic =
      "provider rejected Authorization: Bearer review-secret api_key=api-secret accessToken:'token-secret' client_secret=\"client-secret\" password=hunter2"
    const boundaries = [
      {
        load: () => {
          throw new Error(diagnostic)
        },
      },
      {
        load: () => ({
          getEntrypoint: () => ({
            fetch: async () => {
              throw new Error(diagnostic)
            },
          }),
        }),
      },
    ]
    for (const loader of boundaries) {
      const failure = yield* make({
        compatibilityDate: "2026-08-19",
        capabilityBinding: (rpc) => rpc,
        loader,
      })
        .execute(request())
        .pipe(Effect.provideService(ProgramCapabilities.ProgramCapabilities, capabilities), Effect.flip)
      expect(failure).toBeInstanceOf(SandboxExecutor.SandboxExecutionFailure)
      expect(failure.message).toContain("[REDACTED]")
      for (const secret of ["review-secret", "api-secret", "token-secret", "client-secret"]) {
        expect(failure.message).not.toContain(secret)
      }
      expect(failure.message.length).toBeLessThan(220)
    }
  }),
)
