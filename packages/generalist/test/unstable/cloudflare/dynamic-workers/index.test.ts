/* oxlint-disable effecttsgo/abort-controller-in-effect, effecttsgo/async-function, effecttsgo/new-promise, effecttsgo/prefer-schema-over-json, no-new-func */
import { expect, it } from "@effect/vitest"
import { Effect, Fiber, Schema } from "effect"
import { adjust as adjustTestClock } from "effect/testing/TestClock"
import { CodeExecutor, ProgramCapabilities } from "generalist"
import {
  make as makeAdapter,
  makeUnavailable,
  type CapabilityRpc,
  type Options,
  type WorkerCode,
} from "generalist/unstable/cloudflare/dynamic-workers"
import { makeWorkerLoaderProvider } from "generalist/unstable/sandbox/worker-loader"
import { runner } from "../../../../src/unstable/cloudflare/dynamic-workers/source.js"

const make = (options: Options) =>
  makeAdapter({ compatibilityDate: options.compatibilityDate, provider: makeWorkerLoaderProvider(options) })

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
  expect(message).toMatch(/^generalist-capability-failure:failure-\d+$/)
  return message.slice("generalist-capability-failure:".length)
}

const request = (signal = new AbortController().signal): CodeExecutor.Request => {
  const modules = [{ name: "program.js", source: "export default async input => ({ value: input.value + 1 })" }]
  const identity = { modules, entrypoint: "program.js", inputCodec: "input:v1", outputCodec: "output:v1" }
  return {
    protocolVersion: "1",
    requestId: "run-1:attempt-1",
    sourceDigest: CodeExecutor.sourceDigest(identity),
    ...identity,
    input: { value: 1 },
    signal,
    deadlineMillis: 10_000,
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
      mainModule: "__generalist_runner.js",
      globalOutbound: null,
      limits: { cpuMs: 50, subRequests: 3 },
    })
    expect(Object.keys(loaded[0]!.env).toSorted()).toEqual([
      "TENET_CAPABILITIES",
      "TENET_INPUT_CODEC",
      "TENET_OUTPUT_CODEC",
      "TENET_PROTOCOL_VERSION",
      "TENET_REQUEST_ID",
      "TENET_SOURCE_DIGEST",
    ])
    expect(loaded[0]!.modules["__generalist_runner.js"]).toContain("capabilityFailureId")
    expect(second.requestId).toBe(first.requestId)
  }),
)

it.effect("rejects every malformed or identity-mismatched Worker result as a protocol violation", () =>
  Effect.gen(function* () {
    const input = request()
    const exact = {
      protocolVersion: input.protocolVersion,
      requestId: input.requestId,
      sourceDigest: input.sourceDigest,
      inputCodec: input.inputCodec,
      outputCodec: input.outputCodec,
      output: null,
    }
    for (const malformed of [
      { ...exact, protocolVersion: "0" },
      { ...exact, requestId: "other" },
      { ...exact, sourceDigest: "other" },
      { ...exact, inputCodec: "other" },
      { ...exact, outputCodec: "other" },
      { ...exact, unexpected: true },
      { output: null },
    ]) {
      const executor = make({
        compatibilityDate: "2026-08-19",
        capabilityBinding: (rpc) => rpc,
        loader: {
          load: () => ({
            getEntrypoint: () => ({ fetch: async () => Response.json(malformed) }),
          }),
        },
      })
      expect(
        yield* executor
          .execute(input)
          .pipe(Effect.provideService(ProgramCapabilities.ProgramCapabilities, capabilities), Effect.flip),
      ).toBeInstanceOf(CodeExecutor.SandboxProtocolViolation)
    }
  }),
)

it.effect("rejects an unsupported admission limit before source normalization or Worker loading", () =>
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
    const failure = yield* executor
      .execute({
        ...request(),
        modules: [{ name: "program.js", source: "export default (" }],
        deadlineMillis: 2_147_493_647,
      })
      .pipe(Effect.provideService(ProgramCapabilities.ProgramCapabilities, capabilities), Effect.flip)
    expect(failure).toMatchObject({
      _tag: "generalist/core/SandboxGuaranteeUnavailable",
      guarantee: "deadlineMillis",
    })
    expect(loads).toBe(0)
  }),
)

it.effect("maps provider CPU and subrequest enforcement failures to exact request limits", () =>
  Effect.gen(function* () {
    for (const [message, resource, limit] of [
      ["CPU time limit exceeded", "cpu", 50],
      ["subrequest limit exceeded", "subrequests", 3],
    ] as const) {
      const executor = make({
        compatibilityDate: "2026-08-19",
        capabilityBinding: (rpc) => rpc,
        loader: {
          load: () => {
            throw new Error(message)
          },
        },
      })
      expect(
        yield* executor
          .execute(request())
          .pipe(Effect.provideService(ProgramCapabilities.ProgramCapabilities, capabilities), Effect.flip),
      ).toMatchObject({
        _tag: "generalist/core/SandboxResourceExceeded",
        resource,
        limit,
      })
    }
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
    expect(failure).toBeInstanceOf(CodeExecutor.SandboxSourceInvalid)
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
    const invalidModules: ReadonlyArray<ReadonlyArray<CodeExecutor.Module>> = [
      [{ name: "program.js", source: 'import "node:fs"; export default () => null' }],
      [
        {
          name: "program.js",
          source: 'const target = "../../../cloudflare/dynamic-workers/part.js"; export default () => import(target)',
        },
      ],
      [
        { name: "program.js", source: "export default () => null" },
        { name: "Program.js", source: "export default 1" },
      ],
      [{ name: "../../../cloudflare/program.js", source: "export default () => null" }],
      [{ name: "__generalist_runner.js", source: "export default () => null" }],
      [{ name: "__GENERALIST_RUNNER.JS", source: "export default () => null" }],
      [
        {
          name: "program.js",
          source: 'import "../../../cloudflare/dynamic-workers/__generalist_runner.js"; export default () => null',
        },
        { name: "__generalist_runner.js", source: "export default 1" },
      ],
    ]
    for (const modules of invalidModules) {
      const candidate = {
        ...request(),
        modules,
        sourceDigest: CodeExecutor.sourceDigest({
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
      ).toBeInstanceOf(CodeExecutor.SandboxSourceInvalid)
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
              ).rejects.toThrow(/^generalist-capability-failure:failure-\d+$/)
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
    ).toBeInstanceOf(CodeExecutor.SandboxExecutionFailure)
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
    ).toBeInstanceOf(CodeExecutor.SandboxExecutionFailure)
  }),
)

it.effect("streams output through the byte bound before decoding", () =>
  Effect.gen(function* () {
    const chunk = new TextEncoder().encode("x".repeat(64))
    let pulls = 0
    let cancelled = false
    const executor = make({
      compatibilityDate: "2026-08-19",
      capabilityBinding: (rpc) => rpc,
      loader: {
        load: () => ({
          getEntrypoint: () => ({
            fetch: async () =>
              new Response(
                new ReadableStream<Uint8Array>({
                  pull: (controller) => {
                    pulls += 1
                    controller.enqueue(chunk)
                  },
                  cancel: () => {
                    cancelled = true
                  },
                }),
              ),
          }),
        }),
      },
    })
    const failure = yield* executor
      .execute({ ...request(), limits: { cpuMillis: 50, subrequests: 3, outputBytes: 128 } })
      .pipe(Effect.provideService(ProgramCapabilities.ProgramCapabilities, capabilities), Effect.flip)
    expect(failure).toMatchObject({ _tag: "generalist/core/SandboxResourceExceeded", resource: "output", limit: 128 })
    expect(cancelled).toBe(true)
    expect(pulls).toBeLessThanOrEqual(4)
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
            fetch: (workerRequest) =>
              new Promise<Response>((resolve, reject) => {
                complete = resolve
                workerRequest.signal.addEventListener("abort", () => reject(new Error("Worker stopped")), {
                  once: true,
                })
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
    expect(failure).toBeInstanceOf(CodeExecutor.SandboxCancelled)
    complete(Response.json({ output: "late" }))
  }),
)

it.effect("returns cancellation when Worker fetch ignores abort forever", () =>
  Effect.gen(function* () {
    const controller = yield* Effect.sync(() => new AbortController())
    let started!: () => void
    const fetchStarted = new Promise<void>((resolve) => {
      started = resolve
    })
    const executor = make({
      compatibilityDate: "2026-08-19",
      capabilityBinding: (rpc) => rpc,
      loader: {
        load: () => ({
          getEntrypoint: () => ({
            fetch: () => {
              started()
              return new Promise<Response>(() => {
                // The Worker deliberately ignores cancellation.
              })
            },
          }),
        }),
      },
    })
    const fiber = yield* executor
      .execute(request(controller.signal))
      .pipe(Effect.provideService(ProgramCapabilities.ProgramCapabilities, capabilities), Effect.forkChild)
    yield* Effect.promise(() => fetchStarted)
    controller.abort()
    const failure = yield* Fiber.join(fiber).pipe(Effect.flip)
    expect(failure).toBeInstanceOf(CodeExecutor.SandboxCancelled)
  }),
)

it.effect("stops the Worker and closes host callbacks before Effect interruption returns", () =>
  Effect.gen(function* () {
    let rpc: CapabilityRpc | undefined
    let resolveStarted!: () => void
    const started = new Promise<void>((resolve) => {
      resolveStarted = resolve
    })
    let workerStopped = false
    let hostCalls = 0
    const observed = ProgramCapabilities.ProgramCapabilities.of({
      ...capabilities,
      callTool: (input) =>
        Effect.sync(() => {
          hostCalls += 1
          return input.input
        }),
    })
    const executor = make({
      compatibilityDate: "2026-08-19",
      capabilityBinding: (value) => {
        rpc = value
        return value
      },
      loader: {
        load: () => ({
          getEntrypoint: () => ({
            fetch: (workerRequest) =>
              new Promise<Response>((_resolve, reject) => {
                resolveStarted()
                workerRequest.signal.addEventListener(
                  "abort",
                  () => {
                    workerStopped = true
                    reject(new Error("Worker stopped"))
                  },
                  { once: true },
                )
              }),
          }),
        }),
      },
    })
    const fiber = yield* executor
      .execute(request())
      .pipe(Effect.provideService(ProgramCapabilities.ProgramCapabilities, observed), Effect.forkChild)
    yield* Effect.promise(() => started)
    yield* Fiber.interrupt(fiber)
    expect(workerStopped).toBe(true)

    const denied = yield* Effect.promise(async () => {
      try {
        await rpc!.call({
          protocolVersion: "1",
          requestId: "run-1:attempt-1",
          operation: "callTool",
          input: { operation: "late", tool: "echo", input: null },
        })
        return false
      } catch {
        return true
      }
    })
    expect(denied).toBe(true)
    expect(hostCalls).toBe(0)
  }),
)

it.effect("interrupts an active host capability before returning and rejects later calls", () =>
  Effect.gen(function* () {
    const controller = new AbortController()
    let rpc: CapabilityRpc | undefined
    let resolveStarted!: () => void
    const started = new Promise<void>((resolve) => {
      resolveStarted = resolve
    })
    let interrupted = false
    let hostCalls = 0
    const blocking = ProgramCapabilities.ProgramCapabilities.of({
      ...capabilities,
      callTool: () =>
        Effect.sync(() => {
          hostCalls += 1
          resolveStarted()
        }).pipe(
          Effect.andThen(Effect.never),
          Effect.onInterrupt(() =>
            Effect.sync(() => {
              interrupted = true
            }),
          ),
        ),
    })
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
              await code.env.TENET_CAPABILITIES.call({
                protocolVersion: "1",
                requestId: "run-1:attempt-1",
                operation: "callTool",
                input: { operation: "blocked", tool: "echo", input: null },
              })
              return new Response("unreachable")
            },
          }),
        }),
      },
    })
    const fiber = yield* executor
      .execute(request(controller.signal))
      .pipe(Effect.provideService(ProgramCapabilities.ProgramCapabilities, blocking), Effect.forkChild)
    yield* Effect.promise(() => started)
    controller.abort()
    expect(yield* Fiber.join(fiber).pipe(Effect.flip)).toBeInstanceOf(CodeExecutor.SandboxCancelled)
    expect(interrupted).toBe(true)
    expect(hostCalls).toBe(1)

    const denied = yield* Effect.promise(async () => {
      try {
        await rpc!.call({
          protocolVersion: "1",
          requestId: "run-1:attempt-1",
          operation: "callTool",
          input: { operation: "late", tool: "echo", input: null },
        })
        return false
      } catch {
        return true
      }
    })
    expect(denied).toBe(true)
    expect(hostCalls).toBe(1)
  }),
)

it.effect("fences cancellation and deadline while reading a delayed response body", () =>
  Effect.gen(function* () {
    const execute = (input: CodeExecutor.Request, reading: () => void, cancelled: () => void) =>
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
                    cancel: cancelled,
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
    let cancelledBody = false
    const cancelled = yield* execute(request(controller.signal), bodyReading, () => {
      cancelledBody = true
    }).pipe(Effect.forkChild)
    yield* Effect.promise(() => bodyStarted)
    yield* Effect.yieldNow
    controller.abort()
    expect(yield* Fiber.join(cancelled).pipe(Effect.flip)).toBeInstanceOf(CodeExecutor.SandboxCancelled)
    expect(cancelledBody).toBe(true)

    let deadlineReading!: () => void
    const deadlineBodyStarted = new Promise<void>((resolve) => {
      deadlineReading = resolve
    })
    let deadlineBodyCancelled = false
    const deadline = yield* execute({ ...request(), deadlineMillis: 50 }, deadlineReading, () => {
      deadlineBodyCancelled = true
    }).pipe(Effect.forkChild)
    yield* Effect.promise(() => deadlineBodyStarted)
    yield* adjustTestClock(50)
    expect(yield* Fiber.join(deadline).pipe(Effect.flip)).toBeInstanceOf(CodeExecutor.SandboxDeadlineExceeded)
    expect(deadlineBodyCancelled).toBe(true)
  }),
)

it.effect("provides an explicit typed unavailable executor", () =>
  Effect.gen(function* () {
    const unavailable = makeUnavailable("feature disabled")
    expect(unavailable.identity).toMatchObject({ physicalIsolation: "none", persistence: "none" })
    expect(
      yield* unavailable
        .execute(request())
        .pipe(Effect.flip, Effect.provideService(ProgramCapabilities.ProgramCapabilities, capabilities)),
    ).toMatchObject({
      _tag: "generalist/core/SandboxUnavailable",
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
    expect(failure).toBeInstanceOf(CodeExecutor.SandboxExecutionFailure)
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
      expect(failure).toBeInstanceOf(CodeExecutor.SandboxExecutionFailure)
      expect(failure.message).toContain("[REDACTED]")
      for (const secret of ["review-secret", "api-secret", "token-secret", "client-secret"]) {
        expect(failure.message).not.toContain(secret)
      }
      expect(failure.message.length).toBeLessThan(220)
    }
  }),
)
