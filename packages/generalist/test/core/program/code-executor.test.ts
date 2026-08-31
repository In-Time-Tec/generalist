import { expect, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { CodeExecutor, ProgramCapabilities } from "../../../src/index.js"

const capabilities = ProgramCapabilities.ProgramCapabilities.of({
  discoverTools: Effect.die("unused"),
  describeTool: () => Effect.die("unused"),
  callTool: () => Effect.die("unused"),
  callStep: () => Effect.die("unused"),
  runAgent: () => Effect.die("unused"),
  mapAgents: () => Effect.die("unused"),
  fanOutAgents: () => Effect.die("unused"),
  log: () => Effect.die("unused"),
})

const request = (overrides: Partial<CodeExecutor.Request> = {}): CodeExecutor.Request => {
  const modules = [{ name: "program.js", source: "export default input => input" }]
  const source = {
    modules,
    entrypoint: "program.js",
    inputCodec: "input:v1",
    outputCodec: "output:v1",
  }
  return {
    protocolVersion: CodeExecutor.protocolVersion,
    requestId: "run-1:attempt-1",
    sourceDigest: CodeExecutor.sourceDigest(source),
    ...source,
    input: { value: 1 },
    signal: new AbortController().signal,
    deadlineMillis: 11_000,
    limits: { cpuMillis: 50, subrequests: 3, outputBytes: 1_024 },
    capabilities: [{ operation: "callTool", names: ["echo"] }],
    ...overrides,
  }
}

const enforcedIdentity = (overrides: Partial<CodeExecutor.Identity> = {}): CodeExecutor.Identity =>
  CodeExecutor.declareIdentity({
    provider: "fixture-provider",
    implementation: { name: "fixture-executor", version: "1" },
    runtime: { name: "fixture-runtime", version: "2026-08-29" },
    template: { name: "fixture-template", version: "1" },
    physicalIsolation: "microvm",
    persistence: "fresh-per-execution",
    network: {
      posture: "default-deny",
      enforcement: { status: "enforced", by: "provider", mechanism: "network namespace" },
    },
    limits: {
      deadlineMillis: {
        status: "enforced",
        by: "adapter",
        mechanism: "deadline timer",
        maximum: 10_000,
      },
      cpuMillis: { status: "enforced", by: "provider", mechanism: "CPU quota", maximum: 1_000 },
      subrequests: { status: "enforced", by: "adapter", mechanism: "request counter", maximum: 100 },
      outputBytes: { status: "enforced", by: "adapter", mechanism: "stream byte counter", maximum: 1_000_000 },
      filesystem: { status: "enforced", by: "runtime", mechanism: "no filesystem mount" },
      processes: { status: "enforced", by: "runtime", mechanism: "no process API" },
    },
    knownLimitations: ["Fixture identity; no vendor isolation claim."],
    ...overrides,
  })

it.effect("constructs the canonical request and trusted exact result envelope", () =>
  Effect.gen(function* () {
    const signal = yield* Effect.abortSignal
    const normalized = CodeExecutor.makeRequest({
      requestId: "run-1",
      source: "export default input => input",
      inputCodec: "input:v1",
      outputCodec: "output:v1",
      encodedInput: { value: 1 },
      signal,
      nowMillis: 1_000,
      wallTimeMillis: 500,
      outputBytes: 1_024,
      toolCalls: 2,
      agentRuns: 3,
      tools: ["echo"],
      steps: ["shape"],
      agents: ["worker"],
    })
    expect(normalized.deadlineMillis).toBe(1_500)
    expect(normalized.limits).toEqual({ cpuMillis: 500, subrequests: 5, outputBytes: 1_024 })
    expect(normalized.capabilities.find((grant) => grant.operation === "callTool")?.names).toEqual(["echo"])

    const executor = CodeExecutor.makeTest(() => Effect.succeed({ value: 2 }))
    expect(executor.identity).toBe(CodeExecutor.testIdentity)
    const result = yield* executor
      .execute(normalized)
      .pipe(Effect.provideService(ProgramCapabilities.ProgramCapabilities, capabilities))
    expect(result).toEqual({
      protocolVersion: normalized.protocolVersion,
      requestId: normalized.requestId,
      sourceDigest: normalized.sourceDigest,
      inputCodec: normalized.inputCodec,
      outputCodec: normalized.outputCodec,
      output: { value: 2 },
    })
  }),
)

it("persists immutable bounded identity facts without free-form fields", () => {
  const identity = enforcedIdentity()
  const encoded = Schema.encodeSync(CodeExecutor.Identity)(identity)
  expect(Schema.decodeSync(CodeExecutor.Identity, { onExcessProperty: "error" })(encoded)).toEqual(identity)
  expect(enforcedIdentity({ physicalIsolation: "sidecar-process-v8-isolate" }).physicalIsolation).toBe(
    "sidecar-process-v8-isolate",
  )
  expect(() =>
    Schema.decodeUnknownSync(CodeExecutor.Identity, { onExcessProperty: "error" })({
      ...encoded,
      physicalIsolation: "in-process-v8-wasm",
    }),
  ).toThrow()
  expect(Object.isFrozen(identity)).toBe(true)
  expect(Object.isFrozen(identity.limits)).toBe(true)
  expect(Object.isFrozen(identity.knownLimitations)).toBe(true)
  expect(() =>
    Schema.decodeUnknownSync(CodeExecutor.Identity, { onExcessProperty: "error" })({
      ...encoded,
      secure: true,
    }),
  ).toThrow()
})

it.effect("admits only fresh isolated requests whose exact guarantees are enforced", () =>
  Effect.gen(function* () {
    yield* CodeExecutor.admit(enforcedIdentity(), request(), 1_000)
    yield* CodeExecutor.admit(enforcedIdentity({ physicalIsolation: "sidecar-process-v8-isolate" }), request(), 1_000)

    const trusted = yield* CodeExecutor.admit(CodeExecutor.testIdentity, request(), 1_000).pipe(Effect.flip)
    expect(trusted).toMatchObject({
      _tag: "generalist/core/SandboxGuaranteeUnavailable",
      guarantee: "physicalIsolation",
    })

    const identity = enforcedIdentity({
      limits: {
        ...enforcedIdentity().limits,
        cpuMillis: { status: "unenforced", reason: "fixture has no CPU governor" },
      },
    })
    const unsupported = yield* CodeExecutor.admit(identity, request(), 1_000).pipe(Effect.flip)
    expect(unsupported).toMatchObject({ guarantee: "cpuMillis", message: "fixture has no CPU governor" })

    const oversized = yield* CodeExecutor.admit(
      enforcedIdentity(),
      request({ limits: { cpuMillis: 1_001, subrequests: 3, outputBytes: 1_024 } }),
      1_000,
    ).pipe(Effect.flip)
    expect(oversized).toMatchObject({ guarantee: "cpuMillis" })
  }),
)

it.effect("strictly rejects malformed and mismatched result envelopes", () =>
  Effect.gen(function* () {
    const input = request()
    const exact = {
      protocolVersion: input.protocolVersion,
      requestId: input.requestId,
      sourceDigest: input.sourceDigest,
      inputCodec: input.inputCodec,
      outputCodec: input.outputCodec,
      output: { value: 2 },
    } satisfies CodeExecutor.Result
    expect(yield* CodeExecutor.validateResult(input, exact)).toEqual(exact)

    for (const malformed of [
      { ...exact, protocolVersion: "0" },
      { ...exact, requestId: "other" },
      { ...exact, sourceDigest: "other" },
      { ...exact, inputCodec: "other" },
      { ...exact, outputCodec: "other" },
      { ...exact, unexpected: true },
      { output: null },
    ]) {
      expect(yield* CodeExecutor.validateResult(input, malformed).pipe(Effect.flip)).toBeInstanceOf(
        CodeExecutor.SandboxProtocolViolation,
      )
    }
  }),
)
